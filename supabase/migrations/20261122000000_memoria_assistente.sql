-- Uma conversa persistente por usuário, isolada por RLS.
create table public.assistente_mensagens (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant')),
  conteudo text not null check (char_length(conteudo) between 1 and 8000),
  criada_em timestamptz not null default now()
);

create index assistente_mensagens_usuario_id_idx
  on public.assistente_mensagens (usuario_id, id desc);

alter table public.assistente_mensagens enable row level security;
revoke all on public.assistente_mensagens from anon, authenticated;
grant select, delete on public.assistente_mensagens to authenticated;
grant select, insert, delete on public.assistente_mensagens to service_role;
grant usage on sequence public.assistente_mensagens_id_seq to service_role;

create policy "usuario le sua memoria do assistente"
  on public.assistente_mensagens for select to authenticated
  using (usuario_id = (select auth.uid()));

create policy "usuario apaga sua memoria do assistente"
  on public.assistente_mensagens for delete to authenticated
  using (usuario_id = (select auth.uid()));
