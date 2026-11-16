-- Executar em uma transação descartável depois das migrações.
insert into auth.users (id, email, raw_user_meta_data) values
  ('7eb0b492-81fd-4cab-bb74-6995622b0011', 'cambio-origem-teste@example.invalid', '{"first_name":"Ana"}'),
  ('7eb0b492-81fd-4cab-bb74-6995622b0022', 'cambio-destino-teste@example.invalid', '{"first_name":"Bruno"}');

update public.contas set saldo_centavos = 10000
  where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0011';

set local request.jwt.claim.role = 'service_role';
set local role service_role;

select public.converter_saldo(
  '7eb0b492-81fd-4cab-bb74-6995622b0011', 'USD', 'BRL',
  jsonb_build_object('USD', jsonb_build_object('bid', '5.20', 'ask', '5.25', 'timestamp', now()::text),
    'EUR', jsonb_build_object('bid', '6.10', 'ask', '6.15', 'timestamp', now()::text))
);
select public.converter_saldo(
  '7eb0b492-81fd-4cab-bb74-6995622b0022', 'EUR', 'BRL', '{}'::jsonb
);
select public.transferir_pix_convertido(
  '7eb0b492-81fd-4cab-bb74-6995622b0011',
  'cambio-destino-teste@example.invalid', 1000, 'USD', 'EUR',
  jsonb_build_object('USD', jsonb_build_object('bid', '5.20', 'ask', '5.25', 'timestamp', now()::text),
    'EUR', jsonb_build_object('bid', '6.10', 'ask', '6.15', 'timestamp', now()::text))
);

reset role;
do $$
begin
  if (select saldo_centavos from public.contas
    where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0011') <> 904 then
    raise exception 'Débito em USD incorreto';
  end if;
  if (select saldo_centavos from public.contas
    where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0022') <> 845 then
    raise exception 'Crédito em EUR incorreto';
  end if;
  if (select moeda_saldo from public.contas
    where usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0022') <> 'EUR' then
    raise exception 'Moeda do destinatário não foi preservada';
  end if;
  if (select count(*) from public.movimentacoes m join public.contas c on c.id = m.conta_id
    where c.usuario_id in ('7eb0b492-81fd-4cab-bb74-6995622b0011',
      '7eb0b492-81fd-4cab-bb74-6995622b0022')) <> 3 then
    raise exception 'Histórico da conversão e Pix incompleto';
  end if;
  if (select m.contraparte_nome from public.movimentacoes m join public.contas c on c.id = m.conta_id
    where c.usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0011' and m.tipo = 'PIX_ENVIADO') <> 'Bruno' then
    raise exception 'Pix enviado sem o nome do destinatário';
  end if;
  if (select m.contraparte_nome from public.movimentacoes m join public.contas c on c.id = m.conta_id
    where c.usuario_id = '7eb0b492-81fd-4cab-bb74-6995622b0022' and m.tipo = 'PIX_RECEBIDO') <> 'Ana' then
    raise exception 'Pix recebido sem o nome do remetente';
  end if;
end;
$$;
