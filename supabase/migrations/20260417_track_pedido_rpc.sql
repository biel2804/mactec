-- RPC mínima para tracking público de pedidos sem expor select amplo na tabela.
create or replace function public.track_pedido(
  search_numero bigint default null,
  search_whatsapp text default null
)
returns table (
  id bigint,
  numero_pedido bigint,
  cliente_nome text,
  whatsapp text,
  modelo_dispositivo text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.numero_pedido,
    p.cliente_nome,
    p.whatsapp,
    p.modelo_dispositivo,
    p.status,
    p.created_at,
    p.updated_at
  from public.pedidos p
  where (
    search_numero is not null
    and p.numero_pedido = search_numero
  )
  or (
    search_whatsapp is not null
    and regexp_replace(coalesce(p.whatsapp, ''), '\\D', '', 'g') = regexp_replace(search_whatsapp, '\\D', '', 'g')
  )
  order by p.created_at desc
  limit 1;
$$;

revoke all on function public.track_pedido(bigint, text) from public;
grant execute on function public.track_pedido(bigint, text) to anon, authenticated;
