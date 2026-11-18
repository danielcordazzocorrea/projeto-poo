// Valores da API são texto decimal, sem conversão para ponto flutuante.
export function digitosParaValor(entrada: string): string | null {
  if (!/^[\d\s.,]*$/.test(entrada)) return null;
  const digitos = entrada.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digitos) return '';
  if (digitos.length > 14) return null;
  const valor = digitos.padStart(3, '0');
  return `${valor.slice(0, -2)}.${valor.slice(-2)}`;
}

export function exibirValorMonetario(valor: string): string {
  if (!valor) return '';
  const [inteiro = '0', centavos = '00'] = valor.split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos.padEnd(2, '0')}`;
}
