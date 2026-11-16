alter table public.compras_investimento add column cotacao_em timestamptz;

-- O comprovante e o horário da cotação são salvos na mesma transação da compra.
create function public.comprar_ativo_com_comprovante(
  p_usuario_id uuid, p_ativo_codigo text, p_quantidade_micros bigint,
  p_preco_centavos bigint, p_requisicao_id uuid, p_cotacao_em timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_conta_id uuid;
  v_compra public.compras_investimento;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  select id into v_conta_id from public.contas where usuario_id = p_usuario_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;

  select * into v_compra from public.compras_investimento
    where conta_principal_id = v_conta_id and requisicao_id = p_requisicao_id;
  if found then
    if v_compra.ativo_codigo is distinct from p_ativo_codigo
      or v_compra.quantidade_micros is distinct from p_quantidade_micros then
      raise exception 'Identificador de compra já utilizado';
    end if;
  else
    perform public.comprar_ativo_investimento(p_usuario_id, p_ativo_codigo,
      p_quantidade_micros, p_preco_centavos, p_requisicao_id);
    update public.compras_investimento set cotacao_em = p_cotacao_em
      where conta_principal_id = v_conta_id and requisicao_id = p_requisicao_id
      returning * into v_compra;
  end if;
  return to_jsonb(v_compra);
end;
$$;
revoke all on function public.comprar_ativo_com_comprovante(uuid,text,bigint,bigint,uuid,timestamptz)
  from public, anon, authenticated;
grant execute on function public.comprar_ativo_com_comprovante(uuid,text,bigint,bigint,uuid,timestamptz)
  to service_role;
