-- Ações são compradas com o saldo da conta principal; a conta de
-- investimentos continua representando exclusivamente a renda fixa.
do $$
begin
  if exists (
    select 1
    from public.compras_investimento compra
    join public.contas conta on conta.id = compra.conta_principal_id
    group by conta.id, conta.saldo_centavos
    having conta.saldo_centavos < sum(compra.custo_centavos)
  ) then
    raise exception 'Saldo principal insuficiente para migrar compras de ações existentes';
  end if;

  update public.contas_investimento investimento
  set saldo_centavos = investimento.saldo_centavos + totais.custo_centavos
  from (
    select conta_principal_id, sum(custo_centavos)::bigint as custo_centavos
    from public.compras_investimento
    group by conta_principal_id
  ) totais
  where investimento.conta_principal_id = totais.conta_principal_id;

  update public.contas conta
  set saldo_centavos = conta.saldo_centavos - totais.custo_centavos
  from (
    select conta_principal_id, sum(custo_centavos)::bigint as custo_centavos
    from public.compras_investimento
    group by conta_principal_id
  ) totais
  where conta.id = totais.conta_principal_id;
end;
$$;

create or replace function public.comprar_ativo_investimento(
  p_usuario_id uuid, p_ativo_codigo text, p_quantidade_micros bigint,
  p_preco_centavos bigint, p_requisicao_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_principal public.contas;
  v_investimento public.contas_investimento;
  v_compra public.compras_investimento;
  v_custo bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  if p_usuario_id is null or p_ativo_codigo is null or p_ativo_codigo !~ '^[A-Z]{4}[0-9]{1,2}$'
    or p_quantidade_micros is null or p_quantidade_micros not between 1 and 9007199254740991
    or p_preco_centavos is null or p_preco_centavos not between 1 and 9007199254740991
    or p_requisicao_id is null then raise exception 'Compra inválida'; end if;

  select * into v_principal from public.contas where usuario_id = p_usuario_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if v_principal.moeda_saldo <> 'BRL' then
    raise exception 'Converta o saldo principal para BRL antes de comprar ações'; end if;
  select * into v_investimento from public.contas_investimento
    where conta_principal_id = v_principal.id for update;
  if not found then raise exception 'Conta de investimentos não encontrada'; end if;

  select * into v_compra from public.compras_investimento
    where conta_principal_id = v_principal.id and requisicao_id = p_requisicao_id;
  if found then
    if v_compra.ativo_codigo <> p_ativo_codigo or v_compra.quantidade_micros <> p_quantidade_micros
      or v_compra.preco_centavos <> p_preco_centavos then
      raise exception 'Identificador de compra já utilizado';
    end if;
    return;
  end if;

  if ceil(p_preco_centavos::numeric * p_quantidade_micros::numeric / 1000000) > 9007199254740991 then
    raise exception 'Valor da operação excede o limite'; end if;
  v_custo := ceil(p_preco_centavos::numeric * p_quantidade_micros::numeric / 1000000)::bigint;
  if v_principal.saldo_centavos < v_custo then raise exception 'Saldo insuficiente na conta principal'; end if;

  update public.contas set saldo_centavos = saldo_centavos - v_custo where id = v_principal.id;
  insert into public.posicoes_investimento (conta_principal_id, ativo_codigo, quantidade_micros)
  values (v_principal.id, p_ativo_codigo, p_quantidade_micros)
  on conflict (conta_principal_id, ativo_codigo) do update
    set quantidade_micros = public.posicoes_investimento.quantidade_micros + excluded.quantidade_micros;
  insert into public.compras_investimento
    (conta_principal_id, requisicao_id, ativo_codigo, quantidade_micros, preco_centavos, custo_centavos)
  values (v_principal.id, p_requisicao_id, p_ativo_codigo, p_quantidade_micros, p_preco_centavos, v_custo);
end;
$$;
