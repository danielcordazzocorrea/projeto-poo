-- Pix simulado: cada usuário recebe seu e-mail como chave e pode transferir
-- saldo entre contas da corretora. A transferência inteira ocorre em uma RPC.

create table public.chaves_pix (
  chave text primary key,
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  criada_em timestamptz not null default now(),
  constraint chave_pix_normalizada check (
    chave = lower(btrim(chave)) and char_length(chave) between 3 and 255
  )
);

alter table public.chaves_pix enable row level security;
revoke all on public.chaves_pix from anon, authenticated;
grant select on public.chaves_pix to authenticated;

create policy "usuario consulta a propria chave pix"
  on public.chaves_pix for select to authenticated
  using (usuario_id = (select auth.uid()));

-- Também atribui chave aos usuários existentes antes desta migração.
insert into public.chaves_pix (chave, usuario_id)
select lower(btrim(email)), id
from auth.users
where email is not null and btrim(email) <> ''
on conflict (chave) do nothing;

create function public.criar_chave_pix_ao_cadastrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is not null and btrim(new.email) <> '' then
    insert into public.chaves_pix (chave, usuario_id)
    values (lower(btrim(new.email)), new.id)
    on conflict (chave) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.criar_chave_pix_ao_cadastrar() from public, anon, authenticated;

create trigger criar_chave_pix_depois_do_cadastro
  after insert on auth.users
  for each row execute function public.criar_chave_pix_ao_cadastrar();

alter table public.movimentacoes drop constraint movimentacoes_tipo_check;
alter table public.movimentacoes add constraint movimentacoes_tipo_check
  check (tipo in ('DEPOSITO', 'COMPRA', 'VENDA', 'PIX_ENVIADO', 'PIX_RECEBIDO'));

alter table public.movimentacoes drop constraint movimento_ativo_coerente;
alter table public.movimentacoes add constraint movimento_ativo_coerente check (
  (tipo in ('DEPOSITO', 'PIX_ENVIADO', 'PIX_RECEBIDO')
    and ativo_codigo is null and quantidade_micros is null)
  or
  (tipo in ('COMPRA', 'VENDA') and ativo_codigo is not null
    and quantidade_micros is not null and quantidade_micros > 0)
);

create function public.transferir_pix(p_chave_destino text, p_valor_centavos bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_destino_id uuid;
  v_conta_origem_id uuid;
  v_conta_destino_id uuid;
  v_saldo_origem bigint;
  v_saldo_destino bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação obrigatória';
  end if;
  if p_chave_destino is null or char_length(btrim(p_chave_destino)) < 3
    or char_length(btrim(p_chave_destino)) > 255 then
    raise exception 'Chave Pix inválida';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0
    or p_valor_centavos > 9007199254740991 then
    raise exception 'Valor inválido';
  end if;

  select usuario_id into v_usuario_destino_id
  from public.chaves_pix
  where chave = lower(btrim(p_chave_destino));
  if v_usuario_destino_id is null then
    raise exception 'Chave Pix não encontrada';
  end if;
  if v_usuario_destino_id = (select auth.uid()) then
    raise exception 'Não é possível enviar Pix para a própria chave';
  end if;

  select id into v_conta_origem_id
  from public.contas where usuario_id = (select auth.uid());
  select id into v_conta_destino_id
  from public.contas where usuario_id = v_usuario_destino_id;
  if v_conta_origem_id is null or v_conta_destino_id is null then
    raise exception 'Conta Pix não encontrada';
  end if;

  -- Bloqueia as duas contas em ordem estável para impedir saldo negativo e deadlocks.
  perform 1 from public.contas
  where id in (v_conta_origem_id, v_conta_destino_id)
  order by id for update;

  select saldo_centavos into v_saldo_origem
  from public.contas where id = v_conta_origem_id;
  select saldo_centavos into v_saldo_destino
  from public.contas where id = v_conta_destino_id;
  if v_saldo_origem < p_valor_centavos then
    raise exception 'Saldo insuficiente';
  end if;
  if v_saldo_destino > 9007199254740991 - p_valor_centavos then
    raise exception 'Limite de saldo excedido para a conta destinatária';
  end if;

  update public.contas set saldo_centavos = saldo_centavos - p_valor_centavos
  where id = v_conta_origem_id;
  update public.contas set saldo_centavos = saldo_centavos + p_valor_centavos
  where id = v_conta_destino_id;

  insert into public.movimentacoes (conta_id, tipo, valor_centavos)
  values
    (v_conta_origem_id, 'PIX_ENVIADO', p_valor_centavos),
    (v_conta_destino_id, 'PIX_RECEBIDO', p_valor_centavos);
end;
$$;

revoke all on function public.transferir_pix(text, bigint) from public, anon;
grant execute on function public.transferir_pix(text, bigint) to authenticated;
