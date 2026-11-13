import type { SupabaseClient } from '@supabase/supabase-js';

export const CONFIGURATION_NOTICE = 'O cadastro e o login estão indisponíveis: falta configurar a conexão com o Supabase.';

export async function submitCredentials(
  client: SupabaseClient | null,
  mode: 'login' | 'signup',
  values: { email: string; password: string; firstName?: string; lastName?: string; birthDate?: string; passwordConfirmation?: string },
  redirectTo: string,
) {
  if (!client) throw new Error(CONFIGURATION_NOTICE);
  const firstName = values.firstName?.trim();
  const lastName = values.lastName?.trim();
  if (mode === 'signup' && !firstName) throw new Error('Informe seu primeiro nome.');
  if (mode === 'signup' && firstName!.length > 80) throw new Error('O primeiro nome deve ter no máximo 80 caracteres.');
  if (mode === 'signup' && !lastName) throw new Error('Informe seu sobrenome.');
  if (mode === 'signup' && lastName!.length > 80) throw new Error('O sobrenome deve ter no máximo 80 caracteres.');
  const birthDate = values.birthDate;
  if (mode === 'signup') {
    if (!isValidBirthDate(birthDate)) throw new Error('Data de nascimento inválida.');
    const age = ageOnToday(birthDate);
    if (age < 18) throw new Error('Data de nascimento inválida, menor de 18 anos.');
    if (age >= 120) throw new Error('Data de nascimento inválida.');
  }
  if (mode === 'signup' && values.password !== values.passwordConfirmation) throw new Error('As senhas não conferem.');
  const credentials = { email: values.email.trim(), password: values.password };
  const result = mode === 'signup'
    ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: redirectTo, data: { first_name: firstName, last_name: lastName, birth_date: birthDate } } })
    : await client.auth.signInWithPassword(credentials);
  if (result.error) {
    const translations: Record<string, string> = {
      'user already registered': 'Este e-mail já está cadastrado.',
      'invalid login credentials': 'E-mail ou senha incorretos.',
    };
    const translated = translations[result.error.message.trim().toLowerCase()];
    if (translated) throw new Error(translated, { cause: result.error });
    throw result.error;
  }
  return result.data.session;
}

function isValidBirthDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date <= new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
}

function ageOnToday(birthDate: string): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return -1;
  const today = new Date();
  const hasHadBirthday = today.getMonth() + 1 > month
    || (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = today.getFullYear() - year - (hasHadBirthday ? 0 : 1);
  return age;
}
