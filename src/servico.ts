import { Ativo, Cliente, Conta, lerQuantidade, lerValor, NaoEncontrado, RegraDeNegocio } from './dominio.js';

export interface Repositorio {
  clientes: Map<string, Cliente>;
  contas: Map<string, Conta>;
  ativos: Map<string, Ativo>;
}

export class RepositorioEmMemoria implements Repositorio {
  readonly clientes = new Map<string, Cliente>();
  readonly contas = new Map<string, Conta>();
  readonly ativos = new Map<string, Ativo>([
    ['ACAO1', new Ativo('ACAO1', 'Ação demonstrativa', 'ACAO', 2500n)],
    ['USD', new Ativo('USD', 'Dólar demonstrativo', 'MOEDA', 500n)],
  ]);
}

export class Corretora {
  constructor(readonly repositorio: Repositorio = new RepositorioEmMemoria()) {}

  cadastrarCliente(nome: unknown): Cliente {
    if (typeof nome !== 'string') throw new RegraDeNegocio('Informe o nome do cliente.');
    const cliente = new Cliente(nome);
    this.repositorio.clientes.set(cliente.id, cliente);
    return cliente;
  }

  abrirConta(clienteId: unknown): Conta {
    if (typeof clienteId !== 'string' || !this.repositorio.clientes.has(clienteId)) {
      throw new NaoEncontrado('Cliente não encontrado.');
    }
    if ([...this.repositorio.contas.values()].some(conta => conta.clienteId === clienteId)) {
      throw new RegraDeNegocio('O cliente já possui uma conta.');
    }
    const conta = new Conta(clienteId);
    this.repositorio.contas.set(conta.id, conta);
    return conta;
  }

  obterConta(id: string): Conta {
    const conta = this.repositorio.contas.get(id);
    if (!conta) throw new NaoEncontrado('Conta não encontrada.');
    return conta;
  }

  depositar(id: string, valor: unknown): Conta {
    const centavos = lerValor(valor);
    const conta = this.obterConta(id);
    conta.depositar(centavos);
    return conta;
  }

  comprar(id: string, codigo: unknown, quantidade: unknown): Conta {
    const qtd = lerQuantidade(quantidade);
    const conta = this.obterConta(id);
    conta.comprar(this.obterAtivo(codigo), qtd);
    return conta;
  }

  vender(id: string, codigo: unknown, quantidade: unknown): Conta {
    const qtd = lerQuantidade(quantidade);
    const conta = this.obterConta(id);
    conta.vender(this.obterAtivo(codigo), qtd);
    return conta;
  }

  private obterAtivo(codigo: unknown): Ativo {
    const ativo = typeof codigo === 'string' ? this.repositorio.ativos.get(codigo) : undefined;
    if (!ativo) throw new NaoEncontrado('Ativo não encontrado.');
    return ativo;
  }
}
