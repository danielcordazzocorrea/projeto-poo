create table public.vendas_investimento (
  id uuid primary key default gen_random_uuid(),
  conta_principal_id uuid not null references public.contas(id) on delete cascade,
  requisicao_id uuid not null,
  ativo_codigo text not null check (ativo_codigo ~ '^[A-Z]{4}[0-9]{1,2}$'),
  quantidade_micros bigint not null check (quantidade_micros between 1 and 9007199254740991),
  preco_centavos bigint not null check (preco_centavos between 1 and 9007199254740991),
  valor_centavos bigint not null check (valor_centavos between 1 and 9007199254740991),
  criada_em timestamptz not null default now(),
  unique (conta_principal_id, requisicao_id)
);
alter table public.vendas_investimento enable row level security;
revoke all on public.vendas_investimento from anon, authenticated;
grant select on public.vendas_investimento to authenticated;
create policy "usuario consulta suas vendas de investimentos" on public.vendas_investimento
  for select to authenticated using (exists (
    select 1 from public.contas c where c.id = conta_principal_id and c.usuario_id = (select auth.uid())
  ));

create function public.vender_ativo_investimento(
  p_usuario_id uuid, p_ativo_codigo text, p_quantidade_micros bigint,
  p_preco_centavos bigint, p_requisicao_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_principal public.contas;
  v_posicao public.posicoes_investimento;
  v_anterior public.vendas_investimento;
  v_valor bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Acesso negado'; end if;
  if p_usuario_id is null or p_ativo_codigo !~ '^[A-Z]{4}[0-9]{1,2}$'
    or p_quantidade_micros not between 1 and 9007199254740991
    or p_preco_centavos not between 1 and 9007199254740991 or p_requisicao_id is null then
    raise exception 'Venda inválida'; end if;
  select * into v_principal from public.contas where usuario_id = p_usuario_id for update;
  if not found then raise exception 'Conta não encontrada'; end if;
  if v_principal.moeda_saldo <> 'BRL' then raise exception 'Converta o saldo principal para BRL antes de vender ações'; end if;
  select * into v_anterior from public.vendas_investimento where conta_principal_id = v_principal.id and requisicao_id = p_requisicao_id;
  if found then return; end if;
  select * into v_posicao from public.posicoes_investimento where conta_principal_id = v_principal.id and ativo_codigo = p_ativo_codigo for update;
  if not found or v_posicao.quantidade_micros < p_quantidade_micros then raise exception 'Quantidade indisponível para venda'; end if;
  v_valor := floor(p_preco_centavos::numeric * p_quantidade_micros::numeric / 1000000)::bigint;
  if v_valor < 1 then raise exception 'Valor mínimo da venda é R$ 0,01'; end if;
  if v_principal.saldo_centavos > 9007199254740991 - v_valor then raise exception 'Limite de saldo excedido'; end if;
  update public.contas set saldo_centavos = saldo_centavos + v_valor where id = v_principal.id;
  if v_posicao.quantidade_micros = p_quantidade_micros then
    delete from public.posicoes_investimento where conta_principal_id = v_principal.id and ativo_codigo = p_ativo_codigo;
  else
    update public.posicoes_investimento set quantidade_micros = quantidade_micros - p_quantidade_micros
      where conta_principal_id = v_principal.id and ativo_codigo = p_ativo_codigo;
  end if;
  insert into public.vendas_investimento (conta_principal_id,requisicao_id,ativo_codigo,quantidade_micros,preco_centavos,valor_centavos)
  values (v_principal.id,p_requisicao_id,p_ativo_codigo,p_quantidade_micros,p_preco_centavos,v_valor);
end;
$$;
revoke all on function public.vender_ativo_investimento(uuid,text,bigint,bigint,uuid) from public, anon, authenticated;
grant execute on function public.vender_ativo_investimento(uuid,text,bigint,bigint,uuid) to service_role;
