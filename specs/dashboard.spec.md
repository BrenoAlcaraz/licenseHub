# Spec — Dashboard web

Interface gráfica mínima para demonstrar os fluxos do LicenseHub no navegador.
O dashboard torna visíveis a ocupação, os custos e as chamadas HTTP/WebSocket,
sem transformar o projeto em uma aplicação full-stack de escopo aberto.

Esta é uma **exceção aprovada** ao item "Front-end" da lista original de fora do
escopo. A exceção cobre somente o comportamento descrito nesta spec.

## Objetivo

Permitir que uma pessoa avaliando o projeto consiga, sem montar JSON ou copiar
UUIDs manualmente:

- entender quanto a empresa paga e quanto pode economizar;
- visualizar vagas compradas, ocupadas e ociosas por produto;
- cadastrar produtos e colaboradores;
- atribuir e revogar licenças;
- colocar um colaborador em férias, reativá-lo ou desligá-lo;
- observar o alerta `seats.threshold` em tempo real;
- abrir o Swagger quando quiser inspecionar a interface HTTP completa.

## Limites da solução

- Uma única página, servida em `GET /` pelo mesmo processo, porta e container da
  aplicação NestJS.
- O Swagger continua disponível em `GET /docs`.
- O dashboard usa somente os endpoints e o evento WebSocket já existentes. Não
  serão criados endpoints exclusivos para a interface.
- Mesma origem da aplicação: as chamadas usam caminhos relativos (`/products`,
  `/employees`, etc.); não há configuração de CORS nem URL de backend no código.
- HTML, CSS e TypeScript do navegador, sem React, Vue, Angular, framework de CSS,
  biblioteca de gráficos ou gerenciador de estado.
- Nenhuma nova dependência de produção ou desenvolvimento. Os assets são servidos
  pelo `@nestjs/platform-express`, que já faz parte do projeto, e o TypeScript já
  instalado compila o código do navegador.
- Nenhum asset carregado de CDN: o dashboard deve funcionar sem acesso à internet.
- Sem autenticação, autorização, paginação, cache, importação/exportação ou novas
  regras de negócio.
- A interface é em português. Nomes no código permanecem em inglês. Mensagens
  retornadas pela aplicação são mostradas sem tradução.

## Arquitetura e seam

O dashboard é um **adapter** do navegador no seam HTTP/WebSocket já existente:

```text
Browser (dashboard)
   |-- fetch() ----------> controllers REST --> services --> MikroORM --> PostgreSQL
   `-- Socket.IO <------- SeatsThresholdGateway
```

Os services continuam sendo os módulos que implementam RN01–RN10. O dashboard
não antecipa nem replica essas regras: desabilitar uma ação óbvia melhora a
experiência, mas o backend permanece a autoridade e seus erros 400/404/409 são
sempre tratados. Assim, concorrência e dados desatualizados continuam seguros.

## Estrutura prevista

```text
src/
├── main.ts                 # registra os assets estáticos
└── web/
    ├── index.html          # estrutura e formulários da página
    ├── styles.css          # layout responsivo, tabelas, badges e barras
    └── dashboard.ts        # fetch, renderização e conexão Socket.IO
```

O build do Nest deve copiar `index.html` e `styles.css` e compilar
`dashboard.ts` para `dist/web`. O Dockerfile continua copiando apenas `dist` para
a imagem final.

## Navegação

A página tem navegação interna para quatro áreas. Não há roteamento no navegador
nem URLs adicionais:

| Área | Finalidade |
|---|---|
| Visão geral | Indicadores de custo, uso e desperdício |
| Produtos | Cadastro, edição e ocupação das vagas |
| Colaboradores | Cadastro, filtros, licenças e mudanças de status |
| Atribuições | Atribuição, histórico, filtros e revogação |

O cabeçalho contém o estado da conexão em tempo real e um link visível para
`/docs`.

## Visão geral

Dados obtidos de `GET /reports/costs`:

- **Custo mensal total:** `totalMonthlyCostCents`;
- **Economia mensal potencial:** `potentialMonthlySavingsCents`;
- **Licenças ativas:** soma de `byDepartment[].activeLicenses`;
- **Vagas ociosas:** soma de `idleSeats[].idleSeats`;
- custo e quantidade de licenças ativas por departamento;
- produtos com vagas ociosas e seu desperdício mensal.

Valores em centavos são convertidos somente na apresentação e formatados em
reais (`pt-BR`, por exemplo `18900` → `R$ 189,00`). Nenhum valor decimal é
enviado de volta à aplicação.

As listas preservam a ordenação entregue por `GET /reports/costs`; o navegador
não aplica outra regra de ordenação.

## Produtos

### Lista

- Carrega `GET /products`.
- Mostra nome, fornecedor, custo mensal por licença, `totalSeats`, `seatsInUse`
  e `seatsAvailable`.
- Mostra uma barra de ocupação com texto explícito, por exemplo `7 de 10 em uso`;
  a cor nunca é a única forma de comunicar o estado.
- Produtos com ocupação de 90% ou mais recebem destaque visual coerente com o
  limite do evento `seats.threshold`.

### Criar

O formulário envia `POST /products` com:

```json
{ "name": "Microsoft 365 E3", "vendor": "Microsoft", "monthlyCostCents": 18900, "totalSeats": 10 }
```

Na interface, o custo é preenchido em reais com até duas casas decimais (por
exemplo, `189,00`). Antes da chamada HTTP, o dashboard converte esse valor de
forma exata para o inteiro `monthlyCostCents: 18900`; valores decimais nunca são
enviados ao backend. `totalSeats` continua sendo preenchido como inteiro. A
validação definitiva dos campos enviados continua no backend.

### Editar

- A ação abre um formulário preenchido com os valores atuais.
- O custo retornado em centavos é apresentado em reais no formulário (por
  exemplo, `18900` é exibido como `189,00`) e convertido novamente para centavos
  ao salvar.
- Envia `PATCH /products/:id` somente com os campos editáveis da interface:
  `name`, `vendor`, `monthlyCostCents` e `totalSeats`.
- RN07 e RN09 não são reimplementadas; um 409 é mostrado conforme a seção
  "Erros e feedback".

## Colaboradores

### Lista e filtros

- Carrega `GET /employees`.
- Permite combinar `status` e `department`, usando os mesmos query params do
  endpoint.
- Mostra nome, e-mail, departamento, status e data de desligamento, quando houver.
- Os três status têm texto explícito: `ACTIVE`, `ON_LEAVE` e `OFFBOARDED`.

### Criar

Envia `POST /employees` com `name`, `email` e `department`. O dashboard não envia
`status`; o backend cria o colaborador como `ACTIVE`.

### Detalhar e mudar status

- Ao abrir um colaborador, carrega `GET /employees/:id` e mostra somente suas
  licenças ativas, conforme a resposta do endpoint.
- Para `ACTIVE`, oferece "Colocar em férias" e envia
  `PATCH /employees/:id/status` com `ON_LEAVE`.
- Para `ON_LEAVE`, oferece "Reativar" e envia o mesmo endpoint com `ACTIVE`.
- Para `OFFBOARDED`, não oferece mudança de status nem nova atribuição.
- Colocar em férias não apresenta qualquer mensagem de revogação; RN08 mantém as
  licenças existentes.

### Desligar

- Disponível para colaboradores `ACTIVE` e `ON_LEAVE`.
- Exige confirmação que identifica o colaborador e informa que todas as licenças
  ativas serão revogadas.
- Envia `POST /employees/:id/offboard` somente depois da confirmação.
- No sucesso, mostra `revokedLicenses` e `monthlySavingsCents` retornados pelo
  backend; esses valores não são calculados antecipadamente no navegador.

## Atribuições

### Lista e filtros

- Carrega `GET /licenses`.
- Permite combinar os filtros `productId`, `employeeId` e `active`.
- Mostra produto, colaborador, `assignedAt`, situação ativa/revogada,
  `revokedAt` e `revokeReason`.
- Datas são exibidas no fuso local do navegador, mantendo os valores HTTP em UTC.

### Atribuir

- O formulário usa seletores alimentados por `GET /products` e
  `GET /employees` para evitar cópia manual de UUIDs.
- Na apresentação, prioriza produtos com vagas e colaboradores `ACTIVE`.
- Envia `POST /licenses` com `productId` e `employeeId`.
- A disponibilidade mostrada é apenas informativa: RN01–RN03 continuam sendo
  verificadas pelo backend no momento da requisição.

### Revogar

- A ação aparece somente em atribuições ativas.
- Exige confirmação que identifica produto e colaborador.
- Envia `POST /licenses/:id/revoke` e usa a resposta do backend como resultado.

## Atualização dos dados

- O carregamento inicial busca relatório, produtos, colaboradores e atribuições.
- Depois de qualquer mutação bem-sucedida, o dashboard busca novamente esses
  quatro conjuntos. Para o volume sem paginação deste projeto, prioriza-se
  simplicidade e consistência em vez de cache ou atualização otimista.
- Enquanto uma ação está em andamento, seu botão fica desabilitado para evitar
  duplo clique acidental.
- A interface não assume sucesso antes da resposta HTTP.

## Erros e feedback

- Sucesso em mutações gera uma confirmação curta e identificável.
- Respostas 400, 404 e 409 mostram o status HTTP e o campo `message` devolvido
  pela aplicação.
- Quando `message` é um array do `ValidationPipe`, cada item é exibido.
- A mensagem não é substituída por texto genérico nem traduzida, pois faz parte
  do comportamento documentado dos módulos de domínio.
- Falha de rede ou resposta sem JSON mostra uma mensagem própria em português e
  permite tentar novamente.
- Um erro em uma ação não apaga os dados que já estavam visíveis.

## Estados visuais e acessibilidade

- O primeiro carregamento mostra estado `Carregando…`; não exibe zeros que
  possam ser confundidos com dados reais.
- Cada lista tem estado vazio específico, como `Nenhum produto cadastrado`.
- Formulários têm `label` associado a cada campo e podem ser usados por teclado.
- Confirmações e erros recebem foco ou usam uma região `aria-live`.
- Tabelas podem rolar horizontalmente em telas estreitas; ações continuam
  acessíveis sem exigir uma largura fixa de desktop.
- A interface permanece utilizável sem depender somente de cor, animação ou
  ícones sem texto.

## WebSocket

- Ao carregar, conecta Socket.IO ao mesmo host e namespace padrão (`/`).
- O cabeçalho mostra `Tempo real conectado` ou `Tempo real desconectado`.
- Ao receber `seats.threshold`, mostra um aviso com produto, vagas em uso e total.
- Os avisos existem somente durante a sessão atual; não há histórico persistido.
- Desconexão do Socket.IO não bloqueia chamadas HTTP nem impede o uso do dashboard.

## Critérios de aceite

### UI-AC01 — entrega a interface no mesmo servidor          [e2e]
- Dado   a aplicação iniciada
- Quando faço `GET /`
- Então  recebo 200 com o HTML do dashboard
- E      seus assets locais respondem 200
- E      `GET /docs` continua disponível

### UI-AC02 — mostra a visão geral                            [manual]
- Dado   os dados do seed
- Quando abro o dashboard
- Então  vejo custo total, economia potencial, licenças ativas, vagas ociosas,
  custos por departamento e desperdício por produto com os valores do relatório

### UI-AC03 — cria e edita produto                            [manual]
- Quando crio um produto com custo `189,00` pela interface
- Então  o dashboard envia `POST /products` com `monthlyCostCents: 18900`,
  confirma o sucesso e atualiza a lista
- E      quando edito o produto, envia `PATCH /products/:id` e mostra o resultado

### UI-AC04 — cria, filtra e detalha colaborador              [manual]
- Quando crio um colaborador pela interface
- Então  ele aparece como `ACTIVE`
- E      filtros de status/departamento usam `GET /employees` com query params
- E      o detalhe mostra apenas suas licenças ativas

### UI-AC05 — férias preservam licenças                       [manual] RN08
- Dado   um colaborador `ACTIVE` com licenças
- Quando escolho "Colocar em férias"
- Então  o dashboard envia o PATCH com `ON_LEAVE`, atualiza o status e as licenças
  continuam visíveis no detalhe

### UI-AC06 — desligamento mostra o efeito real               [manual] RN04 RN05
- Dado   um colaborador `ACTIVE` ou `ON_LEAVE`
- Quando confirmo seu desligamento
- Então  o dashboard envia `POST /employees/:id/offboard`
- E      mostra a contagem e a economia retornadas pelo backend
- E      atualiza produtos, colaboradores, atribuições e relatório

### UI-AC07 — atribui e revoga licença                        [manual] RN01 RN02 RN03 RN06
- Dado   um produto com vaga e um colaborador `ACTIVE`
- Quando seleciono os dois e confirmo a atribuição
- Então  o dashboard envia `POST /licenses` e atualiza a ocupação
- E      posso confirmar a revogação da atribuição ativa e vê-la no histórico

### UI-AC08 — expõe erros do backend                          [manual]
- Quando uma ação recebe 400, 404 ou 409
- Então  vejo o status e a mensagem devolvida pela aplicação
- E      os dados já carregados permanecem na tela

### UI-AC09 — não confia em disponibilidade desatualizada     [manual] RN01
- Dado   que a tela ainda mostra uma vaga, mas outra requisição ocupa a última
- Quando tento atribuir pela interface
- Então  o 409 do backend é mostrado e a atualização seguinte exibe a ocupação real

### UI-AC10 — mostra alerta em tempo real                     [manual] RT-AC01
- Dado   o dashboard conectado ao Socket.IO
- Quando uma atribuição leva um produto a 90% ou mais
- Então  vejo o aviso `seats.threshold` com nome, uso e total do produto
- E      uma desconexão do socket não impede as operações HTTP

### UI-AC11 — trata carregamento e dados vazios               [manual]
- Enquanto as consultas iniciais não terminam
- Então  vejo `Carregando…`, não indicadores zerados
- E      listas vazias mostram mensagens específicas sem quebrar a navegação

### UI-AC12 — funciona no fluxo Docker                        [manual]
- Dado   um ambiente sem acesso à internet
- Quando executo `docker compose up --build`
- Então  aplicação, dashboard, Swagger e Socket.IO funcionam no mesmo endereço
  sem container, servidor ou comando adicional para a interface

### UI-AC13 — não duplica regras de negócio                   [manual]
- Quando inspeciono a implementação do dashboard
- Então  não encontro cálculo próprio de RN01–RN10, custo do offboarding ou
  alteração direta de banco
- E      todas as mutações passam pelas interfaces HTTP existentes

## Fora do escopo desta exceção

- login, permissões e usuários da interface;
- edição ou exclusão de atribuições históricas;
- exclusão de produtos ou colaboradores;
- rotas próprias no navegador;
- gráficos complexos, temas, internacionalização ou personalização visual;
- polling ou sincronização automática entre várias abas;
- exportação CSV/PDF;
- testes end-to-end de navegador com Playwright, Cypress ou dependência similar.

O teste automatizado desta etapa cobre a entrega dos assets. Os fluxos HTTP e as
regras de negócio continuam cobertos pelos testes existentes; os comportamentos
visuais são verificados pelo checklist `[manual]` acima.
