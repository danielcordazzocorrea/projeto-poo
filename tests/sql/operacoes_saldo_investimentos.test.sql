-- Execute em um banco de testes com as migrações aplicadas. A transação é descartada.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('7eb0b492-81fd-4cab-bb74-6995622b0033', 'investimentos-saldo-teste@example.invalid',
   '{"first_name":"Teste","last_name":"Investidor"}');

set local request.jwt.claim.role = 'service_role';
set local role service_role;

update public.contas set saldo_centavos = 10000, moeda_saldo = 'EUR'
  where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0033';
update public.contas_investimento set saldo_centavos = 10000
  where conta_principal_id = (select id from public.contas
    where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0033');

select public.comprar_ativo_investimento(
  '7eb0b492-81fd-4cab-bb74-6995622b0033', 'PETR4', 2000000, 2000,
  '7eb0b492-81fd-4cab-bb74-6995622b0034');
-- Repetir a mesma requisição não pode cobrar duas vezes.
select public.comprar_ativo_investimento(
  '7eb0b492-81fd-4cab-bb74-6995622b0033', 'PETR4', 2000000, 2000,
  '7eb0b492-81fd-4cab-bb74-6995622b0034');
select public.vender_ativo_investimento(
  '7eb0b492-81fd-4cab-bb74-6995622b0033', 'PETR4', 1000000, 2500,
  '7eb0b492-81fd-4cab-bb74-6995622b0035');
-- Repetir a venda não pode creditar duas vezes.
select public.vender_ativo_investimento(
  '7eb0b492-81fd-4cab-bb74-6995622b0033', 'PETR4', 1000000, 2500,
  '7eb0b492-81fd-4cab-bb74-6995622b0035');

reset role;
do $$
declare
  v_conta_id uuid;
begin
  select id into v_conta_id from public.contas
    where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0033';
  if (select saldo_centavos from public.contas where id = v_conta_id) <> 10000
    or (select moeda_saldo from public.contas where id = v_conta_id) <> 'EUR' then
    raise exception 'A conta principal foi alterada pela compra ou venda';
  end if;
  if (select saldo_centavos from public.contas_investimento
    where conta_principal_id = v_conta_id) <> 8500 then
    raise exception 'Saldo de investimentos incorreto após compra e venda';
  end if;
  if (select quantidade_micros from public.posicoes_investimento
    where conta_principal_id = v_conta_id and ativo_codigo = 'PETR4') <> 1000000 then
    raise exception 'Posição incorreta após compra e venda';
  end if;
  if (select count(*) from public.compras_investimento
    where conta_principal_id = v_conta_id) <> 1
    or (select count(*) from public.vendas_investimento
      where conta_principal_id = v_conta_id) <> 1 then
    raise exception 'As requisições repetidas geraram operações duplicadas';
  end if;
end;
$$;

rollback;
