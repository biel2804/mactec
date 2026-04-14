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
const SESSION_TTL_MINUTES = 15;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OTP_SECRET = Deno.env.get("OTP_SECRET") ?? "changeme";
const EMAIL_PROVIDER_API_KEY = Deno.env.get("EMAIL_PROVIDER_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "";
const EMAIL_PROVIDER = (Deno.env.get("EMAIL_PROVIDER") ?? "resend").toLowerCase();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

type VerificationAction = "start_verification" | "resend_code" | "verify_code";
type VerificationContext = "existing_customer" | "new_customer";

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

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function maskEmail(email: string) {
  const [localRaw, domainRaw] = String(email || "").trim().toLowerCase().split("@");
  if (!localRaw || !domainRaw) return "e***@***";

  const local = localRaw.length <= 2
    ? `${localRaw.slice(0, 1)}*`
    : `${localRaw.slice(0, 2)}${"*".repeat(Math.max(1, localRaw.length - 2))}`;

  const domainParts = domainRaw.split(".");
  const domainName = domainParts.shift() || "";
  const tld = domainParts.join(".");
  const maskedDomainName = domainName.length <= 1
    ? "*"
    : `${domainName.slice(0, 1)}${"*".repeat(Math.max(1, domainName.length - 1))}`;

  return `${local}@${maskedDomainName}${tld ? `.${tld}` : ""}`;
}

function generateOtpCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 1000000).padStart(6, "0");
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

async function sendVerificationCodeByEmail(payload: { email: string; code: string }) {
  const { email, code } = payload;

  if (!EMAIL_PROVIDER_API_KEY || !EMAIL_FROM || EMAIL_PROVIDER === "mock") {
    console.log(`[OTP mock] email=${maskEmail(email)} code=${code}`);
    return;
  }

  if (EMAIL_PROVIDER !== "resend") {
    throw new Error("EMAIL_PROVIDER não suportado. Use resend ou mock.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMAIL_PROVIDER_API_KEY}`
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [email],
      subject: "Seu código de verificação - MacTec Support",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111">
          <p>Seu código de verificação é:</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p>
          <p>Esse código expira em ${OTP_TTL_MINUTES} minutos.</p>
          <p>Se você não solicitou, ignore este e-mail.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    console.error("Falha ao enviar e-mail OTP", { status: response.status, body: errorBody.slice(0, 500) });
    throw new Error("Falha ao enviar código por e-mail.");
  }
}

async function resolveVerificationTarget(body: Record<string, unknown>) {
  const phone = normalizePhone(body.phone);
  const context = String(body.context ?? "existing_customer").toLowerCase() as VerificationContext;

  if (!isValidPhone(phone)) {
    return { error: jsonResponse({ error: "Telefone inválido." }, 400) };
  }

  if (![
    "existing_customer",
    "new_customer"
  ].includes(context)) {
    return { error: jsonResponse({ error: "Contexto inválido." }, 400) };
  }

  if (context === "existing_customer") {
    const { data: customer, error } = await admin
      .from("clientes")
      .select("id, email")
      .eq("telefone_normalizado", phone)
      .maybeSingle();

    if (error) return { error: jsonResponse({ error: "Falha ao localizar cliente." }, 500) };
    if (!customer) return { error: jsonResponse({ error: "Cadastro não encontrado para o telefone informado." }, 404) };

    const email = String(customer.email ?? "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return { error: jsonResponse({ error: "Seu cadastro não possui e-mail válido. Atualize seu e-mail para continuar." }, 400) };
    }

    return {
      phone,
      context,
      email,
      maskedEmail: maskEmail(email),
      customerId: customer.id ?? null
    };
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();

  if (!name) {
    return { error: jsonResponse({ error: "Nome é obrigatório para novo cadastro." }, 400) };
  }

  if (!isValidEmail(email)) {
    return { error: jsonResponse({ error: "Informe um e-mail válido." }, 400) };
  }

  return {
    phone,
    context,
    email,
    maskedEmail: maskEmail(email),
    customerId: null
  };
}

async function enforceCooldown(phone: string) {
  const { data: latestCode, error } = await admin
    .from("customer_verification_codes")
    .select("id, created_at")
    .eq("telefone_normalizado", phone)
    .is("used_at", null)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { error: jsonResponse({ error: "Falha ao validar cooldown de envio." }, 500) };
  }

  if (latestCode?.created_at) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(latestCode.created_at).getTime()) / 1000);
    if (elapsedSeconds < OTP_COOLDOWN_SECONDS) {
      return {
        error: jsonResponse({
          error: `Aguarde ${OTP_COOLDOWN_SECONDS - elapsedSeconds}s para reenviar o código.`,
          code: "cooldown"
        }, 429)
      };
    }
  }

  return {};
}

async function issueVerificationCode(target: {
  phone: string;
  email: string;
  maskedEmail: string;
  context: VerificationContext;
  customerId: number | null;
}) {
  const nowIso = new Date().toISOString();

  await admin
    .from("customer_verification_codes")
    .update({ invalidated_at: nowIso })
    .eq("telefone_normalizado", target.phone)
    .is("used_at", null)
    .is("invalidated_at", null);

  const code = generateOtpCode();
  const codeHash = await hashOtp(target.phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: insertError } = await admin
    .from("customer_verification_codes")
    .insert({
      telefone_normalizado: target.phone,
      codigo_hash: codeHash,
      verification_email: target.email,
      email_masked: target.maskedEmail,
      context: target.context,
      customer_id: target.customerId,
      expires_at: expiresAt,
      attempt_count: 0,
      attempts: 0
    });

  if (insertError) {
    console.error("Falha ao registrar OTP", insertError);
    return jsonResponse({ error: "Falha ao registrar código de verificação." }, 500);
  }

  await sendVerificationCodeByEmail({ email: target.email, code });

  return jsonResponse({
    success: true,
    message: "Enviamos um código para seu e-mail.",
    masked_email: target.maskedEmail,
    cooldown_seconds: OTP_COOLDOWN_SECONDS,
    expires_in_seconds: OTP_TTL_MINUTES * 60
  });
}

async function handleStartVerification(body: Record<string, unknown>) {
  const target = await resolveVerificationTarget(body);
  if ("error" in target && target.error) return target.error;

  const cooldown = await enforceCooldown(target.phone);
  if ("error" in cooldown && cooldown.error) return cooldown.error;

  return await issueVerificationCode(target);
}

async function handleResendCode(body: Record<string, unknown>) {
  const target = await resolveVerificationTarget(body);
  if ("error" in target && target.error) return target.error;

  const cooldown = await enforceCooldown(target.phone);
  if ("error" in cooldown && cooldown.error) return cooldown.error;

  return await issueVerificationCode(target);
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
    .select("id, codigo_hash, attempt_count, attempts, expires_at, used_at, invalidated_at, context")
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

  const currentAttempts = Number(latestCode.attempt_count ?? latestCode.attempts ?? 0);
  if (currentAttempts >= OTP_MAX_ATTEMPTS) {
    return jsonResponse({ error: "Você excedeu o limite de tentativas.", code: "max_attempts" }, 429);
  }

  const receivedHash = await hashOtp(phone, code);
  const isValid = timingSafeEqual(receivedHash, String(latestCode.codigo_hash));

  if (!isValid) {
    const nextAttempts = currentAttempts + 1;
    await admin
      .from("customer_verification_codes")
      .update({ attempt_count: nextAttempts, attempts: nextAttempts })
      .eq("id", latestCode.id);

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
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

  await admin
    .from("customer_verification_sessions")
    .delete()
    .eq("telefone_normalizado", phone);

  await admin.from("customer_verification_sessions").insert({
    telefone_normalizado: phone,
    session_token_hash: sessionTokenHash,
    expires_at: sessionExpiresAt,
    context: String(latestCode.context ?? "existing_customer")
  });

  const { data: customer, error: customerError } = await admin
    .from("clientes")
    .select("id, nome, telefone, telefone_normalizado, email, cep, rua, numero, bairro, cidade, estado, endereco")
    .eq("telefone_normalizado", phone)
    .maybeSingle();

  if (customerError) {
    console.error("Falha ao carregar cliente pós-validação", customerError);
  }

  return jsonResponse({
    success: true,
    message: "Código validado com sucesso.",
    verified_session_token: sessionToken,
    verified_session_expires_at: sessionExpiresAt,
    customer: customer || null
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
    const rawAction = String(body.action ?? "").toLowerCase();

    const actionMap: Record<string, VerificationAction> = {
      start_verification: "start_verification",
      resend_code: "resend_code",
      verify_code: "verify_code",
      send: "start_verification",
      verify: "verify_code"
    };

    const action = actionMap[rawAction];

    if (action === "start_verification") {
      return await handleStartVerification(body);
    }

    if (action === "resend_code") {
      return await handleResendCode(body);
    }

    if (action === "verify_code") {
      return await handleVerifyCode(body);
    }

    return jsonResponse({ error: "Ação inválida. Use start_verification, resend_code ou verify_code." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return jsonResponse({ error: message }, 500);
  }
});
