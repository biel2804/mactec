-- Adiciona identificador operacional sequencial para pedidos sem alterar o id interno.

BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_pedido BIGINT;

CREATE SEQUENCE IF NOT EXISTS pedidos_numero_seq START 1000;

ALTER TABLE public.pedidos
  ALTER COLUMN numero_pedido SET DEFAULT nextval('pedidos_numero_seq');

UPDATE public.pedidos
SET numero_pedido = nextval('pedidos_numero_seq')
WHERE numero_pedido IS NULL;

ALTER TABLE public.pedidos
  ALTER COLUMN numero_pedido SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pedidos_numero_pedido_key'
      AND conrelid = 'public.pedidos'::regclass
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_numero_pedido_key UNIQUE (numero_pedido);
  END IF;
END $$;

COMMIT;
