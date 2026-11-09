-- Estrutura inicial da corretora de demonstração.
-- auth.users guarda a identidade; as tabelas abaixo guardam os dados da corretora.

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  saldo_centavos bigint not null default 0 check (saldo_centavos >= 0),
  criada_em timestamptz not null default now()
);

create table public.ativos (
  codigo text primary key,
  nome text not null,
  tipo text not null check (tipo in ('ACAO', 'MOEDA')),
  preco_centavos bigint not null check (preco_centavos > 0)
);

create table public.posicoes (
  conta_id uuid not null references public.contas(id) on delete cascade,
  ativo_codigo text not null references public.ativos(codigo),
  quantidade_micros bigint not null check (quantidade_micros > 0),
  primary key (conta_id, ativo_codigo)
);

create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.contas(id) on delete cascade,
  tipo text not null check (tipo in ('DEPOSITO', 'COMPRA', 'VENDA')),
  valor_centavos bigint not null check (valor_centavos > 0),
  ativo_codigo text references public.ativos(codigo),
  quantidade_micros bigint,
  criada_em timestamptz not null default now(),
  constraint movimento_ativo_coerente check (
    (tipo = 'DEPOSITO' and ativo_codigo is null and quantidade_micros is null)
    or
    (tipo in ('COMPRA', 'VENDA') and ativo_codigo is not null
      and quantidade_micros is not null and quantidade_micros > 0)
  )
);

create index movimentacoes_conta_data_idx
  on public.movimentacoes (conta_id, criada_em desc);

-- Os preços são fictícios. Uma fonte de cotação será necessária para preços reais.
insert into public.ativos (codigo, nome, tipo, preco_centavos) values
  ('ACAO1', 'Ação demonstrativa', 'ACAO', 2500),
  ('USD', 'Dólar demonstrativo', 'MOEDA', 500);

alter table public.contas enable row level security;
alter table public.ativos enable row level security;
alter table public.posicoes enable row level security;
alter table public.movimentacoes enable row level security;

-- As tabelas são somente leitura para o app. Operações serão feitas por funções
-- de banco transacionais, com verificação do usuário autenticado.
revoke all on public.contas, public.ativos, public.posicoes, public.movimentacoes
  from anon, authenticated;
grant select on public.contas, public.ativos, public.posicoes, public.movimentacoes
  to authenticated;

create policy "usuario consulta a propria conta"
  on public.contas for select to authenticated
  using (usuario_id = (select auth.uid()));

create policy "usuario consulta ativos"
  on public.ativos for select to authenticated
  using (true);

create policy "usuario consulta as proprias posicoes"
  on public.posicoes for select to authenticated
  using (exists (
    select 1 from public.contas c
    where c.id = conta_id and c.usuario_id = (select auth.uid())
  ));

create policy "usuario consulta as proprias movimentacoes"
  on public.movimentacoes for select to authenticated
  using (exists (
    select 1 from public.contas c
    where c.id = conta_id and c.usuario_id = (select auth.uid())
  ));

-- Cria a conta do usuário autenticado, uma única vez. O cliente não consegue
-- escolher o saldo inicial porque não tem permissão de INSERT na tabela.
create function public.abrir_conta()
returns public.contas
language plpgsql
security definer
set search_path = ''
as $$
declare
  resultado public.contas;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;

  insert into public.contas (usuario_id)
  values ((select auth.uid()))
  on conflict (usuario_id) do nothing;

  select * into resultado
  from public.contas
  where usuario_id = (select auth.uid());

  return resultado;
end;
$$;

revoke all on function public.abrir_conta() from public, anon;
grant execute on function public.abrir_conta() to authenticated;
