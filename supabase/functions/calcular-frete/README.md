# Edge Function: calcular-frete

## Variáveis de ambiente necessárias

Configure no Supabase:

- `GEOCODING_API_KEY` (obrigatória)
- `GEOCODING_API_URL` (opcional, padrão: `https://api.opencagedata.com/geocode/v1/json`)
- `LOJA_LAT` (opcional, padrão: `-23.7`)
- `LOJA_LON` (opcional, padrão: `-46.55`)
- `FRETE_VALOR_POR_KM` (opcional, padrão: `2.5`)
- `FRETE_MINIMO` (opcional, padrão: `15`)

## Exemplo de request

```http
POST /functions/v1/calcular-frete
Content-Type: application/json

{ "cep": "01001000" }
```

## Exemplo de resposta

```json
{
  "distancia": 12.34,
  "frete": 30.85,
  "endereco": "Praça da Sé, Sé, São Paulo-SP, 01001000"
}
```
