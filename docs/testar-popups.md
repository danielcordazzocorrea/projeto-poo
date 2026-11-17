# Testar os popups de erro

Execute `npm.cmd run dev` na raiz do projeto e use o endereço exibido pelo Vite.
Os exemplos abaixo usam a porta padrão, 5173. Se o Vite escolher outra porta, ajuste o endereço.

## Demonstração visual sem login

Abra `http://localhost:5173/?preview=error-dialog`.

- Abra os exemplos de saldo insuficiente, destinatário não encontrado e erros de conversão.
- Alterne os temas antes de abrir o popup e reduza a largura da janela para testar o celular.
- Confira fechamento por X, Escape e botão principal. Tab e Shift+Tab devem manter o foco dentro do popup.
- Nos exemplos de Pix, “Corrigir chave” e “Alterar valor” levam aos campos da demonstração sem apagar o texto.
- As demais ações apenas exibem uma confirmação de teste. Essa página não envia requisições nem simula uma transação completa.

A demonstração existe somente em desenvolvimento, não no build de produção.

## Fluxo integrado do Pix

Abra a página inicial e entre em uma conta do ambiente de demonstração.

1. Na área Pix, informe um e-mail válido que você saiba não estar cadastrado e um valor positivo: deve aparecer “Destinatário não encontrado”.
2. Clique em “Corrigir chave”: os campos devem continuar preenchidos, com foco na chave.
3. Para testar saldo insuficiente, use a chave de OUTRA conta existente e informe um valor acima do seu saldo: deve aparecer “Saldo insuficiente”. Uma chave inexistente pode ser recusada antes da verificação de saldo.
4. Clique em “Alterar valor”: o foco deve voltar ao valor.
5. Informe zero como valor para verificar o popup de valor inválido. Campos vazios ou e-mail malformado continuam usando a validação nativa do formulário.

O carregamento deve fechar antes do popup. A mesma mensagem não deve aparecer novamente no aviso antigo abaixo da página.

## Fluxo integrado da conversão

1. Entre em Moedas com a conta já carregada e escolha uma moeda diferente da atual.
2. Para provocar uma falha de conexão sem converter o saldo, abra as ferramentas de desenvolvedor (F12), localize Network/Rede e selecione Offline ANTES de clicar em “Converter saldo”. Não recarregue a página.
3. Clique em “Converter saldo”. Deve aparecer “Não foi possível confirmar a conversão”, sem popup de sucesso e mantendo a moeda selecionada.
4. Restaure a conexão em Network/Rede antes de clicar em “Conferir saldos”. A ação deve voltar ao início e atualizar os dados; não deve repetir a conversão.
5. Para ver “Cotação indisponível” sem depender de uma falha real do provedor, use a demonstração visual. Os testes automatizados também cobrem essa resposta da API.

O botão fica desabilitado quando a moeda escolhida já é a atual. Converter com conexão normal altera TODO o saldo simulado, portanto não é necessário fazer isso apenas para testar o popup de erro.

## Transferências entre contas de investimentos

1. Entre em Investimentos → Transferir dinheiro.
2. Escolha “Para investimentos” e informe um valor acima do saldo da conta principal. O popup deve indicar saldo insuficiente na conta principal.
3. Clique em “Alterar valor”: o campo deve continuar preenchido e receber foco.
4. Repita com “Para conta principal” e um valor acima do saldo da conta de investimentos. A mensagem deve identificar essa conta como origem.
5. Informe zero para testar valor inválido.
6. Para testar resultado incerto, selecione Offline em Network/Rede ANTES de confirmar a transferência. Depois do aviso, restaure a conexão e clique em “Conferir saldos”: as duas contas devem atualizar na mesma área, sem repetir a transferência.

Login e cadastro continuam fora do escopo dos popups.

## Erros de compra e venda de ações

- Compra: em Investimentos → Renda variável, busque um ativo e abra a cotação. Com a conta de investimentos carregada, informe quantidade `0` e clique em Comprar ativo. Deve aparecer “Confira a quantidade”. “Alterar quantidade” deve voltar ao campo sem apagar o valor.
- Saldo insuficiente: informe uma quantidade cujo custo seja maior que o saldo da conta de investimentos. Deve aparecer “Saldo insuficiente para comprar”. A compra usa o saldo de investimentos em BRL, independentemente da moeda da conta principal.
- Venda: em Ver ações compradas, escolha um ativo que já esteja na carteira. Informe uma quantidade maior que a disponível e confirme a venda. Deve aparecer “Quantidade indisponível”; o campo deve permanecer preenchido. Não é necessário fazer uma compra nova só para testar.
- Falha de conexão: com a cotação ou o formulário de venda já aberto, ative Offline ANTES de enviar. O popup deve informar que não foi possível confirmar a compra/venda. Restaure a conexão antes de “Conferir saldos”; essa ação consulta os dados, sem reenviar a operação.
- Os exemplos de erro dependem de a consulta de cotação do servidor estar disponível. Uma falha do provedor pode interromper a operação antes da validação de saldo/quantidade.

Não deve haver cópia do mesmo erro abaixo do formulário nem aviso de sucesso quando o resultado não foi confirmado. A main incorporada já inclui comprovantes de compra e confirmação de venda com preço médio e cotação. A estimativa explícita de lucro/prejuízo permanece para uma etapa futura.

## Carregamento da conta e consultas de mercado

1. Com a conta já aberta, selecione Offline em F12 → Network/Rede e clique em “Atualizar saldo” na página inicial. Deve aparecer “Não conseguimos carregar os dados”.
2. Restaure a conexão e clique em “Recarregar”: o popup deve fechar e os dados devem atualizar. Fechar pelo X ou Escape permite permanecer na página sem repetir a consulta.
3. Em Investimentos → Renda variável, selecione Offline e digite uma busca com pelo menos dois caracteres. Deve aparecer “Consulta indisponível”.
4. Restaure a conexão e clique em “Recarregar”: a mesma busca deve ser repetida, preservando o texto. Se fechar o popup, o botão “Buscar novamente” permite tentar depois.
5. Para testar uma cotação, primeiro carregue os resultados online. Selecione Offline antes de clicar em um ativo. Restaure a conexão e use “Recarregar” para consultar o mesmo ativo.
6. Uma busca sem resultados é um estado normal, sem popup. Limite de consultas apresenta aviso para aguardar; não há repetição automática.

O popup deve aparecer uma vez por falha de consulta, sem outra cópia da mensagem abaixo da página. Digitar novamente ou sair da área cancela a consulta anterior sem apresentar erro de cancelamento.

## Verificações automatizadas

Execute `npm.cmd test` e `npm.cmd run build:front`.
Os testes de requisição usam respostas simuladas: não acessam contas reais nem enviam operações ao Supabase.

## Etapa futura de investimentos

A main incorporada em 16/11/2026 já trouxe comprovante de compra e confirmação antes de vender com preço médio e cotação. Permanece para uma etapa futura a exibição explícita de lucro/prejuízo estimado em reais e percentual. Login e cadastro seguem fora do escopo dos popups.

## Conferência visual final

Na demonstração, abra um aviso em cada tema e repita com a janela estreita:

- O texto deve caber na tela, com rolagem quando necessário e botão de ação acessível.
- Tab e Shift+Tab devem circular dentro do popup, mostrando o contorno de foco.
- Escape e X devem fechar sem executar a ação principal.
- “Alterar valor” e “Corrigir chave” devem devolver o foco aos campos correspondentes.
- Nas telas reais, “Alterar quantidade” deve preservar a quantidade e devolver o foco ao campo de compra/venda.

A revisão automatizada também cobre respostas HTTP 200 com dados incompletos: elas devem virar erro de consulta, sem substituir os dados exibidos por um objeto inválido. A revisão visual em navegador continua sendo uma verificação manual.

## Verificação após incorporar a main

- Compra e venda agora usam o saldo da conta de investimentos. Confira os popups de quantidade inválida e saldo insuficiente nessa conta.
- Na confirmação de venda, informe quantidade maior que a disponível. O popup de erro deve abrir sobre a confirmação; ao clicar em “Alterar quantidade”, o foco deve voltar ao campo da venda.
- Para testar apenas o gráfico, bloqueie a requisição `*/historico*` em Network/Rede. A cotação deve continuar visível; depois de remover o bloqueio, “Tentar novamente” deve carregar o gráfico de um mês.
- Os erros do gráfico e da consulta de cotação da venda permanecem nas próprias telas, como na main. A integração desses erros com popups fica para uma etapa futura.
- As migrations e a função corretora da main precisam estar publicadas no ambiente usado para validar o novo contrato de compra. O merge de código não publica o backend automaticamente.
