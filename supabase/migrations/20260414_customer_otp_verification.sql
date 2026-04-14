BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.customer_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_normalizado text NOT NULL,
  codigo_hash text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  invalidated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_verification_codes_phone_created
  ON public.customer_verification_codes (telefone_normalizado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_verification_codes_active
  ON public.customer_verification_codes (telefone_normalizado, expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS public.customer_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_normalizado text NOT NULL,
  session_token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_verification_sessions_phone
  ON public.customer_verification_sessions (telefone_normalizado, expires_at DESC);

ALTER TABLE public.customer_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_verification_sessions ENABLE ROW LEVEL SECURITY;

COMMIT;
