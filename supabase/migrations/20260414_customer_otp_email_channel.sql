BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS public.customer_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_normalizado text NOT NULL,
  codigo_hash text NOT NULL,
  verification_email text NOT NULL,
  email_masked text NOT NULL,
  context text NOT NULL DEFAULT 'existing_customer' CHECK (context IN ('existing_customer', 'new_customer')),
  customer_id bigint NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  invalidated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_verification_codes
  ADD COLUMN IF NOT EXISTS verification_email text,
  ADD COLUMN IF NOT EXISTS email_masked text,
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS customer_id bigint,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.customer_verification_codes
SET attempt_count = COALESCE(attempt_count, attempts, 0),
    attempts = COALESCE(attempt_count, attempts, 0)
WHERE attempt_count IS NULL OR attempts IS NULL;

UPDATE public.customer_verification_codes
SET context = 'existing_customer'
WHERE context IS NULL;

UPDATE public.customer_verification_codes
SET verification_email = COALESCE(verification_email, ''),
    email_masked = COALESCE(email_masked, 'e***@***')
WHERE verification_email IS NULL OR email_masked IS NULL;

ALTER TABLE public.customer_verification_codes
  ALTER COLUMN verification_email SET NOT NULL,
  ALTER COLUMN email_masked SET NOT NULL,
  ALTER COLUMN context SET NOT NULL,
  ALTER COLUMN context SET DEFAULT 'existing_customer';

CREATE INDEX IF NOT EXISTS idx_customer_verification_codes_phone_created
  ON public.customer_verification_codes (telefone_normalizado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_verification_codes_active
  ON public.customer_verification_codes (telefone_normalizado, expires_at)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_verification_codes_email_active
  ON public.customer_verification_codes (verification_email, created_at DESC)
  WHERE used_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS public.customer_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_normalizado text NOT NULL,
  session_token_hash text NOT NULL,
  context text NOT NULL DEFAULT 'existing_customer' CHECK (context IN ('existing_customer', 'new_customer')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_verification_sessions
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.customer_verification_sessions
SET context = 'existing_customer'
WHERE context IS NULL;

ALTER TABLE public.customer_verification_sessions
  ALTER COLUMN context SET NOT NULL,
  ALTER COLUMN context SET DEFAULT 'existing_customer';

CREATE INDEX IF NOT EXISTS idx_customer_verification_sessions_phone
  ON public.customer_verification_sessions (telefone_normalizado, expires_at DESC);

ALTER TABLE public.customer_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_verification_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.customer_verification_codes FROM anon, authenticated;
REVOKE ALL ON TABLE public.customer_verification_sessions FROM anon, authenticated;

COMMIT;
