# Sistema visual da tivvo

## Referência e alcance

- Fonte: [tivvo.vercel.app](https://tivvo.vercel.app/), capturada em 16/11/2026 com Firecrawl (branding, HTML e texto) e inspecionada visualmente em uma captura desktop de 1365 × 633 px.
- A captura mostra a tela pública de acesso. A área autenticada e o tema claro foram conferidos pelos arquivos do projeto, não por essa captura. A imagem da captura não foi salva no repositório.

## Cores e tipografia

| Papel | Valor | Evidência |
| --- | --- | --- |
| Fundo escuro | `#09140e` | Captura e branding da página pública |
| Verde profundo | `#14291e` | Branding e `frontend/styles.css` |
| Lima principal | `#9dff3a` | Botão e destaque da captura; `frontend/styles.css` |
| Verde claro | `#b8ef91` | Branding e ícones do tema escuro |
| Texto claro | `#ecede8` | Branding e tela de acesso |
| Fundo claro | `#f4f6f2` | `frontend/styles.css` |

A página pública usa Inter. A área da conta usa a pilha `Avenir Next`, Avenir e `Segoe UI` definida no CSS. A tela de acesso combina título grande, texto claro e destaques lima.

## Composição e componentes observados

- Tela de acesso em duas colunas no desktop: mensagem à esquerda e formulário em painel escuro à direita.
- Fundo escuro com traços verdes luminosos diagonais. Painel e campos têm cantos arredondados, contornos discretos e pouco brilho fora dos destaques.
- Botão principal em lima sólido; os demais elementos usam verdes mais contidos. O assistente flutuante da conta é circular, fica no canto inferior direito e abre o chat ao clique.
- Assets existentes: `public/favicon.png` e `public/pix-logo.svg`. O fundo animado da tela de acesso está em `components/ui/animated-shader-background.tsx`.

## Aplicação ao assistente

Escolha atual: corpo de cor sólida adaptado ao tema. No tema claro, verde suave `#a9c9a3` com olhos `#172b1d`; no escuro, verde fechado `#466a4c` com olhos `#f4f6f2`. Os dois tons acompanham os verdes de superfícies e ícones da conta sem usar o lima de alto contraste como cor principal. O modo `custom` mantém a cor uniforme no WebGL e na alternativa CSS. Movimento, olhos, botão e chat permanecem definidos pelos componentes existentes.

## Limites da referência

A captura pública não mostra o assistente em uso nem o tema claro. A escolha de material é uma proposta baseada nas cores observadas e no código da área autenticada; não é uma reprodução de um asset da página pública.
