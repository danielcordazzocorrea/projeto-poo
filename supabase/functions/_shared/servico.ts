// O serviço recebe objetos e validações definidos no domínio.
import { Ativo, Conta, Dinheiro, Quantidade, RegraDeNegocio, validarTipoMoeda, type TipoMoeda } from './dominio.ts';
import { buscarCotacoes, type Cotacoes } from './cotacoes.ts';

/** Contrato: descreve as operações de dados sem citar Supabase ou SQL. */
export interface RepositorioCorretora {
  // Cada assinatura diz o que a implementação deve oferecer e devolver.
  // Lista todos os ativos disponíveis no catálogo.
  listarAtivos(): Promise<Ativo[]>;
  // Cria uma conta caso um usuário antigo ainda não tenha uma.
  abrirConta(): Promise<void>;
  // Devolve a própria conta com saldo, posições e histórico.
  consultarConta(): Promise<Conta>;
  // Recebe dinheiro em centavos, sem ponto flutuante.
  depositar(centavos: bigint): Promise<void>;
  // Recebe o código e a quantidade convertida para micros.
  comprar(codigo: string, micros: bigint): Promise<void>;
  // Mesmos tipos da compra, mas executa a operação inversa.
  vender(codigo: string, micros: bigint): Promise<void>;
  // Transfere saldo para a conta encontrada pela chave Pix.
  consultarMoedaDestinoPix(chaveDestino: string): Promise<TipoMoeda>;
  converterSaldo(destino: TipoMoeda, origem: TipoMoeda, cotacoes: Cotacoes | null): Promise<{ cotacao_em: string | null }>;
  transferirPix(chaveDestino: string, centavos: bigint, origem: TipoMoeda, destino: TipoMoeda,
    cotacoes: Cotacoes | null): Promise<{ moeda_recebida: TipoMoeda; valor_recebido: string; cotacao_em: string | null }>;
}

// Serviço de aplicação: coordena os casos de uso da corretora.
export class Corretora {
  // Injeção de dependência: qualquer repositório que cumpra a interface serve.
  constructor(private readonly repositorio: RepositorioCorretora,
    private readonly buscarTaxas: typeof buscarCotacoes = buscarCotacoes) {}

  // Busca objetos Ativo e converte cada um em JSON para a resposta HTTP.
  async listarAtivos() { return (await this.repositorio.listarAtivos()).map(a => a.paraJson()); }
  // Abre uma conta apenas quando necessário, depois consulta o estado atual.
  async abrirConta() {
    await this.repositorio.abrirConta();
    return (await this.repositorio.consultarConta()).paraJson();
  }
  // Consulta a própria conta e converte o objeto Conta para JSON.
  async consultarConta() { return (await this.repositorio.consultarConta()).paraJson(); }

  // Recebe entrada ainda não confiável da rota HTTP.
  async depositar(valor: unknown) {
    // Dinheiro.positivo valida e transforma "10.05" em 1005 centavos.
    await this.repositorio.depositar(Dinheiro.positivo(valor).centavos);
    // Devolve a conta já atualizada após a operação no banco.
    return this.consultarConta();
  }

  async comprar(codigo: unknown, quantidade: unknown) {
    // Valida o código e transforma "0.5" em 500000 micros antes de chamar o banco.
    await this.repositorio.comprar(this.validarCodigo(codigo), Quantidade.positiva(quantidade).micros);
    return this.consultarConta();
  }

  async vender(codigo: unknown, quantidade: unknown) {
    // A venda usa as mesmas validações de código e quantidade da compra.
    await this.repositorio.vender(this.validarCodigo(codigo), Quantidade.positiva(quantidade).micros);
    return this.consultarConta();
  }

  async transferirPix(chaveDestino: unknown, valor: unknown) {
    const chave = this.validarChavePix(chaveDestino);
    const centavos = Dinheiro.positivo(valor).centavos;
    const origem = (await this.repositorio.consultarConta()).moedaSaldo;
    const destino = await this.repositorio.consultarMoedaDestinoPix(chave);
    const cotacoes = origem === destino ? null : await this.buscarTaxas();
    const comprovante = await this.repositorio.transferirPix(chave, centavos, origem, destino, cotacoes);
    return { ...await this.consultarConta(), comprovante };
  }

  async converterSaldo(moeda: unknown) {
    const destino = validarTipoMoeda(moeda);
    const conta = await this.repositorio.consultarConta();
    const origem = conta.moedaSaldo;
    if (origem === destino) throw new RegraDeNegocio('O saldo já está nesta moeda.');
    const cotacoes = conta.saldo.centavos === 0n ? null : await this.buscarTaxas();
    const comprovante = await this.repositorio.converterSaldo(destino, origem, cotacoes);
    return { ...await this.consultarConta(), comprovante };
  }

  // `private` limita este detalhe de validação ao interior da classe Corretora.
  private validarCodigo(codigo: unknown): string {
    // Só permite códigos de 1 a 20 caracteres, com letras maiúsculas e números.
    if (typeof codigo !== 'string' || !/^[A-Z0-9]{1,20}$/.test(codigo)) {
      throw new RegraDeNegocio('Código de ativo inválido.');
    }
    // Depois da verificação, TypeScript sabe que codigo é string.
    return codigo;
  }

  private validarChavePix(chave: unknown): string {
    if (typeof chave !== 'string') throw new RegraDeNegocio('Chave Pix inválida.');
    const normalizada = chave.trim().toLowerCase();
    if (normalizada.length < 3 || normalizada.length > 255 || /\s/.test(normalizada)) {
      throw new RegraDeNegocio('Chave Pix inválida.');
    }
    return normalizada;
  }
}
