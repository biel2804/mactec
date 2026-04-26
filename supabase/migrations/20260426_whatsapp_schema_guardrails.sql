-- Guardrails de schema para Central de Conversas WhatsApp (idempotente e conservador)

alter table if exists public.whatsapp_conversas
  add column if not exists kanban_column_id uuid,
  add column if not exists valor_negocio numeric(12,2),
  add column if not exists prioridade text,
  add column if not exists updated_at timestamptz;

alter table if exists public.whatsapp_conversas
  alter column valor_negocio set default 0,
  alter column prioridade set default 'normal',
  alter column updated_at set default now();

update public.whatsapp_conversas
set valor_negocio = coalesce(valor_negocio, 0),
    prioridade = coalesce(nullif(trim(prioridade), ''), 'normal'),
    updated_at = coalesce(updated_at, ultima_interacao_em, criado_em, now())
where valor_negocio is null
   or prioridade is null
   or trim(prioridade) = ''
   or updated_at is null;

create table if not exists public.whatsapp_kanban_columns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique null,
  ordem integer not null default 0,
  cor text null,
  ativo boolean not null default true,
  fixa_sistema boolean not null default false,
  descricao text null,
  pode_arquivar boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.whatsapp_conversa_tasks (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null,
  titulo text not null,
  descricao text null,
  status text not null default 'pendente',
  vencimento_em timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversa_tasks_conversa_fk
    foreign key (conversa_id)
    references public.whatsapp_conversas(id)
    on delete cascade,
  constraint whatsapp_conversa_tasks_status_chk
    check (status in ('pendente', 'concluida', 'cancelada'))
);

create table if not exists public.whatsapp_conversa_reminders (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null,
  titulo text not null,
  lembrar_em timestamptz not null,
  status text not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_conversa_reminders_conversa_fk
    foreign key (conversa_id)
    references public.whatsapp_conversas(id)
    on delete cascade,
  constraint whatsapp_conversa_reminders_status_chk
    check (status in ('ativo', 'concluido', 'cancelado'))
);

create table if not exists public.whatsapp_conversa_atividades (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null,
  tipo text not null,
  descricao text not null,
  meta jsonb null,
  created_at timestamptz not null default now(),
  constraint whatsapp_conversa_atividades_conversa_fk
    foreign key (conversa_id)
    references public.whatsapp_conversas(id)
    on delete cascade
);
