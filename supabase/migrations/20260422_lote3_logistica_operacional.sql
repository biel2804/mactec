-- LOTE 3: separação segura de status logístico do status geral do pedido
BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS status_logistico text DEFAULT 'PENDENTE_LOGISTICA',
  ADD COLUMN IF NOT EXISTS logistica_observacao text,
  ADD COLUMN IF NOT EXISTS logistica_problema_tipo text,
  ADD COLUMN IF NOT EXISTS logistica_data_agendada timestamptz,
  ADD COLUMN IF NOT EXISTS logistica_ultima_acao_em timestamptz,
  ADD COLUMN IF NOT EXISTS logistica_responsavel text,
  ADD COLUMN IF NOT EXISTS logistica_historico jsonb DEFAULT '[]'::jsonb;

UPDATE public.pedidos
SET status_logistico = COALESCE(NULLIF(status_logistico, ''), 'PENDENTE_LOGISTICA');

COMMIT;
