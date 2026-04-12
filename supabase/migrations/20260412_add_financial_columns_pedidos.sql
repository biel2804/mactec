-- Migration: alinhamento de campos financeiros em public.pedidos
-- Compatível com ambientes existentes (não remove/recria tabela)

BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS valor_servico numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_peca numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo_mao_obra numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_frete numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lucro_bruto numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margem numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parcelas integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS percentual_juros numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_total_com_juros numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_parcela numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS status_pagamento text DEFAULT 'pendente';

COMMIT;

-- Opcional: popular nulos antigos com 0 APENAS nos campos numéricos.
-- Rode este bloco somente se quiser normalizar dados legados.
/*
UPDATE public.pedidos
SET
  valor_servico = COALESCE(valor_servico, 0),
  custo_peca = COALESCE(custo_peca, 0),
  custo_mao_obra = COALESCE(custo_mao_obra, 0),
  valor_frete = COALESCE(valor_frete, 0),
  lucro_bruto = COALESCE(lucro_bruto, 0),
  margem = COALESCE(margem, 0),
  percentual_juros = COALESCE(percentual_juros, 0),
  valor_total_com_juros = COALESCE(valor_total_com_juros, 0),
  valor_parcela = COALESCE(valor_parcela, 0)
WHERE
  valor_servico IS NULL
  OR custo_peca IS NULL
  OR custo_mao_obra IS NULL
  OR valor_frete IS NULL
  OR lucro_bruto IS NULL
  OR margem IS NULL
  OR percentual_juros IS NULL
  OR valor_total_com_juros IS NULL
  OR valor_parcela IS NULL;
*/

-- Verificação final
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pedidos'
order by ordinal_position;
