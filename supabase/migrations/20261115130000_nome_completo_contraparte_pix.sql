-- Salva nome e sobrenome da outra ponta em cada Pix novo.
create or replace function public.transferir_pix_convertido(
  p_usuario_id uuid, p_chave_destino text, p_valor_centavos bigint,
  p_moeda_origem text, p_moeda_destino text, p_cotacoes jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_origem public.contas;
  v_destino public.contas;
  v_destino_id uuid;
  v_novo bigint;
  v_cotacao_em timestamptz;
  v_origem_nome text;
  v_destino_nome text;
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
  select nullif(btrim(concat_ws(' ', raw_user_meta_data ->> 'first_name', raw_user_meta_data ->> 'last_name')), '') into v_origem_nome
    from auth.users where id = v_origem.usuario_id;
  select nullif(btrim(concat_ws(' ', raw_user_meta_data ->> 'first_name', raw_user_meta_data ->> 'last_name')), '') into v_destino_nome
    from auth.users where id = v_destino.usuario_id;
  update public.contas set saldo_centavos = saldo_centavos - p_valor_centavos where id = v_origem.id;
  update public.contas set saldo_centavos = saldo_centavos + v_novo where id = v_destino.id;
  insert into public.movimentacoes
    (conta_id, tipo, valor_centavos, moeda, moeda_destino, valor_destino_centavos, cotacao_em, contraparte_nome)
  values
    (v_origem.id, 'PIX_ENVIADO', p_valor_centavos, p_moeda_origem, p_moeda_destino, v_novo, v_cotacao_em, v_destino_nome),
    (v_destino.id, 'PIX_RECEBIDO', v_novo, p_moeda_destino, p_moeda_origem, p_valor_centavos, v_cotacao_em, v_origem_nome);
  return jsonb_build_object('moeda_recebida', p_moeda_destino,
    'valor_recebido_centavos', v_novo, 'cotacao_em', v_cotacao_em);
end;
$$;
revoke all on function public.transferir_pix_convertido(uuid, text, bigint, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.transferir_pix_convertido(uuid, text, bigint, text, text, jsonb) to service_role;
