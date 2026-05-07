begin;

alter table public.ordens_servico enable row level security;

drop policy if exists ordens_servico_insert_authenticated on public.ordens_servico;

create policy ordens_servico_insert_authenticated
on public.ordens_servico
for insert
to authenticated
with check (true);

commit;
