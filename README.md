# LicenseHub

API REST que controla as licenças de software de uma empresa: quem tem cada licença, quantas sobram, quanto custam e quanto se economiza ao desligar um colaborador.

## O problema

No meu estágio de automação de processos, o time de TI controlava as licenças Microsoft manualmente. A cada contratação, desligamento ou férias, alguém precisava lembrar de atribuir ou remover a licença. Na prática, a empresa pagava por licenças de pessoas que já tinham saído e ninguém sabia quantas licenças estavam sobrando. Resolvi isso lá com Power Platform; aqui reconstruí a solução como um serviço back-end, com as regras de negócio explícitas, testadas e protegidas contra acessos simultâneos.

## Funcionalidades

- Cadastro de **produtos** (licenças compradas) com vagas em uso e disponíveis calculadas.
- Cadastro de **colaboradores**, com filtros por status e departamento, e mudança de status (`ACTIVE` ⇄ `ON_LEAVE`).
- **Atribuição e revogação** de licenças, com histórico completo (nada é apagado).
- **Desligamento** em uma única transação: o colaborador vira `OFFBOARDED` e todas as licenças dele são liberadas.
- **Relatório de custos**: custo total, custo por departamento, vagas ociosas e economia potencial.
- Documentação interativa com **Swagger** em `/docs`.

## Regras de negócio

| Código | Regra | Erro |
|---|---|---|
| RN01 | Só é possível atribuir licença se o produto tiver vaga (`em uso < totalSeats`). | 409 |
| RN02 | Só colaboradores com status `ACTIVE` podem receber licença. | 409 |
| RN03 | Um colaborador não pode ter duas atribuições **ativas** do mesmo produto. | 409 |
| RN04 | Desligar muda o status para `OFFBOARDED`, preenche `offboardedAt` e revoga **todas** as atribuições ativas com `revokeReason = OFFBOARDING`, em **uma única transação**. | — |
| RN05 | Não é possível desligar quem já está `OFFBOARDED`. | 409 |
| RN06 | Não é possível revogar uma atribuição que já foi revogada. | 409 |
| RN07 | Não é possível reduzir `totalSeats` para menos do que as licenças em uso. | 409 |
| RN08 | Colaborador `ON_LEAVE` mantém as licenças que já tem, mas não recebe novas. | — |
| RN09 | `name` de produto e `email` de colaborador são únicos. | 409 |
| RN10 | Recurso inexistente (produto, colaborador, atribuição). | 404 |

Entrada inválida (campo faltando, tipo errado, e-mail inválido, campo desconhecido, `:id` que não é UUID) retorna **400**.

O comportamento detalhado de cada endpoint, com critérios de aceite, está em [`specs/`](specs/).

## Stack

| Tecnologia | Por quê |
|---|---|
| **Node.js 22 LTS + TypeScript (`strict`)** | Tipagem forte pega erros antes de rodar; LTS garante suporte longo. |
| **NestJS 11** | Módulos, injeção de dependência e pipes de validação prontos; organiza o código por domínio. Usei a v11 (e não a 12) porque o adaptador `@mikro-orm/nestjs` do MikroORM 6 só suporta Nest 10/11. |
| **MikroORM 6** | Unit of Work e identity map, migrations geradas a partir das entidades, transações e locks com API simples. |
| **PostgreSQL 16** | Transações ACID, `SELECT ... FOR UPDATE`, índice único parcial e `CHECK` para enums. |
| **class-validator + class-transformer** | Validação declarativa nos DTOs; o `ValidationPipe` global devolve 400 sem código nos controllers. |
| **@nestjs/config** | Configuração por variáveis de ambiente (`.env`). |
| **@nestjs/swagger** | Documentação gerada a partir dos DTOs (com o plugin do CLI, sem repetir decorators). |
| **Jest** | Testes unitários dos services com o `EntityManager` mockado. |
| **Docker + Docker Compose** | Sobe banco e API com um comando, igual em qualquer máquina. |
| **ESLint + Prettier** | Padrão de código e formatação automáticos. |

## Como rodar

**Pré-requisitos:** Docker. Para rodar o seed e os testes no host também é preciso Node.js 22.

```bash
git clone <url-do-repositorio> licensehub
cd licensehub
cp .env.example .env

# Sobe PostgreSQL + API. As migrations são aplicadas automaticamente.
docker compose up --build -d

# Popula o banco com dados de exemplo (4 produtos, 10 colaboradores, 17 atribuições)
npm install
npm run seed
```

Sem Node.js no host, o seed também pode rodar dentro do container:

```bash
docker compose exec api node dist/database/seed.js
```

Pronto: **Swagger em http://localhost:3000/docs**.

- O seed se recusa a rodar se o banco já tiver dados. Para recomeçar do zero: `docker compose down -v && docker compose up --build -d`.
- Se a porta 5432 já estiver em uso (por exemplo, um PostgreSQL instalado localmente), troque `DB_PORT` no `.env` (ex.: `5433`). A API dentro do Docker não é afetada; só muda a porta publicada no host.

**Desenvolvimento local** (API fora do Docker, só o banco no container):

```bash
docker compose up -d db
npm run start:dev
```

## Exemplos de uso

Fluxo completo com os dados do seed: **atribuir → desligar → relatório**. Os ids são UUIDs gerados pelo banco; pegue-os nas listagens (ou no Swagger).

**1. Ver produtos e vagas.** O Jira Software tem 8 vagas e 4 em uso:

```bash
curl http://localhost:3000/products
```

```json
[
  { "id": "…", "name": "Jira Software", "vendor": "Atlassian", "monthlyCostCents": 4000,
    "totalSeats": 8, "seatsInUse": 4, "seatsAvailable": 4 }
]
```

**2. Atribuir uma licença** ao João Pereira (que não tem nenhuma):

```bash
curl -X POST http://localhost:3000/licenses \
  -H "Content-Type: application/json" \
  -d '{"productId":"<id-do-jira>","employeeId":"<id-do-joao>"}'
```

Tentar dar uma licença do **Slack Pro** (lotado, 5/5) retorna:

```json
{ "statusCode": 409, "error": "Conflict",
  "message": "Product 'Slack Pro' has no available seats (5/5 in use)" }
```

**3. Desligar a Ana Souza.** Ela tinha Microsoft 365, Slack e Jira:

```bash
curl -X POST http://localhost:3000/employees/<id-da-ana>/offboard
```

```json
{ "employeeId": "…", "status": "OFFBOARDED", "revokedLicenses": 3, "monthlySavingsCents": 27400 }
```

**4. Relatório de custos:**

```bash
curl http://localhost:3000/reports/costs
```

```json
{
  "totalMonthlyCostCents": 326000,
  "byDepartment": [
    { "department": "TI", "activeLicenses": 8, "monthlyCostCents": 77700 },
    { "department": "RH", "activeLicenses": 4, "monthlyCostCents": 69800 },
    { "department": "Financeiro", "activeLicenses": 3, "monthlyCostCents": 27400 }
  ],
  "idleSeats": [ … ],
  "potentialMonthlySavingsCents": 151100
}
```

A economia potencial passou de 127.700 (seed) para 151.100: +27.400 das licenças liberadas pela Ana e −4.000 da vaga do Jira que o João passou a usar. O TI caiu de 11 para 8 licenças, e o Financeiro ganhou a do João.

> **Windows:** ao usar `curl` no Git Bash/PowerShell com acentos no corpo (ex.: `"Fábio"`), o terminal pode mudar a codificação do texto. Use o Swagger ou envie o JSON a partir de um arquivo (`-d @body.json`).

## Como rodar os testes

```bash
npm test          # testes unitários (52 testes, 4 suítes)
npm run test:cov  # com relatório de cobertura em coverage/
npm run lint      # ESLint + Prettier
npm run build     # checagem de tipos completa
```

- Os testes cobrem **todas as regras de negócio** nos services, com o `EntityManager` mockado. A cobertura de linhas dos services fica entre 98% e 100%.
- O nome de cada teste cita o critério de aceite da spec (ex.: `LIC-AC07 (RN01) fails with 409 when the product has no available seats`).
- `npm run build` faz parte da verificação: o `ts-jest` não faz checagem de tipos entre arquivos, então um erro de tipo pode passar nos testes e só aparecer no build.

## Estrutura do projeto

```
licensehub/
├── specs/                   # critérios de aceite de cada módulo (fonte da verdade)
├── src/
│   ├── main.ts              # bootstrap: migrations, ValidationPipe global, Swagger
│   ├── app.module.ts        # junta config, MikroORM e os módulos de domínio
│   ├── mikro-orm.config.ts  # configuração do banco (app e CLI de migrations)
│   ├── products/            # produtos, cálculo de vagas, RN07, RN09
│   ├── employees/           # colaboradores, status, desligamento (RN04, RN05, RN08)
│   ├── licenses/            # atribuição e revogação (RN01–RN03, RN06)
│   ├── reports/             # relatório de custos e desperdício
│   └── database/
│       ├── migrations/      # schema versionado (gerado pelo MikroORM)
│       └── seed.ts          # dados de exemplo
├── Dockerfile               # multi-stage: build → runtime enxuto
└── docker-compose.yml       # PostgreSQL + API
```

Cada módulo de domínio contém a entidade, o service (regras), o controller (HTTP), os DTOs e o teste do service.

## Spec Driven Development

Nada foi implementado sem estar descrito antes em [`specs/`](specs/). O ciclo de cada módulo foi:

1. **Spec**: endpoints, mensagens de erro exatas e critérios de aceite no formato *Dado / Quando / Então*, cada um com um ID (`LIC-AC05`) e a regra que cobre (`RN03`).
2. **Red**: um teste por critério, escrito antes do código, falhando.
3. **Green**: entidade, migration, DTOs, service e controller até os testes passarem.
4. **Refactor**: limpeza com os testes verdes, mais lint e build.

Cada critério é marcado como `[unit]` (teste do service), `[pipe]` (validação do DTO) ou `[manual]` (conferido contra o banco). Um `grep` pelo ID encontra a spec e o teste que a garante. Os números do relatório na spec são calculados a partir dos dados do seed, então a própria spec serve como teste de aceitação.

## Decisões técnicas

**Dinheiro em centavos (inteiros).** `float` não representa valores decimais com exatidão (`0.1 + 0.2 !== 0.3`). Com inteiros em centavos, somas e multiplicações são exatas; a formatação em reais fica para quem exibe.

**Revogação sem apagar (soft revoke).** Revogar preenche `revokedAt` e `revokeReason` em vez de apagar a linha. A tabela de atribuições vira o histórico completo (quem teve qual licença, quando e por quê) sem precisar de uma tabela de auditoria separada. "Ativa" é simplesmente `revokedAt IS NULL`.

**Transação no desligamento.** Mudar o status e revogar N licenças são várias escritas. Com `em.transactional()`, ou tudo é salvo ou nada é: nunca existe um colaborador `OFFBOARDED` com licença ativa, nem licenças revogadas de alguém que continua `ACTIVE`. Testei isso forçando o `UPDATE` do colaborador a falhar: as revogações foram desfeitas junto.

**Concorrência: lock pessimista onde a regra é decidida.** Toda operação que *lê → checa uma regra → grava* lê a linha que decide a regra com `SELECT ... FOR UPDATE`, dentro de uma transação. Quem chega depois espera e lê o dado já atualizado.

| Operação | Linha travada | Protege |
|---|---|---|
| Atribuir licença | produto e colaborador | RN01, RN02 (vs. desligamento) |
| Reduzir `totalSeats` | produto | RN07 (vs. atribuição) |
| Desligar / mudar status | colaborador | RN04, RN05 |
| Revogar | atribuição | RN06 |

Antes disso, 20 atribuições simultâneas para um produto com **1 vaga** passavam todas (`20/1` em uso); depois, exatamente 1 passa e as outras 19 recebem 409.

**Índice único parcial para a RN03.** `UNIQUE (product_id, employee_id) WHERE revoked_at IS NULL` garante no banco que só existe uma atribuição *ativa* por par, mas permite reatribuir depois de revogar. O service checa antes (para dar uma mensagem clara), e a violação do índice também vira 409.

**Relatório: o banco agrega, o service deriva.** `COUNT`/`SUM`/`GROUP BY` no SQL; total, desperdício e ordenação em TypeScript (a parte testada unitariamente). As duas consultas rodam numa transação `REPEATABLE READ`, a mesma "foto" do banco, então `custo total − custo em uso = economia potencial` sempre fecha.

**Schema só por migrations.** Nada de `schema:update`/`synchronize`. As migrations são geradas a partir das entidades e aplicadas automaticamente quando a API sobe.

**Organização por domínio.** Cada pasta (`products`, `employees`, `licenses`, `reports`) contém tudo o que é dela. Para entender ou mudar uma regra, basta olhar uma pasta. Controllers só recebem a requisição e chamam o service; regras de negócio ficam sempre nos services.

## O que eu faria em produção

- **Autenticação e autorização**: JWT/SSO corporativo e perfis (só o TI atribui e desliga; gestores consultam relatórios).
- **Paginação** nas listagens (`GET /employees`, `GET /licenses`), que hoje retornam tudo.
- **Auditoria de quem fez cada ação**: registrar o usuário responsável em cada atribuição, revogação e desligamento (hoje o histórico guarda *o quê* e *quando*, mas não *quem*).
- **Integração real com a Microsoft (Graph API)**: atribuir e remover a licença no Microsoft 365 de verdade, e sincronizar colaboradores com o Azure AD / RH.
- **Fila para desligamentos em lote**: processar desligamentos vindos do RH de forma assíncrona (ex.: SQS), com retentativas e idempotência.
- **Migrations como etapa separada do deploy**: com várias réplicas, rodar as migrations num job antes de subir a nova versão, em vez de cada instância tentar no boot.
- **`lock_timeout` e retentativa** nas operações com lock, para não deixar requisições esperando indefinidamente sob alta concorrência.

## Uso de IA no desenvolvimento

Usei o Claude Code como par de programação, com regras definidas por mim em um documento de contexto: seguir um plano de etapas pequenas, parar ao fim de cada uma para eu revisar, não adicionar dependências nem escopo sem perguntar, e explicar cada decisão. O fluxo de Spec Driven Development (spec → teste falhando → código) foi uma escolha minha para manter o controle: eu aprovava a spec antes de qualquer código.

Exemplos concretos do que revisei, corrigi ou rejeitei:

- **Versão do framework.** O CLI mais recente gerava NestJS 12 com Vitest e oxlint. Como o adaptador do MikroORM 6 não suporta Nest 12 e a vaga cita Jest/ESLint, escolhi ficar no **Nest 11**.
- **Concorrência na RN01.** A primeira versão checava as vagas sem nenhum lock. Quando a IA apontou isso como "limitação conhecida", pedi a correção. Antes de corrigir, reproduzimos o bug: 20 atribuições simultâneas num produto de 1 vaga resultaram em `20/1` em uso.
- **Correção da correção.** A primeira versão do lock lia o produto e *depois* o travava, então o dado podia estar desatualizado. Na revisão, trocamos por "ler já travando" (`findOne` com `lockMode`) e estendemos o mesmo padrão para desligamento, mudança de status, revogação e redução de vagas.
- **Teste que não provava nada.** Um teste de corrida feito com `curl` em sequência no Git Bash não reproduzia o problema, porque os processos subiam devagar demais para competir. Só um script com `Promise.all` mostrou o bug. Também percebi que algumas corridas só exercitavam uma ordem de chegada e forcei a ordem inversa.
- **Testes verdes, build quebrado.** Um getter (`isActive`) na entidade passava nos testes, mas quebrava a compilação, porque o `ts-jest` não checa tipos entre arquivos. Desde então, `npm run build` faz parte da verificação de toda etapa.
- **Reforço da RN03 no banco.** Aprovei o índice único parcial proposto, que não estava no escopo original, porque ele garante a regra mesmo se duas requisições passarem pela checagem do service ao mesmo tempo.
- **Seed seguro.** O seed recusa rodar em banco com dados em vez de apagá-los, para não haver risco de perder dados por engano.
