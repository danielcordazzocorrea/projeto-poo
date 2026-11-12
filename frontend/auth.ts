import type { SupabaseClient } from '@supabase/supabase-js';

export const CONFIGURATION_NOTICE = 'O cadastro e o login estão indisponíveis: falta configurar a conexão com o Supabase';

export async function submitCredentials(
  client: SupabaseClient | null,
  mode: 'login' | 'signup',
  values: { email: string; password: string },
  redirectTo: string,
) {
  if (!client) throw new Error(CONFIGURATION_NOTICE);
  const credentials = { email: values.email.trim(), password: values.password };
  const result = mode === 'signup'
    ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: redirectTo } })
    : await client.auth.signInWithPassword(credentials);
  if (result.error) throw result.error;
  return result.data.session;
}
