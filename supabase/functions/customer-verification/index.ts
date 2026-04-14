import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const OTP_TTL_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OTP_SECRET = Deno.env.get("OTP_SECRET") ?? "changeme";
const OTP_PROVIDER = (Deno.env.get("OTP_PROVIDER") ?? "mock").toLowerCase();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return digits.slice(2);
  }
  return digits;
}

function isValidPhone(value: string) {
  return /^\d{11}$/.test(value);
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function sha256(input: string) {
  const payload = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashOtp(phone: string, code: string) {
  return sha256(`${OTP_SECRET}:${phone}:${code}`);
}

async function hashSessionToken(phone: string, token: string) {
  return sha256(`${OTP_SECRET}:session:${phone}:${token}`);
}

async function sendVerificationCode(payload: { phone: string; channel: "whatsapp" | "sms"; code: string }) {
  const { phone, channel, code } = payload;
  if (OTP_PROVIDER === "mock") {
    console.log(`[OTP mock] channel=${channel} phone=${phone} code=${code}`);
    return;
  }

  // TODO: plugar provedor real (Twilio, Z-API, Gupshup etc.)
  // eslint-disable-next-line no-console
  console.log(`[OTP provider=${OTP_PROVIDER}] envio pendente para ${channel}:${phone} código ${code}`);
}

async function handleSendCode(body: Record<string, unknown>) {
  const phone = normalizePhone(body.phone);
  const channel = String(body.channel ?? "whatsapp").toLowerCase() as "whatsapp" | "sms";

  if (!isValidPhone(phone)) {
    return jsonResponse({ error: "Telefone inválido." }, 400);
  }
  if (!["whatsapp", "sms"].includes(channel)) {
    return jsonResponse({ error: "Canal inválido. Use whatsapp ou sms." }, 400);
  }

  const { data: customer, error: customerError } = await admin
    .from("clientes")
    .select("id")
    .eq("telefone_normalizado", phone)
    .maybeSingle();

  if (customerError) {
    return jsonResponse({ error: "Falha ao localizar cliente." }, 500);
  }
  if (!customer) {
    return jsonResponse({ error: "Cadastro não encontrado para o telefone informado." }, 404);
  }

  const { data: latestCode, error: latestCodeError } = await admin
    .from("customer_verification_codes")
    .select("id, created_at")
    .eq("telefone_normalizado", phone)
    .is("used_at", null)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCodeError) {
    return jsonResponse({ error: "Falha ao validar cooldown de envio." }, 500);
  }

  if (latestCode?.created_at) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(latestCode.created_at).getTime()) / 1000);
    if (elapsedSeconds < OTP_COOLDOWN_SECONDS) {
      return jsonResponse({
        error: `Aguarde ${OTP_COOLDOWN_SECONDS - elapsedSeconds}s para reenviar o código.`,
        code: "cooldown"
      }, 429);
    }
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("customer_verification_codes")
    .update({ invalidated_at: nowIso })
    .eq("telefone_normalizado", phone)
    .is("used_at", null)
    .is("invalidated_at", null);

  const code = generateOtpCode();
  const codeHash = await hashOtp(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await admin
    .from("customer_verification_codes")
    .insert({
      telefone_normalizado: phone,
      codigo_hash: codeHash,
      channel,
      expires_at: expiresAt,
      attempts: 0
    });

  if (insertError) {
    return jsonResponse({ error: "Falha ao registrar código de verificação." }, 500);
  }

  await sendVerificationCode({ phone, channel, code });

  return jsonResponse({
    success: true,
    message: "Enviamos um código para seu telefone.",
    cooldown_seconds: OTP_COOLDOWN_SECONDS,
    expires_in_seconds: OTP_TTL_MINUTES * 60
  });
}

async function handleVerifyCode(body: Record<string, unknown>) {
  const phone = normalizePhone(body.phone);
  const code = String(body.code ?? "").replace(/\D/g, "");

  if (!isValidPhone(phone)) {
    return jsonResponse({ error: "Telefone inválido." }, 400);
  }
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ error: "Código inválido." }, 400);
  }

  const { data: latestCode, error: latestCodeError } = await admin
    .from("customer_verification_codes")
    .select("id, codigo_hash, attempts, expires_at, used_at, invalidated_at")
    .eq("telefone_normalizado", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCodeError) {
    return jsonResponse({ error: "Falha ao validar código." }, 500);
  }

  if (!latestCode || latestCode.used_at || latestCode.invalidated_at) {
    return jsonResponse({ error: "Solicite um novo código para continuar.", code: "missing_code" }, 400);
  }

  if (new Date(latestCode.expires_at).getTime() <= Date.now()) {
    return jsonResponse({ error: "Código expirado. Solicite um novo.", code: "expired" }, 410);
  }

  if ((latestCode.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return jsonResponse({ error: "Você excedeu o limite de tentativas.", code: "max_attempts" }, 429);
  }

  const receivedHash = await hashOtp(phone, code);
  const isValid = timingSafeEqual(receivedHash, String(latestCode.codigo_hash));

  if (!isValid) {
    const nextAttempts = (latestCode.attempts ?? 0) + 1;
    await admin.from("customer_verification_codes").update({ attempts: nextAttempts }).eq("id", latestCode.id);

    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      return jsonResponse({ error: "Você excedeu o limite de tentativas.", code: "max_attempts" }, 429);
    }
    return jsonResponse({
      error: "Código inválido.",
      code: "invalid_code",
      remaining_attempts: OTP_MAX_ATTEMPTS - nextAttempts
    }, 400);
  }

  await admin.from("customer_verification_codes").update({ used_at: new Date().toISOString() }).eq("id", latestCode.id);

  const sessionToken = crypto.randomUUID();
  const sessionTokenHash = await hashSessionToken(phone, sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await admin
    .from("customer_verification_sessions")
    .delete()
    .eq("telefone_normalizado", phone);

  await admin.from("customer_verification_sessions").insert({
    telefone_normalizado: phone,
    session_token_hash: sessionTokenHash,
    expires_at: sessionExpiresAt
  });

  const { data: customer, error: customerError } = await admin
    .from("clientes")
    .select("id, nome, telefone, telefone_normalizado, email, cep, rua, numero, bairro, cidade, estado, endereco")
    .eq("telefone_normalizado", phone)
    .maybeSingle();

  if (customerError || !customer) {
    return jsonResponse({ error: "Código validado, mas não foi possível carregar os dados do cliente." }, 500);
  }

  return jsonResponse({
    success: true,
    message: "Código validado com sucesso.",
    verified_session_token: sessionToken,
    verified_session_expires_at: sessionExpiresAt,
    customer
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "").toLowerCase();

    if (action === "send") {
      return await handleSendCode(body);
    }

    if (action === "verify") {
      return await handleVerifyCode(body);
    }

    return jsonResponse({ error: "Ação inválida. Use send ou verify." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return jsonResponse({ error: message }, 500);
  }
});
