-- Lote 1 CRM/Kanban: estrutura base com colunas fixas de sistema (idempotente e conservador)

create table if not exists public.whatsapp_kanban_columns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique null,
  ordem integer not null default 0,
  cor text null,
  ativo boolean not null default true,
  fixa_sistema boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_kanban_columns_slug
  on public.whatsapp_kanban_columns(slug)
  where slug is not null;

-- Seeds fixos do sistema (sem remoção/alteração de dados existentes)
insert into public.whatsapp_kanban_columns (nome, slug, ordem, cor, ativo, fixa_sistema)
select seed.nome, seed.slug, seed.ordem, seed.cor, true, true
from (
  values
    ('Novos', 'novos', 10, '#22c55e'),
    ('Em atendimento', 'em-atendimento', 20, '#38bdf8'),
    ('Orçamento', 'orcamento', 30, '#f59e0b'),
    ('Aguardando', 'aguardando', 40, '#facc15'),
    ('Concluído', 'concluido', 50, '#14b8a6')
) as seed(nome, slug, ordem, cor)
where not exists (
  select 1
  from public.whatsapp_kanban_columns existing
  where existing.slug = seed.slug
);

-- Garante coluna de relacionamento na conversa
alter table if exists public.whatsapp_conversas
  add column if not exists kanban_column_id uuid;

-- FK defensiva (só cria se ainda não existir)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_conversas_kanban_column_fk'
  ) then
    alter table public.whatsapp_conversas
      add constraint whatsapp_conversas_kanban_column_fk
      foreign key (kanban_column_id)
      references public.whatsapp_kanban_columns(id)
      on update cascade
      on delete set null;
  end if;
end $$;

create index if not exists idx_whatsapp_conversas_kanban_column_id
  on public.whatsapp_conversas(kanban_column_id);

-- Backfill conservador: conversa sem coluna vai para "Novos"
do $$
declare
  has_updated_at boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_conversas'
      and column_name = 'updated_at'
  ) into has_updated_at;

  if has_updated_at then
    execute $sql$
      with novos as (
        select id
        from public.whatsapp_kanban_columns
        where slug = 'novos'
        order by ordem asc
        limit 1
      )
      update public.whatsapp_conversas c
      set kanban_column_id = n.id,
          updated_at = now()
      from novos n
      where c.kanban_column_id is null
    $sql$;
  else
    execute $sql$
      with novos as (
        select id
        from public.whatsapp_kanban_columns
        where slug = 'novos'
        order by ordem asc
        limit 1
      )
      update public.whatsapp_conversas c
      set kanban_column_id = n.id
      from novos n
      where c.kanban_column_id is null
    $sql$;
  end if;
end $$;
