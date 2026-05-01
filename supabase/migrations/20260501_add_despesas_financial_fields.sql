ALTER TABLE public.despesas
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS status_pagamento text DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS categoria text;
