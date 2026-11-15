-- O saldo da conta fica em centavos da moeda selecionada. Contas antigas seguem em BRL.
alter table public.contas add column moeda_saldo text not null default 'BRL'
  check (moeda_saldo in ('BRL', 'USD', 'EUR'));

alter table public.movimentacoes add column moeda text not null default 'BRL'
  check (moeda in ('BRL', 'USD', 'EUR'));
alter table public.movimentacoes add column moeda_destino text
  check (moeda_destino in ('BRL', 'USD', 'EUR'));
alter table public.movimentacoes add column valor_destino_centavos bigint
  check (valor_destino_centavos between 0 and 9007199254740991);
alter table public.movimentacoes add column cotacao_em timestamptz;
alter table public.movimentacoes drop constraint movimentacoes_tipo_check;
alter table public.movimentacoes add constraint movimentacoes_tipo_check
  check (tipo in ('DEPOSITO', 'COMPRA', 'VENDA', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'CONVERSAO'));
alter table public.movimentacoes drop constraint movimento_ativo_coerente;
alter table public.movimentacoes add constraint movimento_ativo_coerente check (
  (tipo in ('DEPOSITO', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'CONVERSAO')
    and ativo_codigo is null and quantidade_micros is null)
  or (tipo in ('COMPRA', 'VENDA') and ativo_codigo is not null
    and quantidade_micros is not null and quantidade_micros > 0)
);

-- RPCs antigos fazem contas exclusivamente em reais. O gatilho impede seu uso
-- sobre saldos estrangeiros, inclusive por chamadas diretas autenticadas.
create function public.proteger_saldo_moeda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.moeda_saldo <> 'BRL' or new.moeda_saldo <> 'BRL')
    and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Converta o saldo para BRL antes desta operação';
  end if;
  return new;
end;
$$;
create trigger proteger_saldo_moeda before update of saldo_centavos, moeda_saldo
  on public.contas for each row execute function public.proteger_saldo_moeda();
revoke all on function public.proteger_saldo_moeda() from public, anon, authenticated;

-- Apenas a Edge Function com chave de serviço pode fornecer cotações externas.
-- Um cliente autenticado nunca pode enviar uma taxa escolhida por ele ao banco.
create function public.converter_centavos(
  p_valor bigint, p_origem text, p_destino text, p_cotacoes jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_compra numeric := 1;
  v_venda numeric := 1;
  v_item jsonb;
  v_resultado numeric;
  v_codigo text;
begin
  if p_valor < 0 or p_valor > 9007199254740991
    or p_origem not in ('BRL', 'USD', 'EUR')
    or p_destino not in ('BRL', 'USD', 'EUR') then
    raise exception 'Valor ou moeda inválida';
  end if;
  if p_origem = p_destino then return p_valor; end if;
  if p_valor = 0 then return 0; end if;
  foreach v_codigo in array array['USD', 'EUR'] loop
    if v_codigo = p_origem or v_codigo = p_destino then
      v_item := p_cotacoes -> v_codigo;
      if v_item is null or (v_item ->> 'bid') !~ '^\d{1,8}(\.\d{1,8})?$'
        or (v_item ->> 'ask') !~ '^\d{1,8}(\.\d{1,8})?$'
        or (v_item ->> 'timestamp') is null then
        raise exception 'Cotação inválida';
      end if;
      if (v_item ->> 'bid')::numeric <= 0
        or (v_item ->> 'ask')::numeric < (v_item ->> 'bid')::numeric
        or (v_item ->> 'timestamp')::timestamptz > now() + interval '5 minutes'
        or (v_item ->> 'timestamp')::timestamptz < now() - interval '7 days' then
        raise exception 'Cotação inválida ou desatualizada';
      end if;
    end if;
  end loop;
  if p_origem <> 'BRL' then v_compra := (p_cotacoes -> p_origem ->> 'bid')::numeric; end if;
  if p_destino <> 'BRL' then v_venda := (p_cotacoes -> p_destino ->> 'ask')::numeric; end if;
  v_resultado := trunc(p_valor::numeric * v_compra / v_venda);
  if v_resultado > 9007199254740991 then raise exception 'Limite de saldo excedido'; end if;
  if p_valor > 0 and v_resultado < 1 then raise exception 'Valor inferior a um centavo na moeda de destino'; end if;
  return v_resultado::bigint;
end;
$$;
revoke all on function public.converter_centavos(bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.converter_centavos(bigint, text, text, jsonb) to service_role;

create function public.converter_saldo(
  p_usuario_id uuid, p_moeda_destino text, p_moeda_origem text, p_cotacoes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conta public.contas;
  v_novo bigint;
  v_cotacao_em timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  select * into v_conta from public.contas where usuario_id = p_usuario_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if v_conta.moeda_saldo <> p_moeda_origem then raise exception 'Moeda da conta mudou. Atualize e tente novamente'; end if;
  if p_moeda_destino not in ('BRL', 'USD', 'EUR') or p_moeda_destino = p_moeda_origem then
    raise exception 'Selecione uma moeda de destino diferente';
  end if;
  v_novo := public.converter_centavos(v_conta.saldo_centavos, p_moeda_origem, p_moeda_destino, p_cotacoes);
  v_cotacao_em := nullif(least(
    coalesce((p_cotacoes -> 'USD' ->> 'timestamp')::timestamptz, now()),
    coalesce((p_cotacoes -> 'EUR' ->> 'timestamp')::timestamptz, now())
  ), now());
  update public.contas set saldo_centavos = v_novo, moeda_saldo = p_moeda_destino where id = v_conta.id;
  if v_conta.saldo_centavos > 0 then
    insert into public.movimentacoes
      (conta_id, tipo, valor_centavos, moeda, moeda_destino, valor_destino_centavos, cotacao_em)
    values (v_conta.id, 'CONVERSAO', v_conta.saldo_centavos, p_moeda_origem,
      p_moeda_destino, v_novo, v_cotacao_em);
  end if;
  return jsonb_build_object('moeda', p_moeda_destino, 'saldo', v_novo, 'cotacao_em', v_cotacao_em);
end;
$$;
revoke all on function public.converter_saldo(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.converter_saldo(uuid, text, text, jsonb) to service_role;

-- O Pix antigo só entende BRL e não pode contornar a conversão.
revoke execute on function public.transferir_pix(text, bigint) from authenticated;

create function public.transferir_pix_convertido(
  p_usuario_id uuid, p_chave_destino text, p_valor_centavos bigint,
  p_moeda_origem text, p_moeda_destino text, p_cotacoes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_origem public.contas;
  v_destino public.contas;
  v_destino_id uuid;
  v_novo bigint;
  v_cotacao_em timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  if p_valor_centavos is null or p_valor_centavos not between 1 and 9007199254740991 then
    raise exception 'Valor inválido';
  end if;
  if p_chave_destino is null or char_length(btrim(p_chave_destino)) not between 3 and 255 then
    raise exception 'Chave de destino inválida';
  end if;
  select c.id into v_destino_id from public.contas c
    join public.chaves_pix p on p.usuario_id = c.usuario_id
    where p.chave = lower(btrim(p_chave_destino));
  if v_destino_id is null then raise exception 'Conta não encontrada'; end if;
  if v_destino_id = (select id from public.contas where usuario_id = p_usuario_id) then
    raise exception 'Não é possível transferir para a própria conta';
  end if;
  perform 1 from public.contas where id in
    ((select id from public.contas where usuario_id = p_usuario_id), v_destino_id)
    order by id for update;
  select * into v_origem from public.contas where usuario_id = p_usuario_id;
  select * into v_destino from public.contas where id = v_destino_id;
  if v_origem.id is null then raise exception 'Conta não encontrada'; end if;
  if v_origem.moeda_saldo <> p_moeda_origem or v_destino.moeda_saldo <> p_moeda_destino then
    raise exception 'Moeda da conta mudou. Atualize e tente novamente';
  end if;
  if v_origem.saldo_centavos < p_valor_centavos then raise exception 'Saldo insuficiente'; end if;
  v_novo := public.converter_centavos(p_valor_centavos, p_moeda_origem, p_moeda_destino, p_cotacoes);
  if v_destino.saldo_centavos > 9007199254740991 - v_novo then raise exception 'Limite de saldo excedido'; end if;
  v_cotacao_em := case when p_moeda_origem = p_moeda_destino then null else
    least(coalesce((p_cotacoes -> 'USD' ->> 'timestamp')::timestamptz, now()),
      coalesce((p_cotacoes -> 'EUR' ->> 'timestamp')::timestamptz, now())) end;
  update public.contas set saldo_centavos = saldo_centavos - p_valor_centavos where id = v_origem.id;
  update public.contas set saldo_centavos = saldo_centavos + v_novo where id = v_destino.id;
  insert into public.movimentacoes
    (conta_id, tipo, valor_centavos, moeda, moeda_destino, valor_destino_centavos, cotacao_em)
  values
    (v_origem.id, 'PIX_ENVIADO', p_valor_centavos, p_moeda_origem, p_moeda_destino, v_novo, v_cotacao_em),
    (v_destino.id, 'PIX_RECEBIDO', v_novo, p_moeda_destino, p_moeda_origem, p_valor_centavos, v_cotacao_em);
  return jsonb_build_object('moeda_recebida', p_moeda_destino,
    'valor_recebido_centavos', v_novo, 'cotacao_em', v_cotacao_em);
end;
$$;
revoke all on function public.transferir_pix_convertido(uuid, text, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.transferir_pix_convertido(uuid, text, bigint, text, text, jsonb) to service_role;
