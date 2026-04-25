-- MVP CRM context for WhatsApp admin (idempotent / low-risk)

alter table if exists public.whatsapp_conversas
  add column if not exists kanban_column_id uuid,
  add column if not exists valor_negocio numeric(12,2),
  add column if not exists prioridade text,
  add column if not exists updated_at timestamptz;

alter table if exists public.whatsapp_conversas
  alter column valor_negocio set default 0,
  alter column updated_at set default now();

update public.whatsapp_conversas
set valor_negocio = coalesce(valor_negocio, 0)
where valor_negocio is null;

update public.whatsapp_conversas
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table if exists public.whatsapp_conversas
  alter column updated_at set not null;

create table if not exists public.whatsapp_tags (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversa_tags (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  constraint whatsapp_conversa_tags_conversa_fk
    foreign key (conversa_id)
    references public.whatsapp_conversas(id)
    on delete cascade,
  constraint whatsapp_conversa_tags_tag_fk
    foreign key (tag_id)
    references public.whatsapp_tags(id)
    on delete cascade,
  constraint whatsapp_conversa_tags_unique_conversa_tag unique (conversa_id, tag_id)
);

create table if not exists public.whatsapp_conversa_notas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null,
  conteudo text not null,
  criado_por text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversa_notas_conversa_fk
    foreign key (conversa_id)
    references public.whatsapp_conversas(id)
    on delete cascade
);

create index if not exists idx_whatsapp_conversa_tags_conversa_id
  on public.whatsapp_conversa_tags(conversa_id);

create index if not exists idx_whatsapp_conversa_notas_conversa_id
  on public.whatsapp_conversa_notas(conversa_id);
