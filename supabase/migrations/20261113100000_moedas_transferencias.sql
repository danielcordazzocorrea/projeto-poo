-- Câmbio interno SIMULADO. Não é Pix internacional nem transferência na blockchain.
create table public.moedas (
  tipo_moeda text primary key check (tipo_moeda in ('BRL', 'USD', 'BTC')),
  cotacao_brl_centavos bigint not null check (cotacao_brl_centavos between 1 and 9007199254740991),
  check (tipo_moeda <> 'BRL' or cotacao_brl_centavos = 100)
);
-- Exemplos didáticos: 1 USD = R$ 5; 1 BTC = R$ 300.000, sem cotação de mercado.
insert into public.moedas values ('BRL', 100), ('USD', 500), ('BTC', 30000000);
alter table public.contas add column tipo_moeda text not null default 'BRL'
  references public.moedas(tipo_moeda);

-- BRL continua exclusivamente em contas.saldo_centavos; USD usa centavos,
-- BTC usa satoshis (8 casas). Mudar a preferência não converte saldos existentes.
create table public.saldos_moedas (
  conta_id uuid not null references public.contas(id) on delete cascade,
  tipo_moeda text not null references public.moedas(tipo_moeda) check (tipo_moeda in ('USD', 'BTC')),
  unidades bigint not null default 0 check (unidades between 0 and 9007199254740991),
  primary key (conta_id, tipo_moeda)
);

-- Comprovante preserva a cotação usada, mesmo se o catálogo mudar depois.
create table public.transferencias_moedas (
  id uuid primary key default gen_random_uuid(),
  conta_origem_id uuid not null references public.contas(id),
  conta_destino_id uuid not null references public.contas(id),
  valor_brl_centavos bigint not null check (valor_brl_centavos between 1 and 9007199254740991),
  tipo_moeda text not null references public.moedas(tipo_moeda),
  unidades_recebidas bigint not null check (unidades_recebidas between 1 and 9007199254740991),
  cotacao_brl_centavos bigint not null check (cotacao_brl_centavos between 1 and 9007199254740991),
  criada_em timestamptz not null default now(),
  check (conta_origem_id <> conta_destino_id)
);
create index transferencias_moedas_origem_idx on public.transferencias_moedas(conta_origem_id, criada_em desc);
create index transferencias_moedas_destino_idx on public.transferencias_moedas(conta_destino_id, criada_em desc);

alter table public.moedas enable row level security;
alter table public.saldos_moedas enable row level security;
alter table public.transferencias_moedas enable row level security;
revoke all on public.moedas, public.saldos_moedas, public.transferencias_moedas from anon, authenticated;
grant select on public.moedas, public.saldos_moedas, public.transferencias_moedas to authenticated;
create policy "usuario consulta moedas" on public.moedas for select to authenticated using (true);
create policy "usuario consulta saldos em moeda" on public.saldos_moedas for select to authenticated
  using (exists (select 1 from public.contas c where c.id = conta_id and c.usuario_id = (select auth.uid())));
create policy "participantes consultam transferencia" on public.transferencias_moedas for select to authenticated
  using (exists (select 1 from public.contas c
    where c.id in (conta_origem_id, conta_destino_id) and c.usuario_id = (select auth.uid())));

alter table public.movimentacoes add column transferencia_id uuid references public.transferencias_moedas(id);
alter table public.movimentacoes drop constraint movimentacoes_tipo_check;
alter table public.movimentacoes add constraint movimentacoes_tipo_check check (
  tipo in ('DEPOSITO', 'COMPRA', 'VENDA', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECEBIDA')
);
alter table public.movimentacoes drop constraint movimento_ativo_coerente;
alter table public.movimentacoes add constraint movimento_ativo_coerente check (
  (tipo in ('DEPOSITO', 'PIX_ENVIADO', 'PIX_RECEBIDO', 'TRANSFERENCIA_ENVIADA', 'TRANSFERENCIA_RECEBIDA')
    and ativo_codigo is null and quantidade_micros is null)
  or (tipo in ('COMPRA', 'VENDA') and ativo_codigo is not null and quantidade_micros > 0 and quantidade_micros is not null)
);

create function public.definir_moeda_recebimento(p_tipo_moeda text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
  if p_tipo_moeda is null or p_tipo_moeda not in ('BRL', 'USD', 'BTC') then
    raise exception 'Tipo de moeda deve ser BRL, USD ou BTC';
  end if;
  update public.contas set tipo_moeda = p_tipo_moeda where usuario_id = (select auth.uid());
  if not found then raise exception 'Conta não encontrada'; end if;
end;
$$;

create function public.transferir_com_conversao(p_chave_destino text, p_valor_centavos bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_origem uuid;
  v_destino uuid;
  v_moeda text;
  v_cotacao bigint;
  v_unidades numeric;
  v_saldo bigint;
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Autenticação obrigatória'; end if;
  if p_valor_centavos is null or p_valor_centavos not between 1 and 9007199254740991 then
    raise exception 'Valor inválido';
  end if;
  if p_chave_destino is null or char_length(btrim(p_chave_destino)) not between 3 and 255 then
    raise exception 'Chave de destino inválida';
  end if;
  select id into v_origem from public.contas where usuario_id = (select auth.uid());
  select c.id into v_destino from public.contas c join public.chaves_pix p on p.usuario_id = c.usuario_id
    where p.chave = lower(btrim(p_chave_destino));
  if v_origem is null or v_destino is null then raise exception 'Conta não encontrada'; end if;
  if v_origem = v_destino then raise exception 'Não é possível transferir para a própria conta'; end if;

  -- Mesmo bloqueio ordenado usado pelo Pix: serializa as operações e a preferência.
  perform 1 from public.contas where id in (v_origem, v_destino) order by id for update;
  select saldo_centavos into v_saldo from public.contas where id = v_origem;
  if v_saldo < p_valor_centavos then raise exception 'Saldo insuficiente'; end if;
  select tipo_moeda into v_moeda from public.contas where id = v_destino;
  select cotacao_brl_centavos into v_cotacao from public.moedas where tipo_moeda = v_moeda for share;
  v_unidades := trunc(p_valor_centavos::numeric * (case when v_moeda = 'BTC' then 100000000 else 100 end) / v_cotacao);
  if v_unidades < 1 then raise exception 'Valor inferior à menor unidade da moeda de destino'; end if;
  if v_unidades > 9007199254740991 then raise exception 'Valor convertido excede o limite'; end if;

  if v_moeda = 'BRL' then
    select saldo_centavos into v_saldo from public.contas where id = v_destino;
  else
    select unidades into v_saldo from public.saldos_moedas where conta_id = v_destino and tipo_moeda = v_moeda;
    v_saldo := coalesce(v_saldo, 0);
  end if;
  if v_saldo::numeric + v_unidades > 9007199254740991 then raise exception 'Limite de saldo excedido'; end if;
  update public.contas set saldo_centavos = saldo_centavos - p_valor_centavos where id = v_origem;
  if v_moeda = 'BRL' then
    update public.contas set saldo_centavos = saldo_centavos + v_unidades::bigint where id = v_destino;
  else
    insert into public.saldos_moedas (conta_id, tipo_moeda, unidades) values (v_destino, v_moeda, v_unidades::bigint)
    on conflict (conta_id, tipo_moeda) do update set unidades = public.saldos_moedas.unidades + excluded.unidades;
  end if;
  insert into public.transferencias_moedas
    (conta_origem_id, conta_destino_id, valor_brl_centavos, tipo_moeda, unidades_recebidas, cotacao_brl_centavos)
    values (v_origem, v_destino, p_valor_centavos, v_moeda, v_unidades::bigint, v_cotacao) returning id into v_id;
  -- valor_centavos é o equivalente BRL; o comprovante guarda a moeda recebida.
  insert into public.movimentacoes (conta_id, tipo, valor_centavos, transferencia_id) values
    (v_origem, 'TRANSFERENCIA_ENVIADA', p_valor_centavos, v_id),
    (v_destino, 'TRANSFERENCIA_RECEBIDA', p_valor_centavos, v_id);
  return jsonb_build_object('id', v_id, 'tipo_moeda', v_moeda,
    'unidades_recebidas', v_unidades::bigint::text, 'cotacao_brl_centavos', v_cotacao::text);
end;
$$;
revoke all on function public.definir_moeda_recebimento(text) from public, anon;
revoke all on function public.transferir_com_conversao(text, bigint) from public, anon;
grant execute on function public.definir_moeda_recebimento(text) to authenticated;
grant execute on function public.transferir_com_conversao(text, bigint) to authenticated;
