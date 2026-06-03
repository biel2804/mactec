begin;

create extension if not exists pgcrypto;

create table if not exists public.orcamentos_os (
  id uuid primary key default gen_random_uuid(),
  ordem_servico_id uuid not null references public.ordens_servico(id) on delete cascade,
  numero_orcamento text,
  cliente_nome text,
  cliente_telefone text,
  aparelho text,
  marca text,
  modelo text,
  defeito_relatado text,
  servico_titulo text,
  descricao_servico text,
  peca_qualidade text,
  valor_servico numeric(10,2),
  valor_frete numeric(10,2) default 0,
  valor_total numeric(10,2),
  prazo_estimado text,
  garantia text,
  forma_pagamento text,
  observacoes_cliente text,
  status_orcamento text not null default 'rascunho',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  enviado_em timestamptz,
  aprovado_em timestamptz,
  recusado_em timestamptz
);

create index if not exists idx_orcamentos_os_ordem_servico_id
on public.orcamentos_os(ordem_servico_id);

create or replace function public.set_orcamentos_os_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_orcamentos_os_atualizado_em on public.orcamentos_os;
create trigger trg_orcamentos_os_atualizado_em
before update on public.orcamentos_os
for each row
execute function public.set_orcamentos_os_atualizado_em();

alter table public.orcamentos_os enable row level security;

grant select, insert, update on public.orcamentos_os to authenticated;

drop policy if exists orcamentos_os_select_authenticated on public.orcamentos_os;
create policy orcamentos_os_select_authenticated
on public.orcamentos_os
for select
to authenticated
using (true);

drop policy if exists orcamentos_os_insert_authenticated on public.orcamentos_os;
create policy orcamentos_os_insert_authenticated
on public.orcamentos_os
for insert
to authenticated
with check (true);

drop policy if exists orcamentos_os_update_authenticated on public.orcamentos_os;
create policy orcamentos_os_update_authenticated
on public.orcamentos_os
for update
to authenticated
using (true)
with check (true);

commit;
