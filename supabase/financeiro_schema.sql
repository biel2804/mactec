-- Atualização de schema para módulo financeiro
alter table if exists pedidos
  add column if not exists cliente text,
  add column if not exists aparelho text,
  add column if not exists valor_servico numeric(12,2) default 0,
  add column if not exists custo_peca numeric(12,2) default 0,
  add column if not exists custo_mao_obra numeric(12,2) default 0,
  add column if not exists lucro_bruto numeric(12,2) default 0,
  add column if not exists margem numeric(8,2) default 0,
  add column if not exists status_pagamento text default 'pendente';

create table if not exists despesas (
  id bigserial primary key,
  tipo text not null check (tipo in ('estoque','marketing','ferramentas','fixo')),
  valor numeric(12,2) not null check (valor >= 0),
  descricao text,
  data date not null default now()::date,
  pedido_id bigint null references pedidos(id) on delete set null,
  created_at timestamptz not null default now()
);
