/** Conceitos da corretora. Este arquivo não conhece HTTP nem Supabase. */

// Erro para uma entrada ou operação que viola uma regra do negócio.
export class RegraDeNegocio extends Error {}
// Erro para uma conta ou ativo que deveria existir, mas não foi encontrado.
export class NaoEncontrado extends Error {}
// Erro para dados inválidos ou indisponíveis vindos do banco.
export class FalhaDePersistencia extends Error {}

// Maior inteiro que um número JavaScript representa sem perder precisão.
const MAXIMO_SEGURO = BigInt(Number.MAX_SAFE_INTEGER);

// Transforma texto decimal positivo em um inteiro na menor unidade usada.
function decimalPositivo(valor: unknown, casas: number, campo: string): bigint {
  // `unknown` obriga a validar o tipo antes de usar o valor recebido da API.
  if (typeof valor !== 'string' || !/^\d+(\.\d+)?$/.test(valor)) {
    // Mensagem de erro específica para quem enviou o dado incorreto.
    throw new RegraDeNegocio(`${campo} deve ser um decimal positivo em texto.`);
  }
  // Separa a parte inteira da parte após o ponto; os padrões cobrem partes ausentes.
  const [inteiro = '', fracao = ''] = valor.split('.');
  // Limita casas decimais e tamanho da entrada antes da conversão.
  if (fracao.length > casas || inteiro.length > 15) {
    throw new RegraDeNegocio(`${campo} aceita até ${casas} casas decimais.`);
  }
  // Exemplo: "10.05" com 2 casas vira 10 * 100 + 5 = 1005 centavos.
  const resultado = BigInt(inteiro) * 10n ** BigInt(casas)
    // `padEnd` completa as casas: "0.5" com 2 casas vira 50.
    + BigInt(fracao.padEnd(casas, '0') || '0');
  // Impede zero, negativos e inteiros que perderiam precisão ao virar JSON.
  if (resultado <= 0n || resultado > MAXIMO_SEGURO) {
    throw new RegraDeNegocio(`${campo} está fora do limite permitido.`);
  }
  // `bigint` guarda o inteiro exato durante as contas internas.
  return resultado;
}

// Faz o caminho inverso: inteiro da menor unidade para texto decimal.
function formatarDecimal(valor: bigint, casas: number): string {
  // 2 casas significam escala 100; 6 casas significam escala 1.000.000.
  const escala = 10n ** BigInt(casas);
  // Quociente forma a parte inteira; resto forma a parte fracionária.
  return `${valor / escala}.${(valor % escala).toString().padStart(casas, '0')}`;
}

// Valida um inteiro recebido do Postgres antes de criar um objeto de domínio.
export function inteiroDoBanco(valor: unknown, campo: string): bigint {
  // O cliente Supabase pode devolver bigint do banco como número ou texto.
  if ((typeof valor !== 'number' && typeof valor !== 'string')
    // Rejeita frações, sinais e outros caracteres inesperados.
    || !/^\d+$/.test(String(valor))) {
    throw new FalhaDePersistencia(`Valor inválido recebido do banco: ${campo}.`);
  }
  // Um número JavaScript maior que o limite seguro pode já ter sido arredondado.
  if (typeof valor === 'number' && !Number.isSafeInteger(valor)) {
    throw new FalhaDePersistencia(`Valor sem precisão recebido do banco: ${campo}.`);
  }
  // Depois da validação, converte para o tipo inteiro exato usado no domínio.
  const inteiro = BigInt(valor);
  // O JSON de saída também precisa permanecer dentro do limite seguro.
  if (inteiro > MAXIMO_SEGURO) {
    throw new FalhaDePersistencia(`Valor fora do limite recebido do banco: ${campo}.`);
  }
  return inteiro;
}

// Objeto de valor: representa dinheiro sem usar ponto flutuante.
export class Dinheiro {
  // O construtor privado força o uso das fábricas que validam a origem do valor.
  private constructor(readonly centavos: bigint) {}
  // Cria dinheiro a partir da entrada do usuário, que deve ser positiva.
  static positivo(valor: unknown): Dinheiro {
    return new Dinheiro(decimalPositivo(valor, 2, 'valor'));
  }
  // Cria dinheiro a partir de um inteiro já armazenado no banco.
  static doBanco(valor: unknown): Dinheiro {
    return new Dinheiro(inteiroDoBanco(valor, 'saldo/valor'));
  }
  // Apresenta 2500 centavos como "25.00" no JSON.
  formatar(): string { return formatarDecimal(this.centavos, 2); }
}

export type TipoMoeda = 'BRL' | 'USD' | 'BTC';

export function validarTipoMoeda(valor: unknown): TipoMoeda {
  if (valor !== 'BRL' && valor !== 'USD' && valor !== 'BTC') {
    throw new RegraDeNegocio('Tipo de moeda deve ser BRL, USD ou BTC.');
  }
  return valor;
}

// Objeto de valor: a cotação é o preço SIMULADO de uma unidade em centavos de real.
export class Moeda {
  readonly casasDecimais: number;
  constructor(readonly tipo: TipoMoeda, readonly cotacaoBrlCentavos: bigint) {
    validarTipoMoeda(tipo);
    if (cotacaoBrlCentavos <= 0n || cotacaoBrlCentavos > MAXIMO_SEGURO) {
      throw new RegraDeNegocio('Cotação inválida.');
    }
    if (tipo === 'BRL' && cotacaoBrlCentavos !== 100n) {
      throw new RegraDeNegocio('Uma unidade de BRL deve valer 100 centavos de real.');
    }
    this.casasDecimais = tipo === 'BTC' ? 8 : 2;
  }
  paraJson() {
    return { tipo_moeda: this.tipo, casas_decimais: this.casasDecimais,
      cotacao_brl: formatarDecimal(this.cotacaoBrlCentavos, 2), simulada: true };
  }
}

// Composição: um saldo sempre associa o número de unidades à sua moeda.
export class SaldoMoeda {
  constructor(readonly moeda: Moeda, readonly unidades: bigint) {
    if (unidades < 0n || unidades > MAXIMO_SEGURO) {
      throw new RegraDeNegocio('Saldo em moeda fora do limite permitido.');
    }
  }
  paraJson() {
    return { tipo_moeda: this.moeda.tipo,
      saldo: formatarDecimal(this.unidades, this.moeda.casasDecimais) };
  }
}

// Serviço de domínio: encapsula a conversão sem HTTP, banco ou ponto flutuante.
export class ConversorMoeda {
  converterReais(valor: Dinheiro, destino: Moeda): SaldoMoeda {
    const escala = 10n ** BigInt(destino.casasDecimais);
    const unidades = valor.centavos * escala / destino.cotacaoBrlCentavos;
    // Arredonda para baixo; nunca cria uma unidade que o remetente não pagou.
    if (unidades === 0n) throw new RegraDeNegocio('Valor inferior à menor unidade da moeda de destino.');
    return new SaldoMoeda(destino, unidades);
  }
}

// Objeto de valor: representa quantidades com até seis casas decimais.
export class Quantidade {
  // Uma unidade equivale a 1.000.000 de micros.
  private constructor(readonly micros: bigint) {}
  // Valida quantidade digitada, por exemplo "0.5".
  static positiva(valor: unknown): Quantidade {
    return new Quantidade(decimalPositivo(valor, 6, 'quantidade'));
  }
  // Reconstrói a quantidade lida da tabela `posicoes` ou `movimentacoes`.
  static doBanco(valor: unknown): Quantidade {
    return new Quantidade(inteiroDoBanco(valor, 'quantidade'));
  }
  // Apresenta 500000 micros como "0.500000".
  formatar(): string { return formatarDecimal(this.micros, 6); }
}

// União de tipos: o compilador só aceita estes dois tipos de ativo.
export type TipoAtivo = 'ACAO' | 'MOEDA';

// Entidade do catálogo; combina código, nome, tipo e preço.
export class Ativo {
  // `readonly` impede trocar os dados do objeto após a criação.
  constructor(
    // Identificador curto do catálogo, como "ACAO1" ou "USD".
    readonly codigo: string,
    // Nome exibido para o usuário.
    readonly nome: string,
    // Tipo restrito pela união TipoAtivo declarada acima.
    readonly tipo: TipoAtivo,
    // O preço é outro objeto, mostrando composição entre classes.
    readonly preco: Dinheiro,
  ) {}
  // Converte o objeto para uma resposta que pode ser enviada como JSON.
  paraJson() {
    // O preço sai como texto decimal porque internamente é um bigint.
    return { codigo: this.codigo, nome: this.nome, tipo: this.tipo, preco_brl: this.preco.formatar() };
  }
}

// Uma posição une um ativo à quantidade que o usuário possui.
export class Posicao {
  constructor(readonly ativo: Ativo, readonly quantidade: Quantidade) {}
  // Devolve os dados do ativo e a quantidade em texto decimal.
  paraJson() { return { ativo: this.ativo.paraJson(), quantidade: this.quantidade.formatar() }; }
}

// Tipos permitidos no histórico de operações.
export type TipoMovimentacao = 'DEPOSITO' | 'COMPRA' | 'VENDA' | 'PIX_ENVIADO' | 'PIX_RECEBIDO'
  | 'TRANSFERENCIA_ENVIADA' | 'TRANSFERENCIA_RECEBIDA';

// Uma movimentação registra uma operação já concluída.
export class Movimentacao {
  constructor(
    // Chave da linha do histórico.
    readonly id: string,
    // Uma das três operações permitidas.
    readonly tipo: TipoMovimentacao,
    // Valor financeiro da operação, sempre como objeto Dinheiro.
    readonly valor: Dinheiro,
    // Data e hora recebidas do banco.
    readonly criadaEm: string,
    // Depósitos e Pix não têm ativo nem quantidade, por isso estes campos aceitam null.
    readonly codigoAtivo: string | null,
    readonly quantidade: Quantidade | null,
    readonly transferenciaId: string | null = null,
  ) {}
  // Monta a forma pública da movimentação para a API.
  paraJson() {
    return {
      // Estes nomes em snake_case formam o contrato público da API.
      id: this.id,
      tipo: this.tipo,
      // Dinheiro.formatar transforma centavos em texto com duas casas.
      valor_brl: this.valor.formatar(),
      criada_em: this.criadaEm,
      codigo_ativo: this.codigoAtivo,
      // `?.` só chama formatar quando há quantidade; `??` devolve null se não há.
      quantidade: this.quantidade?.formatar() ?? null,
      transferencia_id: this.transferenciaId,
    };
  }
}

// Conta reúne o saldo, as posições e o histórico de um usuário.
export class Conta {
  constructor(
    // Identificador da conta da corretora, diferente do ID de autenticação.
    readonly id: string,
    // Liga a conta ao ID do usuário no Supabase Auth.
    readonly usuarioId: string,
    // Saldo atual representado pelo objeto de valor Dinheiro.
    readonly saldo: Dinheiro,
    // A chave Pix é o e-mail normalizado do usuário, criado junto com a conta.
    readonly chavePix: string,
    // Carteira: lista das posições atuais em ativos.
    readonly posicoes: Posicao[],
    // Histórico: até 100 movimentações carregadas pelo repositório.
    readonly movimentacoes: Movimentacao[],
    readonly tipoMoeda: TipoMoeda = 'BRL',
    readonly saldosMoedas: SaldoMoeda[] = [],
  ) {}
  // Serializa a conta e todos os objetos que ela contém.
  paraJson() {
    return {
      id: this.id,
      usuario_id: this.usuarioId,
      // O cliente recebe "50.00", não o bigint 5000n.
      saldo_brl: this.saldo.formatar(),
      tipo_moeda: this.tipoMoeda,
      saldos_moedas: this.saldosMoedas.map(saldo => saldo.paraJson()),
      chave_pix: this.chavePix,
      // `map` transforma cada objeto Posicao em JSON.
      posicoes: this.posicoes.map(p => p.paraJson()),
      // Faz o mesmo para cada Movimentacao.
      movimentacoes: this.movimentacoes.map(m => m.paraJson()),
    };
  }
}
