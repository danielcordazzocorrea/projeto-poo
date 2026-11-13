# Moedas e transferências com conversão

Implementação na branch `feature/rodrigo`, no backend e no frontend. Na página
inicial, os cartões mostram os saldos em BRL, USD e BTC e respeitam o botão de
ocultar saldo. Abra **Moedas** para escolher sua moeda de recebimento, simular
câmbio ou enviar reais com conversão. O resultado do envio mostra a moeda e o
valor efetivamente recebidos pelo destinatário. A área Pix continua enviando BRL.

As novas telas dependem da migração e da Edge Function atualizada no ambiente
usado pelo frontend. Sem os dados de moedas retornados pela API, os formulários
ficam indisponíveis e a tela oferece atualização. Nenhum saldo é simulado no
navegador: os cálculos e envios são solicitados ao backend.

## Classes, atributos e responsabilidades

| Classe | Atributos | Responsabilidade |
| --- | --- | --- |
| `Moeda` | `tipo`, `cotacaoBrlCentavos`, `casasDecimais` | Representar BRL, USD ou BTC e validar sua cotação simulada. |
| `SaldoMoeda` | `moeda`, `unidades` | Associar uma quantidade inteira à moeda correta e formatá-la. |
| `ConversorMoeda` | Sem estado | Converter reais sem ponto flutuante. |
| `Conta` | `tipoMoeda`, `saldosMoedas`, além dos atributos existentes | Guardar preferência de recebimento e reunir os saldos. |
| `Corretora` | `repositorio` privado | Validar a entrada e coordenar os casos de uso. |
| `RepositorioSupabase` | `banco` privado | Ler tabelas e chamar funções SQL transacionais. |

`TipoMoeda` é uma união de tipos (`'BRL' | 'USD' | 'BTC'`), não uma classe.
Os atributos `readonly` e as validações encapsulam as regras. A associação de
`SaldoMoeda` com `Moeda` demonstra composição; `RepositorioCorretora` permite
trocar a persistência sem mudar a classe `Corretora`, por injeção de dependência.
Não é necessário criar uma hierarquia de herança para cada moeda.

O método de domínio em `supabase/functions/_shared/dominio.ts` é:

```ts
converterReais(valor: Dinheiro, destino: Moeda): SaldoMoeda {
  const escala = 10n ** BigInt(destino.casasDecimais);
  const unidades = valor.centavos * escala / destino.cotacaoBrlCentavos;
  if (unidades === 0n) {
    throw new RegraDeNegocio('Valor inferior à menor unidade da moeda de destino.');
  }
  return new SaldoMoeda(destino, unidades);
}
```

Exemplo didático, com taxas fictícias:

```ts
const conversor = new ConversorMoeda();
const reais = Dinheiro.positivo('100.00');
conversor.converterReais(reais, new Moeda('USD', 500n)).paraJson();
// { tipo_moeda: 'USD', saldo: '20.00' }
conversor.converterReais(reais, new Moeda('BTC', 30000000n)).paraJson();
// { tipo_moeda: 'BTC', saldo: '0.00033333' }
```

O catálogo do banco é usado na simulação HTTP; as taxas acima são somente um
exemplo. Uma transferência efetiva sempre recalcula no banco. A simulação não
reserva saldo nem garante uma cotação futura.

## Fluxo HTTP

Prefixo: `/functions/v1/corretora`. Todas as chamadas exigem os cabeçalhos
`Authorization: Bearer <JWT>` e `apikey: <chave publicável>`; JSON também exige
`Content-Type: application/json`.

1. Destinatário escolhe a moeda com `PATCH /conta/moeda` e corpo
   `{"tipo_moeda":"USD"}` ou `{"tipo_moeda":"BTC"}`. Isso altera sua própria
   preferência de recebimento, sem converter nem apagar saldos existentes.
2. `GET /moedas` lista taxas simuladas. Opcionalmente, `POST /conversoes/simulacao`
   com `{"valor":"100.00","tipo_moeda":"USD"}` calcula uma prévia sem transferência.
3. Remetente chama `POST /transferencias` com
   `{"chave_destino":"amigo@exemplo.com","valor":"100.00"}`. O valor é sempre BRL.
4. O banco debita R$ 100 do remetente e credita na moeda escolhida pelo
   destinatário. A resposta contém `recebimento` (moeda e valor recebido no campo
   `saldo`) e `conta` (conta atualizada do remetente).
5. `GET /conta` retorna `tipo_moeda` e `saldos_moedas`, além dos campos antigos.
   O saldo BRL continua em `saldo_brl`. Movimentações novas possuem
   `transferencia_id`, que referencia o comprovante em `transferencias_moedas`.

USD usa duas casas; BTC usa oito (satoshis). Frações menores que a unidade mínima
são descartadas, sem arredondamento para cima. Se a conversão resultar em zero,
a operação é rejeitada. O valor BRL integral debitado e as unidades efetivamente
recebidas ficam registrados no comprovante.

Os saldos estrangeiros permitem receber e consultar valores nesta entrega.
Depósitos, investimentos e Pix existentes continuam usando BRL; gastar USD/BTC
ou reconverter esses saldos são funcionalidades futuras. Não há Pix internacional,
saque de bitcoin ou conexão com blockchain.

## Alterações no banco

A nova migração é `supabase/migrations/20261113100000_moedas_transferencias.sql`.

- `contas.tipo_moeda`: preferência com padrão BRL; contas existentes são BRL.
- `moedas`: catálogo BRL/USD/BTC e cotação fictícia em centavos de real.
- `saldos_moedas`: saldos USD/BTC separados por conta, em unidades inteiras.
- `transferencias_moedas`: origem, destino, valor BRL, moeda, unidades recebidas,
  cotação usada e data. Os participantes podem ler seu comprovante com RLS.
- `movimentacoes.transferencia_id` e dois novos tipos de movimento: vinculam o
  histórico aos comprovantes. `valor_brl` continua sendo o equivalente em reais.
- RPCs `definir_moeda_recebimento` e `transferir_com_conversao`: usam `auth.uid()`;
  clientes não escolhem a conta de origem nem escrevem diretamente nas tabelas.

A transferência bloqueia as duas contas na mesma ordem usada pelo Pix, valida
saldo e limites, calcula a conversão com `numeric` e atualiza saldos, comprovante
e histórico na mesma transação. Uma falha desfaz tudo. O frontend não informa
cotação nem o valor a creditar.

**A migração foi validada em PostgreSQL 16 descartável e não foi aplicada ao
Supabase hospedado.** Para executar toda a sequência numa pilha Supabase local
de testes, use `npx supabase start` e `npx supabase db reset` (este último recria o
banco local). Depois, sirva a função com `npm run dev:edge`.

No projeto hospedado existente, primeiro reconcilie o histórico de migrações,
conforme o README, e aplique a migração nova antes de publicar a Edge Function
atualizada. Rodar apenas o frontend não cria as tabelas ou as funções SQL.

## Validação

`npm test` cobre conversão exata, arredondamento, limites, validações, preferência
e coordenação do serviço. Também testa a apresentação de satoshis sem perda de
precisão, autenticação das chamadas do front, separação de simulação e envio,
resposta do comprovante e propagação de erros sem repetição automática de envio.
`npm run build:front` verifica compatibilidade do front.

Para repetir os testes SQL, use um PostgreSQL **novo e descartável**, sem dados
reais. Concatene `tests/sql/bootstrap.sql`, os arquivos de `supabase/migrations/`
em ordem de nome e `tests/sql/moedas.test.sql`; execute o resultado pelo `psql`
como administrador, com `ON_ERROR_STOP=1`. O bootstrap imita somente a identidade
e os papéis do Supabase e não deve ser aplicado a um projeto Supabase real.

Os testes SQL verificam BRL/USD/BTC, bloqueio de escrita direta, RLS de saldos e
comprovantes, compatibilidade do Pix, saldo insuficiente, unidade mínima, limite
de saldo, autenticação e rollback após falha injetada na gravação do comprovante.
Não substituem um teste HTTP completo com Supabase Auth nem um teste concorrente
de carga.
