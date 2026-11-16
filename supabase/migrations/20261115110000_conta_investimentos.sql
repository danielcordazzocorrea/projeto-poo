-- Conta de investimentos simulada: uma carteira BRL para cada conta principal.
create table public.contas_investimento (
  conta_principal_id uuid primary key references public.contas(id) on delete cascade,
  saldo_centavos bigint not null default 0
    check (saldo_centavos between 0 and 9007199254740991),
  criada_em timestamptz not null default now()
);

-- Posições desta conta são separadas da tabela legada public.posicoes.
-- A validação de ativos negociáveis será ligada ao catálogo na etapa de compra/venda.
create table public.posicoes_investimento (
  conta_principal_id uuid not null references public.contas_investimento(conta_principal_id) on delete cascade,
  ativo_codigo text not null check (ativo_codigo ~ '^[A-Z0-9]{1,20}$'),
  quantidade_micros bigint not null check (quantidade_micros between 1 and 9007199254740991),
  primary key (conta_principal_id, ativo_codigo)
);

create table public.transferencias_investimento (
  id uuid primary key default gen_random_uuid(),
  conta_principal_id uuid not null references public.contas(id) on delete cascade,
  requisicao_id uuid not null,
  direcao text not null check (direcao in ('PARA_INVESTIMENTOS', 'PARA_PRINCIPAL')),
  valor_origem_centavos bigint not null check (valor_origem_centavos between 1 and 9007199254740991),
  moeda_origem text not null check (moeda_origem in ('BRL', 'USD', 'EUR')),
  valor_destino_centavos bigint not null check (valor_destino_centavos between 1 and 9007199254740991),
  moeda_destino text not null check (moeda_destino in ('BRL', 'USD', 'EUR')),
  cotacao_em timestamptz,
  criada_em timestamptz not null default now(),
  unique (conta_principal_id, requisicao_id)
);
create index transferencias_investimento_conta_data_idx
  on public.transferencias_investimento (conta_principal_id, criada_em desc);

alter table public.contas_investimento enable row level security;
alter table public.posicoes_investimento enable row level security;
alter table public.transferencias_investimento enable row level security;
revoke all on public.contas_investimento, public.posicoes_investimento, public.transferencias_investimento from anon, authenticated;
grant select on public.contas_investimento, public.posicoes_investimento, public.transferencias_investimento to authenticated;
create policy "usuario consulta sua conta de investimentos" on public.contas_investimento
  for select to authenticated using (exists (
    select 1 from public.contas c where c.id = conta_principal_id and c.usuario_id = (select auth.uid())
  ));
create policy "usuario consulta suas posicoes de investimentos" on public.posicoes_investimento
  for select to authenticated using (exists (
    select 1 from public.contas c where c.id = conta_principal_id and c.usuario_id = (select auth.uid())
  ));
create policy "usuario consulta suas transferencias de investimentos" on public.transferencias_investimento
  for select to authenticated using (exists (
    select 1 from public.contas c where c.id = conta_principal_id and c.usuario_id = (select auth.uid())
  ));

-- Abrange contas antigas e contas abertas futuramente, inclusive pela RPC abrir_conta.
create function public.criar_conta_investimento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.contas_investimento (conta_principal_id) values (new.id)
    on conflict (conta_principal_id) do nothing;
  return new;
end;
$$;
revoke all on function public.criar_conta_investimento() from public, anon, authenticated;
create trigger criar_investimento_apos_conta after insert on public.contas
  for each row execute function public.criar_conta_investimento();
insert into public.contas_investimento (conta_principal_id)
  select id from public.contas on conflict (conta_principal_id) do nothing;

-- Somente o backend de serviço pode enviar cotações. A RPC bloqueia as duas
-- contas e registra o movimento na mesma transação dos débitos/créditos.
create function public.transferir_conta_investimento(
  p_usuario_id uuid, p_direcao text, p_valor_centavos bigint,
  p_moeda_principal text, p_cotacoes jsonb, p_requisicao_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_principal public.contas;
  v_investimento public.contas_investimento;
  v_anterior public.transferencias_investimento;
  v_origem text;
  v_destino text;
  v_convertido bigint;
  v_cotacao_em timestamptz;
  v_transferencia_id uuid;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  if p_direcao is null or p_direcao not in ('PARA_INVESTIMENTOS', 'PARA_PRINCIPAL')
    or p_valor_centavos is null or p_valor_centavos not between 1 and 9007199254740991
    or p_requisicao_id is null then raise exception 'Transferência inválida'; end if;

  select * into v_principal from public.contas where usuario_id = p_usuario_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  select * into v_investimento from public.contas_investimento
    where conta_principal_id = v_principal.id for update;
  if not found then raise exception 'Conta de investimentos não encontrada'; end if;

  select * into v_anterior from public.transferencias_investimento
    where conta_principal_id = v_principal.id and requisicao_id = p_requisicao_id;
  if found then
    if v_anterior.direcao <> p_direcao or v_anterior.valor_origem_centavos <> p_valor_centavos then
      raise exception 'Identificador de transferência já utilizado';
    end if;
    return jsonb_build_object('id', v_anterior.id, 'direcao', v_anterior.direcao,
      'valor_origem_centavos', v_anterior.valor_origem_centavos, 'moeda_origem', v_anterior.moeda_origem,
      'valor_destino_centavos', v_anterior.valor_destino_centavos, 'moeda_destino', v_anterior.moeda_destino,
      'cotacao_em', v_anterior.cotacao_em);
  end if;

  if v_principal.moeda_saldo <> p_moeda_principal then
    raise exception 'Moeda da conta mudou. Atualize e tente novamente'; end if;
  v_origem := case when p_direcao = 'PARA_INVESTIMENTOS' then v_principal.moeda_saldo else 'BRL' end;
  v_destino := case when p_direcao = 'PARA_INVESTIMENTOS' then 'BRL' else v_principal.moeda_saldo end;
  if p_direcao = 'PARA_INVESTIMENTOS' and v_principal.saldo_centavos < p_valor_centavos then
    raise exception 'Saldo insuficiente na conta principal'; end if;
  if p_direcao = 'PARA_PRINCIPAL' and v_investimento.saldo_centavos < p_valor_centavos then
    raise exception 'Saldo insuficiente na conta de investimentos'; end if;

  v_convertido := public.converter_centavos(p_valor_centavos, v_origem, v_destino, p_cotacoes);
  if p_direcao = 'PARA_INVESTIMENTOS' then
    if v_investimento.saldo_centavos > 9007199254740991 - v_convertido then
      raise exception 'Limite de saldo excedido'; end if;
  else
    if v_principal.saldo_centavos > 9007199254740991 - v_convertido then
      raise exception 'Limite de saldo excedido'; end if;
  end if;
  v_cotacao_em := case when v_origem = v_destino then null
    else (p_cotacoes -> (case when v_origem = 'BRL' then v_destino else v_origem end) ->> 'timestamp')::timestamptz end;

  if p_direcao = 'PARA_INVESTIMENTOS' then
    update public.contas set saldo_centavos = saldo_centavos - p_valor_centavos where id = v_principal.id;
    update public.contas_investimento set saldo_centavos = saldo_centavos + v_convertido
      where conta_principal_id = v_principal.id;
  else
    update public.contas_investimento set saldo_centavos = saldo_centavos - p_valor_centavos
      where conta_principal_id = v_principal.id;
    update public.contas set saldo_centavos = saldo_centavos + v_convertido where id = v_principal.id;
  end if;
  insert into public.transferencias_investimento
    (conta_principal_id, requisicao_id, direcao, valor_origem_centavos, moeda_origem,
     valor_destino_centavos, moeda_destino, cotacao_em)
  values (v_principal.id, p_requisicao_id, p_direcao, p_valor_centavos, v_origem,
    v_convertido, v_destino, v_cotacao_em) returning id into v_transferencia_id;
  return jsonb_build_object('id', v_transferencia_id, 'direcao', p_direcao,
    'valor_origem_centavos', p_valor_centavos, 'moeda_origem', v_origem,
    'valor_destino_centavos', v_convertido, 'moeda_destino', v_destino,
    'cotacao_em', v_cotacao_em);
end;
$$;
revoke all on function public.transferir_conta_investimento(uuid, text, bigint, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.transferir_conta_investimento(uuid, text, bigint, text, jsonb, uuid)
  to service_role;
