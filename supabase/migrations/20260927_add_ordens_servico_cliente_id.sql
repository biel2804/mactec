-- Vínculo único e opcional para que o histórico de O.S. use a identidade interna UUID do cliente.
BEGIN;

ALTER TABLE public.ordens_servico
  ADD COLUMN IF NOT EXISTS cliente_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ordens_servico_cliente_id_fkey'
      AND conrelid = 'public.ordens_servico'::regclass
  ) THEN
    ALTER TABLE public.ordens_servico
      ADD CONSTRAINT ordens_servico_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ordens_servico_cliente_id
  ON public.ordens_servico (cliente_id);

COMMIT;
