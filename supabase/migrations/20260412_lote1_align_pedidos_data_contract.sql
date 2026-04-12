-- LOTE 1: contrato de dados consolidado para public.pedidos
-- Objetivo: alinhar colunas usadas pelo frontend com o schema do Supabase sem recriar tabela.

BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cliente_nome text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS modelo_dispositivo text,
  ADD COLUMN IF NOT EXISTS servico text,

  ADD COLUMN IF NOT EXISTS valor_total numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_peca numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_mao_obra numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_frete numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro_bruto numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem numeric(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS desconto numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_final numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentual_juros numeric(7,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_com_juros numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric(12,2) DEFAULT 0,

  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS parcelas integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_pagamento text DEFAULT 'pendente',

  ADD COLUMN IF NOT EXISTS distancia_km numeric(10,2),
  ADD COLUMN IF NOT EXISTS tipo_envio text,

  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS itens_json jsonb,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS previsao_entrega timestamptz;

COMMIT;
