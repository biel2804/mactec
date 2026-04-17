-- Baixa atômica de estoque de acessórios durante checkout.

BEGIN;

CREATE OR REPLACE FUNCTION public.decrement_accessory_stock(
  p_accessory_id BIGINT,
  p_quantity INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  remaining_stock INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_stock INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida para baixa de estoque.';
  END IF;

  UPDATE public.acessorios
  SET estoque = estoque - p_quantity
  WHERE id = p_accessory_id
    AND estoque >= p_quantity
  RETURNING estoque INTO v_remaining_stock;

  IF FOUND THEN
    RETURN QUERY SELECT TRUE, v_remaining_stock, NULL::TEXT;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.acessorios WHERE id = p_accessory_id) THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Estoque insuficiente para concluir o checkout.';
  ELSE
    RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Acessório não encontrado para baixa de estoque.';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_accessory_stock(BIGINT, INTEGER)
TO anon, authenticated, service_role;

COMMIT;
