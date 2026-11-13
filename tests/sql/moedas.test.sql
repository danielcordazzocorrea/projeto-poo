\set ON_ERROR_STOP on
create function pg_temp.verificar(ok boolean, mensagem text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Teste falhou: %', mensagem; end if;
end;
$$;
create function pg_temp.rejeitar(comando text, mensagem text) returns void language plpgsql as $$
begin
  begin
    execute comando;
  exception when others then
    if position(mensagem in sqlerrm) > 0 then return; end if;
    raise;
  end;
  raise exception 'Operação deveria falhar: %', comando;
end;
$$;

insert into auth.users values
  ('00000000-0000-0000-0000-000000000001', 'origem@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'destino@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'outro@example.com');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.depositar(100000);
select pg_temp.verificar((select tipo_moeda = 'BRL' from public.contas), 'padrão BRL');
select pg_temp.verificar((select count(*) = 3 from public.moedas), 'catálogo legível');
select pg_temp.rejeitar('update public.moedas set cotacao_brl_centavos = 1', 'permission denied');
select pg_temp.rejeitar('update public.contas set tipo_moeda = ''BTC''', 'permission denied');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.definir_moeda_recebimento('USD');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.verificar(public.transferir_com_conversao(' DESTINO@example.com ', 10000)->>'unidades_recebidas' = '2000', 'R$100 -> USD20');
select pg_temp.verificar((select saldo_centavos = 90000 from public.contas), 'débito em BRL');
select pg_temp.verificar((select count(*) = 0 from public.saldos_moedas), 'RLS esconde carteira alheia');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.verificar((select unidades = 2000 from public.saldos_moedas where tipo_moeda = 'USD'), 'crédito em USD');
select pg_temp.verificar((select saldo_centavos = 0 from public.contas), 'USD não vira saldo BRL');
select public.definir_moeda_recebimento('BTC');
select pg_temp.verificar((select unidades = 2000 from public.saldos_moedas where tipo_moeda = 'USD'), 'preferência preserva saldo USD');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.verificar(public.transferir_com_conversao('destino@example.com', 10000)->>'unidades_recebidas' = '33333', 'R$100 -> BTC0.00033333');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.definir_moeda_recebimento('BRL');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.transferir_com_conversao('destino@example.com', 10000);
-- O Pix antigo continua somente em reais.
select public.transferir_pix('destino@example.com', 100);
select pg_temp.verificar((select saldo_centavos = 69900 from public.contas), 'saldo após 3 transferências e Pix');
select pg_temp.verificar((select count(*) = 3 from public.transferencias_moedas), 'comprovantes');
select pg_temp.rejeitar('select public.transferir_com_conversao(''origem@example.com'', 1)', 'própria conta');
select pg_temp.rejeitar('select public.transferir_com_conversao(''ausente@example.com'', 1)', 'Conta não encontrada');
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 0)', 'Valor inválido');
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 70000)', 'Saldo insuficiente');
select pg_temp.rejeitar('select public.definir_moeda_recebimento(''EUR'')', 'Tipo de moeda');
set request.jwt.claim.sub = '';
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 100)', 'Autenticação obrigatória');

-- Uma falha DEPOIS de atualizar saldos precisa desfazer ambos os lados.
reset role;
create function public.falhar_comprovante_teste() returns trigger language plpgsql as $$
begin raise exception 'falha injetada'; end;
$$;
create trigger falha_teste before insert on public.transferencias_moedas
  for each row execute function public.falhar_comprovante_teste();
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 100)', 'falha injetada');
select pg_temp.verificar((select saldo_centavos = 69900 from public.contas), 'rollback do débito');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.verificar((select saldo_centavos = 10100 from public.contas), 'rollback do crédito');
reset role;
drop trigger falha_teste on public.transferencias_moedas;
drop function public.falhar_comprovante_teste();

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.definir_moeda_recebimento('USD');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 1)', 'menor unidade');
reset role;
update public.saldos_moedas set unidades = 9007199254740991 where tipo_moeda = 'USD';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.rejeitar('select public.transferir_com_conversao(''destino@example.com'', 100)', 'Limite de saldo');
select pg_temp.verificar((select saldo_centavos = 69900 from public.contas), 'recusas preservam saldo');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.verificar((select count(*) = 0 from public.transferencias_moedas), 'terceiro não lê comprovantes');
select pg_temp.verificar((select count(*) = 0 from public.saldos_moedas), 'terceiro não lê saldos');
reset role;
select pg_temp.verificar((select count(*) = 3 from public.transferencias_moedas), 'sem comprovantes em operações recusadas');
select pg_temp.verificar((select count(*) = 6 from public.movimentacoes where transferencia_id is not null), 'dois registros por transferência');
select 'Testes SQL de moedas passaram' as resultado;
