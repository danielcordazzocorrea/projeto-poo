-- Executar após as migrações em um banco de teste.
do $$
declare
  taxas jsonb := jsonb_build_object(
    'USD', jsonb_build_object('bid', '5.20', 'ask', '5.25', 'timestamp', now()::text),
    'EUR', jsonb_build_object('bid', '6.10', 'ask', '6.15', 'timestamp', now()::text)
  );
begin
  if public.converter_centavos(10000, 'BRL', 'USD', taxas) <> 1904 then
    raise exception 'BRL para USD incorreto';
  end if;
  if public.converter_centavos(10000, 'USD', 'BRL', taxas) <> 52000 then
    raise exception 'USD para BRL incorreto';
  end if;
  if public.converter_centavos(10000, 'USD', 'EUR', taxas) <> 8455 then
    raise exception 'USD para EUR incorreto';
  end if;
  if public.converter_centavos(0, 'BRL', 'EUR', '{}'::jsonb) <> 0 then
    raise exception 'Saldo zero deveria permitir troca de moeda';
  end if;
  if has_function_privilege('authenticated',
    'public.transferir_pix(text,bigint)', 'EXECUTE') then
    raise exception 'Pix antigo não pode ser executado pelo usuário';
  end if;
  if has_function_privilege('authenticated',
    'public.transferir_pix_convertido(uuid,text,bigint,text,text,jsonb)', 'EXECUTE') then
    raise exception 'Cotação não pode ser escolhida pelo usuário';
  end if;
end;
$$;
