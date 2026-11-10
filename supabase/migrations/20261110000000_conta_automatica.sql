-- Cadastro no Supabase Auth também cria a conta da corretora com saldo zero.
-- A função é acionada pelo trigger, não por uma chamada direta do frontend.

create function public.criar_conta_ao_cadastrar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.contas (usuario_id)
  values (new.id)
  on conflict (usuario_id) do nothing;
  return new;
end;
$$;

revoke all on function public.criar_conta_ao_cadastrar() from public, anon, authenticated;

create trigger criar_conta_depois_do_cadastro
  after insert on auth.users
  for each row execute function public.criar_conta_ao_cadastrar();

-- Também cobre usuários criados antes desta migração.
insert into public.contas (usuario_id)
select id from auth.users
on conflict (usuario_id) do nothing;
