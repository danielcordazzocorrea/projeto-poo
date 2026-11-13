import type { SupabaseClient } from '@supabase/supabase-js';

export const CONFIGURATION_NOTICE = 'O cadastro e o login estão indisponíveis: falta configurar a conexão com o Supabase';

export async function submitCredentials(
  client: SupabaseClient | null,
  mode: 'login' | 'signup',
  values: { email: string; password: string; firstName?: string },
  redirectTo: string,
) {
  if (!client) throw new Error(CONFIGURATION_NOTICE);
  const firstName = values.firstName?.trim();
  if (mode === 'signup' && !firstName) throw new Error('Informe seu primeiro nome');
  if (mode === 'signup' && firstName!.length > 80) throw new Error('O primeiro nome deve ter no máximo 80 caracteres');
  const credentials = { email: values.email.trim(), password: values.password };
  const result = mode === 'signup'
    ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: redirectTo, data: { first_name: firstName } } })
    : await client.auth.signInWithPassword(credentials);
  if (result.error) {
    const translations: Record<string, string> = {
      'user already registered': 'Este e-mail já está cadastrado',
      'invalid login credentials': 'E-mail ou senha incorretos',
    };
    const translated = translations[result.error.message.trim().toLowerCase()];
    if (translated) throw new Error(translated, { cause: result.error });
    throw result.error;
  }
  return result.data.session;
}
