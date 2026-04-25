-- Lote 2 CRM/Kanban: camada operacional incremental (idempotente e conservadora)

-- 1) Colunas Kanban dinâmicas (compatível com colunas fixas seedadas)
alter table if exists public.whatsapp_kanban_columns
  add column if not exists descricao text,
  add column if not exists pode_arquivar boolean not null default false;

alter table if exists public.whatsapp_kanban_columns
  alter column ordem set default 0,
  alter column ativo set default true,
  alter column fixa_sistema set default false;

create index if not exists idx_whatsapp_kanban_columns_ativo_ordem
  on public.whatsapp_kanban_columns(ativo, ordem);

-- 2) Tarefas por conversa
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

create index if not exists idx_whatsapp_conversa_tasks_conversa_id
  on public.whatsapp_conversa_tasks(conversa_id);

create index if not exists idx_whatsapp_conversa_tasks_status
  on public.whatsapp_conversa_tasks(status);

-- 3) Lembretes por conversa (separado de tasks para operação simples)
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

create index if not exists idx_whatsapp_conversa_reminders_conversa_id
  on public.whatsapp_conversa_reminders(conversa_id);

create index if not exists idx_whatsapp_conversa_reminders_status_lembrar
  on public.whatsapp_conversa_reminders(status, lembrar_em);

-- 4) Histórico operacional
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

create index if not exists idx_whatsapp_conversa_atividades_conversa_created
  on public.whatsapp_conversa_atividades(conversa_id, created_at desc);

-- 5) Trigger leve para manter updated_at em tasks/reminders sem depender de cliente
create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_whatsapp_conversa_tasks_updated_at on public.whatsapp_conversa_tasks;
create trigger trg_whatsapp_conversa_tasks_updated_at
before update on public.whatsapp_conversa_tasks
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists trg_whatsapp_conversa_reminders_updated_at on public.whatsapp_conversa_reminders;
create trigger trg_whatsapp_conversa_reminders_updated_at
before update on public.whatsapp_conversa_reminders
for each row execute function public.set_updated_at_timestamp();
