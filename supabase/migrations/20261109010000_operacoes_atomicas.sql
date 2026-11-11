-- Operações de demonstração. Dinheiro é simulado; depósito não representa
-- pagamento real. Cada chamada RPC é uma transação no Postgres.

-- O limite mantém valores bigint exatos também quando a API os recebe em JSON.
alter table public.contas add constraint saldo_seguro_json
  check (saldo_centavos <= 9007199254740991);
alter table public.ativos add constraint preco_seguro_json
  check (preco_centavos <= 9007199254740991);
alter table public.posicoes add constraint quantidade_segura_json
  check (quantidade_micros <= 9007199254740991);
alter table public.movimentacoes add constraint movimento_seguro_json
  check (valor_centavos <= 9007199254740991
    and (quantidade_micros is null or quantidade_micros <= 9007199254740991));

create function public.depositar(p_valor_centavos bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_saldo bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0
    or p_valor_centavos > 9007199254740991 then
    raise exception 'Valor inválido';
  end if;

  select id, saldo_centavos into v_conta_id, v_saldo
  from public.contas
  where usuario_id = (select auth.uid())
  for update;

  if v_conta_id is null then
    raise exception 'Conta não encontrada';
  end if;
  if v_saldo > 9007199254740991 - p_valor_centavos then
    raise exception 'Limite de saldo excedido';
  end if;

  update public.contas
  set saldo_centavos = saldo_centavos + p_valor_centavos
  where id = v_conta_id
  returning saldo_centavos into v_saldo;

  insert into public.movimentacoes (conta_id, tipo, valor_centavos)
  values (v_conta_id, 'DEPOSITO', p_valor_centavos);

  return v_saldo;
end;
$$;

create function public.comprar(p_ativo_codigo text, p_quantidade_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_saldo bigint;
  v_preco bigint;
  v_total bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;
  if p_quantidade_micros is null or p_quantidade_micros <= 0
    or p_quantidade_micros > 9007199254740991 then
    raise exception 'Quantidade inválida';
  end if;

  select id, saldo_centavos into v_conta_id, v_saldo
  from public.contas
  where usuario_id = (select auth.uid())
  for update;

  if v_conta_id is null then
    raise exception 'Conta não encontrada';
  end if;

  select preco_centavos into v_preco
  from public.ativos
  where codigo = p_ativo_codigo;

  if v_preco is null then
    raise exception 'Ativo não encontrado';
  end if;

  -- Usa numeric no cálculo intermediário para evitar overflow de bigint.
  if round(v_preco::numeric * p_quantidade_micros::numeric / 1000000) > 9007199254740991 then
    raise exception 'Valor da operação excede o limite';
  end if;
  v_total := round(v_preco::numeric * p_quantidade_micros::numeric / 1000000)::bigint;
  if v_total < 1 then
    raise exception 'Valor mínimo da operação é R$ 0,01';
  end if;
  if v_total > v_saldo then
    raise exception 'Saldo insuficiente';
  end if;

  update public.contas
  set saldo_centavos = saldo_centavos - v_total
  where id = v_conta_id;

  insert into public.posicoes (conta_id, ativo_codigo, quantidade_micros)
  values (v_conta_id, p_ativo_codigo, p_quantidade_micros)
  on conflict (conta_id, ativo_codigo) do update
    set quantidade_micros = public.posicoes.quantidade_micros + excluded.quantidade_micros;

  insert into public.movimentacoes
    (conta_id, tipo, valor_centavos, ativo_codigo, quantidade_micros)
  values (v_conta_id, 'COMPRA', v_total, p_ativo_codigo, p_quantidade_micros);

  return v_total;
end;
$$;

create function public.vender(p_ativo_codigo text, p_quantidade_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conta_id uuid;
  v_saldo bigint;
  v_preco bigint;
  v_posicao bigint;
  v_total bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;
  if p_quantidade_micros is null or p_quantidade_micros <= 0
    or p_quantidade_micros > 9007199254740991 then
    raise exception 'Quantidade inválida';
  end if;

  select id, saldo_centavos into v_conta_id, v_saldo
  from public.contas
  where usuario_id = (select auth.uid())
  for update;

  if v_conta_id is null then
    raise exception 'Conta não encontrada';
  end if;

  select preco_centavos into v_preco
  from public.ativos
  where codigo = p_ativo_codigo;

  if v_preco is null then
    raise exception 'Ativo não encontrado';
  end if;

  select quantidade_micros into v_posicao
  from public.posicoes
  where conta_id = v_conta_id and ativo_codigo = p_ativo_codigo
  for update;

  if v_posicao is null or v_posicao < p_quantidade_micros then
    raise exception 'Quantidade insuficiente';
  end if;

  if round(v_preco::numeric * p_quantidade_micros::numeric / 1000000) > 9007199254740991 then
    raise exception 'Valor da operação excede o limite';
  end if;
  v_total := round(v_preco::numeric * p_quantidade_micros::numeric / 1000000)::bigint;
  if v_total < 1 then
    raise exception 'Valor mínimo da operação é R$ 0,01';
  end if;
  if v_saldo > 9007199254740991 - v_total then
    raise exception 'Limite de saldo excedido';
  end if;

  if v_posicao = p_quantidade_micros then
    delete from public.posicoes
    where conta_id = v_conta_id and ativo_codigo = p_ativo_codigo;
  else
    update public.posicoes
    set quantidade_micros = quantidade_micros - p_quantidade_micros
    where conta_id = v_conta_id and ativo_codigo = p_ativo_codigo;
  end if;

  update public.contas
  set saldo_centavos = saldo_centavos + v_total
  where id = v_conta_id;

  insert into public.movimentacoes
    (conta_id, tipo, valor_centavos, ativo_codigo, quantidade_micros)
  values (v_conta_id, 'VENDA', v_total, p_ativo_codigo, p_quantidade_micros);

  return v_total;
end;
$$;

revoke all on function public.depositar(bigint) from public, anon;
revoke all on function public.comprar(text, bigint) from public, anon;
revoke all on function public.vender(text, bigint) from public, anon;
grant execute on function public.depositar(bigint) to authenticated;
grant execute on function public.comprar(text, bigint) to authenticated;
grant execute on function public.vender(text, bigint) to authenticated;
