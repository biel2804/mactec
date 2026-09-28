create extension if not exists pgcrypto;

-- Fotos de entrada vinculadas à Ordem de Serviço (sem alterar outros módulos).
create table if not exists public.os_fotos (
  id uuid primary key default gen_random_uuid(),
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  storage_path text not null unique,
  nome_arquivo text not null,
  ordem integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_os_fotos_os_id_ordem
  on public.os_fotos (os_id, ordem, created_at);

alter table public.os_fotos enable row level security;
grant select, insert, delete on public.os_fotos to authenticated;

drop policy if exists os_fotos_select_authenticated on public.os_fotos;
create policy os_fotos_select_authenticated on public.os_fotos
  for select to authenticated using (true);
drop policy if exists os_fotos_insert_authenticated on public.os_fotos;
create policy os_fotos_insert_authenticated on public.os_fotos
  for insert to authenticated with check (true);
drop policy if exists os_fotos_delete_authenticated on public.os_fotos;
create policy os_fotos_delete_authenticated on public.os_fotos
  for delete to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('os-fotos', 'os-fotos', false)
on conflict (id) do nothing;

drop policy if exists os_fotos_storage_select_authenticated on storage.objects;
create policy os_fotos_storage_select_authenticated on storage.objects
  for select to authenticated using (bucket_id = 'os-fotos');
drop policy if exists os_fotos_storage_insert_authenticated on storage.objects;
create policy os_fotos_storage_insert_authenticated on storage.objects
  for insert to authenticated with check (bucket_id = 'os-fotos');
drop policy if exists os_fotos_storage_delete_authenticated on storage.objects;
create policy os_fotos_storage_delete_authenticated on storage.objects
  for delete to authenticated using (bucket_id = 'os-fotos');
