-- Compras simuladas executadas dentro da conta de investimentos.
create table public.compras_investimento (
  id uuid primary key default gen_random_uuid(),
  conta_principal_id uuid not null references public.contas(id) on delete cascade,
  requisicao_id uuid not null,
  ativo_codigo text not null check (ativo_codigo ~ '^[A-Z]{4}[0-9]{1,2}$'),
  quantidade_micros bigint not null check (quantidade_micros between 1 and 9007199254740991),
  preco_centavos bigint not null check (preco_centavos between 1 and 9007199254740991),
  custo_centavos bigint not null check (custo_centavos between 1 and 9007199254740991),
  criada_em timestamptz not null default now(),
  unique (conta_principal_id, requisicao_id)
);

create index compras_investimento_conta_data_idx
  on public.compras_investimento (conta_principal_id, criada_em desc);

alter table public.compras_investimento enable row level security;
revoke all on public.compras_investimento from anon, authenticated;
grant select on public.compras_investimento to authenticated;
create policy "usuario consulta suas compras de investimentos" on public.compras_investimento
  for select to authenticated using (exists (
    select 1 from public.contas c where c.id = conta_principal_id and c.usuario_id = (select auth.uid())
  ));

-- O preço vem da Edge Function, que consulta o provedor de cotações. O banco
-- bloqueia conta, saldo e posição para tornar o débito e o acréscimo atômicos.
create function public.comprar_ativo_investimento(
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
  if v_investimento.saldo_centavos < v_custo then raise exception 'Saldo insuficiente na conta de investimentos'; end if;

  update public.contas_investimento set saldo_centavos = saldo_centavos - v_custo
    where conta_principal_id = v_principal.id;
  insert into public.posicoes_investimento (conta_principal_id, ativo_codigo, quantidade_micros)
  values (v_principal.id, p_ativo_codigo, p_quantidade_micros)
  on conflict (conta_principal_id, ativo_codigo) do update
    set quantidade_micros = public.posicoes_investimento.quantidade_micros + excluded.quantidade_micros;
  insert into public.compras_investimento
    (conta_principal_id, requisicao_id, ativo_codigo, quantidade_micros, preco_centavos, custo_centavos)
  values (v_principal.id, p_requisicao_id, p_ativo_codigo, p_quantidade_micros, p_preco_centavos, v_custo);
end;
$$;

revoke all on function public.comprar_ativo_investimento(uuid, text, bigint, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.comprar_ativo_investimento(uuid, text, bigint, bigint, uuid)
  to service_role;
