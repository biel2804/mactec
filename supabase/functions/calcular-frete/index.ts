import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método não permitido." }, 405);
  }

  try {
    if (!GEOCODING_API_KEY) {
      return jsonResponse({ error: "GEOCODING_API_KEY não configurada no backend." }, 500);
    }

    const { cep } = await req.json().catch(() => ({}));
    const cepDigits = String(cep ?? "").replace(/\D/g, "");

    if (cepDigits.length !== 8) {
      return jsonResponse({ error: "CEP inválido." }, 400);
    }

    const viaCepResponse = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`);
    if (!viaCepResponse.ok) {
      return jsonResponse({ error: "Falha ao consultar ViaCEP." }, 502);
    }

    const viaCep = await viaCepResponse.json();
    if (viaCep?.erro) {
      return jsonResponse({ error: "CEP não encontrado." }, 404);
    }

    const enderecoTexto = [
      viaCep.logradouro,
      viaCep.bairro,
      `${viaCep.localidade}-${viaCep.uf}`,
      cepDigits
    ].filter(Boolean).join(", ");

    const geocodingUrl = `${GEOCODING_API_URL}?q=${encodeURIComponent(enderecoTexto)}&key=${encodeURIComponent(GEOCODING_API_KEY)}&limit=1&language=pt-BR`;
    const geocodingResponse = await fetch(geocodingUrl);
    if (!geocodingResponse.ok) {
      return jsonResponse({ error: "Falha ao geocodificar endereço." }, 502);
    }

    const geocodingPayload = await geocodingResponse.json();
    const destination = geocodingPayload?.results?.[0]?.geometry;
    const lat = Number(destination?.lat);
    const lon = Number(destination?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return jsonResponse({ error: "Endereço não encontrado no geocoding." }, 404);
    }

    const distancia = Number(haversineDistanceKm(ORIGEM.lat, ORIGEM.lon, lat, lon).toFixed(2));
    const frete = calculateFreight(distancia);

    return jsonResponse({
      distancia,
      frete,
      endereco: enderecoTexto,
      address: viaCep,
      destino: { lat, lon }
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
