import { Ativo, Conta, Dinheiro, Quantidade, RegraDeNegocio } from './dominio.ts';

/** A interface mantém a lógica POO independente do cliente Supabase. */
export interface RepositorioCorretora {
  listarAtivos(): Promise<Ativo[]>;
  abrirConta(): Promise<void>;
  consultarConta(): Promise<Conta>;
  depositar(centavos: bigint): Promise<void>;
  comprar(codigo: string, micros: bigint): Promise<void>;
  vender(codigo: string, micros: bigint): Promise<void>;
}

export class Corretora {
  constructor(private readonly repositorio: RepositorioCorretora) {}

  async listarAtivos() { return (await this.repositorio.listarAtivos()).map(a => a.paraJson()); }
  async abrirConta() {
    await this.repositorio.abrirConta();
    return (await this.repositorio.consultarConta()).paraJson();
  }
  async consultarConta() { return (await this.repositorio.consultarConta()).paraJson(); }

  async depositar(valor: unknown) {
    await this.repositorio.depositar(Dinheiro.positivo(valor).centavos);
    return this.consultarConta();
  }

  async comprar(codigo: unknown, quantidade: unknown) {
    await this.repositorio.comprar(this.validarCodigo(codigo), Quantidade.positiva(quantidade).micros);
    return this.consultarConta();
  }

  async vender(codigo: unknown, quantidade: unknown) {
    await this.repositorio.vender(this.validarCodigo(codigo), Quantidade.positiva(quantidade).micros);
    return this.consultarConta();
  }

  private validarCodigo(codigo: unknown): string {
    if (typeof codigo !== 'string' || !/^[A-Z0-9]{1,20}$/.test(codigo)) {
      throw new RegraDeNegocio('Código de ativo inválido.');
    }
    return codigo;
  }
}
