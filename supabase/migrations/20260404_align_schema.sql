-- =========================================================
-- Mactec - Migração completa (compatível com orcamento.html)
-- Idempotente (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- =========================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.pecas (
  id bigserial primary key,
  marca text not null,
  modelo text not null,
  qualidade text not null default 'original',
  preco_custo numeric(12,2) not null default 0,
  preco_venda numeric(12,2),
  estoque integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pecas add column if not exists marca text;
alter table public.pecas add column if not exists modelo text;
alter table public.pecas add column if not exists qualidade text;
alter table public.pecas add column if not exists preco_custo numeric(12,2);
alter table public.pecas add column if not exists preco_venda numeric(12,2);
alter table public.pecas add column if not exists estoque integer;
alter table public.pecas add column if not exists created_at timestamptz;
alter table public.pecas add column if not exists updated_at timestamptz;

update public.pecas set created_at = now() where created_at is null;
update public.pecas set updated_at = now() where updated_at is null;
update public.pecas set estoque = 0 where estoque is null;
update public.pecas set preco_custo = 0 where preco_custo is null;

alter table public.pecas alter column created_at set default now();
alter table public.pecas alter column updated_at set default now();
alter table public.pecas alter column estoque set default 0;
alter table public.pecas alter column preco_custo set default 0;

create table if not exists public.acessorios (
  id bigserial primary key,
  nome text not null,
  descricao text not null,
  categoria text not null,
  preco numeric(12,2) not null default 0,
  estoque integer not null default 0,
  foto text,
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.acessorios add column if not exists nome text;
alter table public.acessorios add column if not exists descricao text;
alter table public.acessorios add column if not exists categoria text;
alter table public.acessorios add column if not exists preco numeric(12,2);
alter table public.acessorios add column if not exists estoque integer;
alter table public.acessorios add column if not exists foto text;
alter table public.acessorios add column if not exists criado_em timestamptz;
alter table public.acessorios add column if not exists updated_at timestamptz;

update public.acessorios set criado_em = now() where criado_em is null;
update public.acessorios set updated_at = now() where updated_at is null;
update public.acessorios set estoque = 0 where estoque is null;
update public.acessorios set preco = 0 where preco is null;

alter table public.acessorios alter column criado_em set default now();
alter table public.acessorios alter column updated_at set default now();
alter table public.acessorios alter column estoque set default 0;
alter table public.acessorios alter column preco set default 0;

create table if not exists public.pedidos (
  id bigserial primary key,
  cliente_nome text not null,
  whatsapp text,
  endereco text,
  modelo_dispositivo text,
  servico text,
  valor_total numeric(12,2) not null default 0,
  status text not null default 'pendente',
  distancia_km numeric(10,2),
  valor_frete numeric(12,2),
  tipo_envio text,
  observacoes text,
  previsao_entrega timestamptz,
  itens_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pedidos add column if not exists cliente_nome text;
alter table public.pedidos add column if not exists whatsapp text;
alter table public.pedidos add column if not exists endereco text;
alter table public.pedidos add column if not exists modelo_dispositivo text;
alter table public.pedidos add column if not exists servico text;
alter table public.pedidos add column if not exists valor_total numeric(12,2);
alter table public.pedidos add column if not exists status text;
alter table public.pedidos add column if not exists distancia_km numeric(10,2);
alter table public.pedidos add column if not exists valor_frete numeric(12,2);
alter table public.pedidos add column if not exists tipo_envio text;
alter table public.pedidos add column if not exists observacoes text;
alter table public.pedidos add column if not exists previsao_entrega timestamptz;
alter table public.pedidos add column if not exists itens_json jsonb;
alter table public.pedidos add column if not exists created_at timestamptz;
alter table public.pedidos add column if not exists updated_at timestamptz;

update public.pedidos set created_at = now() where created_at is null;
update public.pedidos set updated_at = now() where updated_at is null;
update public.pedidos set valor_total = 0 where valor_total is null;
update public.pedidos set status = 'pendente' where status is null;

alter table public.pedidos alter column created_at set default now();
alter table public.pedidos alter column updated_at set default now();
alter table public.pedidos alter column valor_total set default 0;
alter table public.pedidos alter column status set default 'pendente';

create table if not exists public.ordens_servico (
  id bigserial primary key,
  numero_os text not null unique,
  cliente_nome text not null,
  cliente_telefone text,
  cliente_endereco text,
  marca text,
  modelo text,
  servico text,
  peca text,
  valor_total numeric(12,2),
  status text not null default 'pendente',
  observacoes text,
  data_criacao timestamptz not null default now(),
  pedido_id text,
  updated_at timestamptz not null default now()
);

alter table public.ordens_servico add column if not exists numero_os text;
alter table public.ordens_servico add column if not exists cliente_nome text;
alter table public.ordens_servico add column if not exists cliente_telefone text;
alter table public.ordens_servico add column if not exists cliente_endereco text;
alter table public.ordens_servico add column if not exists marca text;
alter table public.ordens_servico add column if not exists modelo text;
alter table public.ordens_servico add column if not exists servico text;
alter table public.ordens_servico add column if not exists peca text;
alter table public.ordens_servico add column if not exists valor_total numeric(12,2);
alter table public.ordens_servico add column if not exists status text;
alter table public.ordens_servico add column if not exists observacoes text;
alter table public.ordens_servico add column if not exists data_criacao timestamptz;
alter table public.ordens_servico add column if not exists pedido_id text;
alter table public.ordens_servico add column if not exists updated_at timestamptz;

do $$
declare
  v_pedidos_id_type text;
  v_pedido_id_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
    into v_pedidos_id_type
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'pedidos'
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if v_pedidos_id_type is not null then
    select format_type(a.atttypid, a.atttypmod)
      into v_pedido_id_type
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ordens_servico'
      and a.attname = 'pedido_id'
      and a.attnum > 0
      and not a.attisdropped;

    if v_pedido_id_type is null then
      execute format('alter table public.ordens_servico add column pedido_id %s', v_pedidos_id_type);
      v_pedido_id_type := v_pedidos_id_type;
    elsif v_pedido_id_type <> v_pedidos_id_type then
      execute 'alter table public.ordens_servico drop constraint if exists ordens_servico_pedido_id_fkey';

      if v_pedidos_id_type = 'uuid' then
        execute '
          alter table public.ordens_servico
          alter column pedido_id type uuid
          using (
            case
              when pedido_id::text ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$''
                then pedido_id::text::uuid
              else null
            end
          )';
      elsif v_pedidos_id_type in ('bigint', 'integer', 'smallint') then
        execute format(
          'alter table public.ordens_servico
           alter column pedido_id type %s
           using (
             case
               when pedido_id::text ~ ''^-?[0-9]+$'' then pedido_id::text::%s
               else null
             end
           )',
          v_pedidos_id_type,
          v_pedidos_id_type
        );
      else
        execute format(
          'alter table public.ordens_servico
           alter column pedido_id type %s
           using null',
          v_pedidos_id_type
        );
      end if;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'ordens_servico_pedido_id_fkey'
    ) then
      execute '
        alter table public.ordens_servico
        add constraint ordens_servico_pedido_id_fkey
        foreign key (pedido_id) references public.pedidos(id) on delete set null';
    end if;
  end if;
end $$;

update public.ordens_servico set data_criacao = now() where data_criacao is null;
update public.ordens_servico set updated_at = now() where updated_at is null;
update public.ordens_servico set status = 'pendente' where status is null;

alter table public.ordens_servico alter column data_criacao set default now();
alter table public.ordens_servico alter column updated_at set default now();
alter table public.ordens_servico alter column status set default 'pendente';

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'ordens_servico_numero_os_uq_idx'
  ) then
    create unique index ordens_servico_numero_os_uq_idx
      on public.ordens_servico(numero_os);
  end if;
end $$;

create table if not exists public.clientes (
  id bigserial primary key,
  nome text not null,
  whatsapp text,
  endereco text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes add column if not exists nome text;
alter table public.clientes add column if not exists whatsapp text;
alter table public.clientes add column if not exists endereco text;
alter table public.clientes add column if not exists created_at timestamptz;
alter table public.clientes add column if not exists updated_at timestamptz;

update public.clientes set created_at = now() where created_at is null;
update public.clientes set updated_at = now() where updated_at is null;

alter table public.clientes alter column created_at set default now();
alter table public.clientes alter column updated_at set default now();

create table if not exists public.configuracoes_empresa (
  id bigint primary key,
  nome_empresa text not null default 'MacTec Support',
  endereco text not null default '',
  telefone_whatsapp text,
  mensagem_whatsapp_padrao text,
  logo_url text,
  instagram_url text,
  facebook_url text,
  twitter_url text,
  linkedin_url text,
  youtube_url text,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.configuracoes_empresa add column if not exists nome_empresa text;
alter table public.configuracoes_empresa add column if not exists endereco text;
alter table public.configuracoes_empresa add column if not exists telefone_whatsapp text;
alter table public.configuracoes_empresa add column if not exists mensagem_whatsapp_padrao text;
alter table public.configuracoes_empresa add column if not exists logo_url text;
alter table public.configuracoes_empresa add column if not exists instagram_url text;
alter table public.configuracoes_empresa add column if not exists facebook_url text;
alter table public.configuracoes_empresa add column if not exists twitter_url text;
alter table public.configuracoes_empresa add column if not exists linkedin_url text;
alter table public.configuracoes_empresa add column if not exists youtube_url text;
alter table public.configuracoes_empresa add column if not exists atualizado_em timestamptz;
alter table public.configuracoes_empresa add column if not exists created_at timestamptz;
alter table public.configuracoes_empresa add column if not exists updated_at timestamptz;

update public.configuracoes_empresa set atualizado_em = now() where atualizado_em is null;
update public.configuracoes_empresa set created_at = now() where created_at is null;
update public.configuracoes_empresa set updated_at = now() where updated_at is null;
update public.configuracoes_empresa set nome_empresa = 'MacTec Support' where nome_empresa is null;
update public.configuracoes_empresa set endereco = '' where endereco is null;

alter table public.configuracoes_empresa alter column atualizado_em set default now();
alter table public.configuracoes_empresa alter column created_at set default now();
alter table public.configuracoes_empresa alter column updated_at set default now();
alter table public.configuracoes_empresa alter column nome_empresa set default 'MacTec Support';
alter table public.configuracoes_empresa alter column endereco set default '';

insert into public.configuracoes_empresa (id, nome_empresa, endereco)
values (1, 'MacTec Support', '')
on conflict (id) do nothing;

create table if not exists public.logs_erros (
  id bigserial primary key,
  mensagem text not null,
  stack text,
  origem text,
  url text,
  user_agent text,
  criado_em timestamptz not null default now()
);

alter table public.logs_erros add column if not exists mensagem text;
alter table public.logs_erros add column if not exists stack text;
alter table public.logs_erros add column if not exists origem text;
alter table public.logs_erros add column if not exists url text;
alter table public.logs_erros add column if not exists user_agent text;
alter table public.logs_erros add column if not exists criado_em timestamptz;

update public.logs_erros set criado_em = now() where criado_em is null;
alter table public.logs_erros alter column criado_em set default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_pecas_updated_at') then
    create trigger trg_pecas_updated_at
    before update on public.pecas
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_acessorios_updated_at') then
    create trigger trg_acessorios_updated_at
    before update on public.acessorios
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_pedidos_updated_at') then
    create trigger trg_pedidos_updated_at
    before update on public.pedidos
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_ordens_servico_updated_at') then
    create trigger trg_ordens_servico_updated_at
    before update on public.ordens_servico
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_clientes_updated_at') then
    create trigger trg_clientes_updated_at
    before update on public.clientes
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_configuracoes_empresa_updated_at') then
    create trigger trg_configuracoes_empresa_updated_at
    before update on public.configuracoes_empresa
    for each row execute function public.set_updated_at();
  end if;
end $$;

create index if not exists idx_pedidos_created_at on public.pedidos(created_at desc);
create index if not exists idx_pedidos_status on public.pedidos(status);

create index if not exists idx_ordens_servico_data_criacao on public.ordens_servico(data_criacao desc);
create index if not exists idx_ordens_servico_status on public.ordens_servico(status);

create index if not exists idx_acessorios_categoria on public.acessorios(categoria);
create index if not exists idx_acessorios_estoque on public.acessorios(estoque);

create index if not exists idx_pecas_marca_modelo on public.pecas(marca, modelo);

alter table public.pecas enable row level security;
alter table public.acessorios enable row level security;
alter table public.pedidos enable row level security;
alter table public.ordens_servico enable row level security;
alter table public.clientes enable row level security;
alter table public.configuracoes_empresa enable row level security;
alter table public.logs_erros enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pecas' and policyname='pecas_select_anon') then
    create policy pecas_select_anon on public.pecas for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pecas' and policyname='pecas_insert_anon') then
    create policy pecas_insert_anon on public.pecas for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pecas' and policyname='pecas_update_anon') then
    create policy pecas_update_anon on public.pecas for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pecas' and policyname='pecas_delete_anon') then
    create policy pecas_delete_anon on public.pecas for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='acessorios' and policyname='acessorios_select_anon') then
    create policy acessorios_select_anon on public.acessorios for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='acessorios' and policyname='acessorios_insert_anon') then
    create policy acessorios_insert_anon on public.acessorios for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='acessorios' and policyname='acessorios_update_anon') then
    create policy acessorios_update_anon on public.acessorios for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='acessorios' and policyname='acessorios_delete_anon') then
    create policy acessorios_delete_anon on public.acessorios for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pedidos' and policyname='pedidos_select_anon') then
    create policy pedidos_select_anon on public.pedidos for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pedidos' and policyname='pedidos_insert_anon') then
    create policy pedidos_insert_anon on public.pedidos for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pedidos' and policyname='pedidos_update_anon') then
    create policy pedidos_update_anon on public.pedidos for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pedidos' and policyname='pedidos_delete_anon') then
    create policy pedidos_delete_anon on public.pedidos for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordens_servico' and policyname='ordens_servico_select_anon') then
    create policy ordens_servico_select_anon on public.ordens_servico for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordens_servico' and policyname='ordens_servico_insert_anon') then
    create policy ordens_servico_insert_anon on public.ordens_servico for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordens_servico' and policyname='ordens_servico_update_anon') then
    create policy ordens_servico_update_anon on public.ordens_servico for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ordens_servico' and policyname='ordens_servico_delete_anon') then
    create policy ordens_servico_delete_anon on public.ordens_servico for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clientes' and policyname='clientes_select_anon') then
    create policy clientes_select_anon on public.clientes for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clientes' and policyname='clientes_insert_anon') then
    create policy clientes_insert_anon on public.clientes for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clientes' and policyname='clientes_update_anon') then
    create policy clientes_update_anon on public.clientes for update to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='clientes' and policyname='clientes_delete_anon') then
    create policy clientes_delete_anon on public.clientes for delete to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='configuracoes_empresa' and policyname='config_empresa_select_anon') then
    create policy config_empresa_select_anon on public.configuracoes_empresa for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='configuracoes_empresa' and policyname='config_empresa_insert_anon') then
    create policy config_empresa_insert_anon on public.configuracoes_empresa for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='configuracoes_empresa' and policyname='config_empresa_update_anon') then
    create policy config_empresa_update_anon on public.configuracoes_empresa for update to anon using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='logs_erros' and policyname='logs_erros_insert_anon') then
    create policy logs_erros_insert_anon on public.logs_erros for insert to anon with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='logs_erros' and policyname='logs_erros_select_anon') then
    create policy logs_erros_select_anon on public.logs_erros for select to anon using (true);
  end if;
end $$;

commit;
