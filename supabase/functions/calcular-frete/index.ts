import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ORIGEM = {
  lat: Number(Deno.env.get("LOJA_LAT") ?? -23.7),
  lon: Number(Deno.env.get("LOJA_LON") ?? -46.55)
};

const VALOR_POR_KM = Number(Deno.env.get("FRETE_VALOR_POR_KM") ?? 2.5);
const FRETE_MINIMO = Number(Deno.env.get("FRETE_MINIMO") ?? 15);
const GEOCODING_API_KEY = Deno.env.get("GEOCODING_API_KEY") ?? "";
const GEOCODING_API_URL = Deno.env.get("GEOCODING_API_URL") ?? "https://api.opencagedata.com/geocode/v1/json";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json"
    }
  });
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function calculateFreight(distanceKm: number) {
  const raw = distanceKm * VALOR_POR_KM;
  const withMinimum = Math.max(raw, FRETE_MINIMO);
  return Number(withMinimum.toFixed(2));
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 7000, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCepData(cepDigits: string) {
  const errors: string[] = [];

  try {
    const viaCep = await fetchJsonWithTimeout(`https://viacep.com.br/ws/${cepDigits}/json/`);
    if (viaCep.response.ok && !viaCep.payload?.erro) {
      return {
        cep: cepDigits,
        logradouro: viaCep.payload?.logradouro ?? "",
        bairro: viaCep.payload?.bairro ?? "",
        localidade: viaCep.payload?.localidade ?? "",
        uf: viaCep.payload?.uf ?? ""
      };
    }
    errors.push(`ViaCEP status ${viaCep.response.status}`);
  } catch (error) {
    errors.push(`ViaCEP falhou: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const brasilApi = await fetchJsonWithTimeout(`https://brasilapi.com.br/api/cep/v1/${cepDigits}`);
    if (brasilApi.response.ok) {
      return {
        cep: cepDigits,
        logradouro: brasilApi.payload?.street ?? "",
        bairro: brasilApi.payload?.neighborhood ?? "",
        localidade: brasilApi.payload?.city ?? "",
        uf: brasilApi.payload?.state ?? ""
      };
    }
    errors.push(`BrasilAPI status ${brasilApi.response.status}`);
  } catch (error) {
    errors.push(`BrasilAPI falhou: ${error instanceof Error ? error.message : String(error)}`);
  }

  throw new Error(`Não foi possível consultar CEP (${errors.join(" | ")})`);
}

async function geocodeWithPrimaryProvider(enderecoTexto: string) {
  if (!GEOCODING_API_KEY) {
    throw new Error("GEOCODING_API_KEY não configurada no backend.");
  }

  const geocodingUrl = `${GEOCODING_API_URL}?q=${encodeURIComponent(enderecoTexto)}&key=${encodeURIComponent(GEOCODING_API_KEY)}&limit=1&language=pt-BR`;
  const geocodingResponse = await fetch(geocodingUrl);
  if (!geocodingResponse.ok) {
    throw new Error(`Geocoding primário indisponível (status ${geocodingResponse.status}).`);
  }

  const geocodingPayload = await geocodingResponse.json();
  const destination = geocodingPayload?.results?.[0]?.geometry;
  const lat = Number(destination?.lat);
  const lon = Number(destination?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Geocoding primário não retornou coordenadas válidas.");
  }

  return { lat, lon, provider: "primary" };
}

async function geocodeWithFallback(enderecoTexto: string) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(enderecoTexto)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "mactec-frete/1.0" }
  });
  if (!response.ok) {
    throw new Error(`Geocoding fallback indisponível (status ${response.status}).`);
  }

  const payload = await response.json();
  const first = Array.isArray(payload) ? payload[0] : null;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Geocoding fallback não retornou coordenadas válidas.");
  }

  return { lat, lon, provider: "fallback_nominatim" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    const { cep } = await req.json().catch(() => ({}));
    const cepDigits = String(cep ?? "").replace(/\D/g, "");

    if (cepDigits.length !== 8) {
      return jsonResponse({ error: "CEP inválido." }, 400);
    }

    const viaCep = await fetchCepData(cepDigits);

    const enderecoTexto = [
      viaCep.logradouro,
      viaCep.bairro,
      `${viaCep.localidade}-${viaCep.uf}`,
      cepDigits
    ].filter(Boolean).join(", ");

    let geocoding;
    let warning = "";
    try {
      geocoding = await geocodeWithPrimaryProvider(enderecoTexto);
    } catch (primaryError) {
      warning = primaryError instanceof Error ? primaryError.message : "Falha no geocoding primário.";
      geocoding = await geocodeWithFallback(enderecoTexto);
    }

    const distancia = Number(haversineDistanceKm(ORIGEM.lat, ORIGEM.lon, geocoding.lat, geocoding.lon).toFixed(2));
    const frete = calculateFreight(distancia);

    return jsonResponse({
      distancia,
      frete,
      endereco: enderecoTexto,
      address: viaCep,
      destino: { lat: geocoding.lat, lon: geocoding.lon },
      geocoding_provider: geocoding.provider,
      warning: warning || null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    const status = message.includes("consultar CEP") ? 502 : 500;
    return jsonResponse({ error: message }, status);
  }
});
