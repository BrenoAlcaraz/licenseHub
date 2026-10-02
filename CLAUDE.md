# LicenseHub — Especificação do projeto

> Documento de contexto para a IA que vai me ajudar a construir este projeto.
> Leia tudo antes de começar e siga as regras da seção "Como trabalhar comigo".

---

## 1. Contexto e objetivo

Sou estudante de Ciência de Dados e IA e estou me candidatando a uma vaga de **Backend Developer Júnior** cuja stack é NestJS, TypeScript, MikroORM, PostgreSQL, Docker, REST e WebSockets. Este projeto é para o meu GitHub e serve para mostrar que eu sei estruturar e explicar um back-end com essa stack.

**O problema de negócio é real e eu já o vivi.** No meu estágio de automação de processos, o time de TI controlava as licenças Microsoft manualmente. A cada contratação, desligamento ou férias, alguém precisava lembrar de atribuir ou remover a licença. Na prática, a empresa pagava por licenças de pessoas que já tinham saído e ninguém sabia quantas licenças estavam sobrando. Resolvi isso lá com Power Platform; aqui vou reconstruir a solução como um serviço back-end.

**Objetivo:** uma API REST simples, bem organizada, testada e bem documentada. **Simplicidade é requisito.** Prefiro um projeto pequeno e limpo a um projeto grande e inacabado.

---

## 2. Stack

| Item | Escolha |
|---|---|
| Runtime | Node.js 22 LTS |
| Linguagem | TypeScript com `strict: true` |
| Framework | NestJS (versão estável mais recente) |
| Banco | PostgreSQL 16 |
| ORM | MikroORM 6 (`@mikro-orm/core`, `@mikro-orm/postgresql`, `@mikro-orm/nestjs`, `@mikro-orm/migrations`, `@mikro-orm/cli`) |
| Validação | `class-validator` + `class-transformer` com `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) |
| Configuração | `@nestjs/config` com arquivo `.env` |
| Documentação | `@nestjs/swagger` exposto em `/docs` |
| Testes | Jest (já vem com o NestJS) |
| Containers | Dockerfile + `docker-compose.yml` (API + PostgreSQL) |
| Qualidade | ESLint + Prettier (padrão do NestJS CLI) |

### Fora do escopo — NÃO implementar

- Autenticação e autorização (login, JWT, perfis)
- Front-end
- AWS, filas (SQS/SNS), Kubernetes, Terraform
- Microsserviços: é **um único serviço**
- Paginação, cache, rate limit
- Qualquer funcionalidade que não esteja descrita neste documento

---

## 3. Modelo de domínio

Três entidades. Todos os IDs são **UUID**. Valores em dinheiro são **inteiros em centavos** (nunca `float`). Datas em UTC.

### Product (produto de software)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| name | string | obrigatório, único (ex.: "Microsoft 365 E3") |
| vendor | string | obrigatório (ex.: "Microsoft") |
| monthlyCostCents | integer | obrigatório, ≥ 0 — custo mensal de **uma** licença |
| totalSeats | integer | obrigatório, ≥ 1 — quantidade de licenças compradas |
| createdAt / updatedAt | datetime | automáticos |

### Employee (colaborador)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| name | string | obrigatório |
| email | string | obrigatório, único, formato de e-mail |
| department | string | obrigatório (ex.: "TI", "RH", "Financeiro") |
| status | enum | `ACTIVE` \| `ON_LEAVE` \| `OFFBOARDED`; padrão `ACTIVE` |
| offboardedAt | datetime \| null | preenchido no desligamento |
| createdAt / updatedAt | datetime | automáticos |

### LicenseAssignment (atribuição de licença)

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| product | ManyToOne → Product | obrigatório |
| employee | ManyToOne → Employee | obrigatório |
| assignedAt | datetime | automático |
| revokedAt | datetime \| null | preenchido na revogação |
| revokeReason | enum \| null | `MANUAL` \| `OFFBOARDING` |

- **Uma atribuição está ativa quando `revokedAt` é `null`.**
- Atribuições **nunca são apagadas**: revogar = preencher `revokedAt`. Assim a própria tabela já é o histórico (não precisa de tabela de auditoria separada).
- "Licenças em uso" de um produto = número de atribuições ativas dele.

---

## 4. Regras de negócio

Estas regras são o coração do projeto. Elas devem ficar nos **services** (nunca nos controllers) e **todas** precisam de teste unitário.

| Código | Regra | Erro |
|---|---|---|
| RN01 | Só é possível atribuir licença se o produto tiver vaga (`em uso < totalSeats`). | 409 Conflict |
| RN02 | Só colaboradores com status `ACTIVE` podem receber licença. | 409 Conflict |
| RN03 | Um colaborador não pode ter duas atribuições **ativas** do mesmo produto. | 409 Conflict |
| RN04 | Desligar um colaborador muda o status para `OFFBOARDED`, preenche `offboardedAt` e revoga **todas** as atribuições ativas dele com `revokeReason = OFFBOARDING`. Tudo em **uma única transação**. | — |
| RN05 | Não é possível desligar quem já está `OFFBOARDED`. | 409 Conflict |
| RN06 | Não é possível revogar uma atribuição que já foi revogada. | 409 Conflict |
| RN07 | Não é possível reduzir `totalSeats` de um produto para menos do que as licenças em uso. | 409 Conflict |
| RN08 | Colaborador `ON_LEAVE` mantém as licenças que já tem (não perde nada), mas não recebe novas (consequência da RN02). | — |
| RN09 | `name` de produto e `email` de colaborador duplicados. | 409 Conflict |
| RN10 | Recurso inexistente (produto, colaborador, atribuição). | 404 Not Found |

Erros de validação de entrada (campo faltando, tipo errado, e-mail inválido) retornam **400** automaticamente pelo `ValidationPipe`. As mensagens de erro devem ser claras e em inglês, por exemplo: `"Product 'Slack Pro' has no available seats (10/10 in use)"`.

---

## 5. Endpoints

Base: `http://localhost:3000`. Swagger em `/docs`.

### Products

| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| POST | `/products` | Cria produto | 201 |
| GET | `/products` | Lista produtos **com** `seatsInUse` e `seatsAvailable` calculados | 200 |
| GET | `/products/:id` | Detalhe do produto (com `seatsInUse` e `seatsAvailable`) | 200 |
| PATCH | `/products/:id` | Atualiza `name`, `vendor`, `monthlyCostCents` ou `totalSeats` (respeitando RN07) | 200 |

Exemplo — `POST /products`
```json
{ "name": "Microsoft 365 E3", "vendor": "Microsoft", "monthlyCostCents": 18900, "totalSeats": 10 }
```

Exemplo — item de `GET /products`
```json
{
  "id": "…", "name": "Microsoft 365 E3", "vendor": "Microsoft",
  "monthlyCostCents": 18900, "totalSeats": 10,
  "seatsInUse": 7, "seatsAvailable": 3
}
```

### Employees

| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| POST | `/employees` | Cria colaborador (status `ACTIVE`) | 201 |
| GET | `/employees` | Lista colaboradores; filtros opcionais `?status=` e `?department=` | 200 |
| GET | `/employees/:id` | Detalhe + lista das licenças **ativas** do colaborador | 200 |
| PATCH | `/employees/:id/status` | Alterna entre `ACTIVE` e `ON_LEAVE` (não permite `OFFBOARDED` — para isso existe o endpoint abaixo) | 200 |
| POST | `/employees/:id/offboard` | Desliga o colaborador (RN04, RN05) e retorna quantas licenças foram liberadas | 200 |

Exemplo — resposta de `POST /employees/:id/offboard`
```json
{ "employeeId": "…", "status": "OFFBOARDED", "revokedLicenses": 3, "monthlySavingsCents": 45700 }
```

### Licenses

| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| POST | `/licenses` | Atribui licença (RN01, RN02, RN03) | 201 |
| GET | `/licenses` | Lista atribuições; filtros opcionais `?productId=`, `?employeeId=`, `?active=true\|false` | 200 |
| POST | `/licenses/:id/revoke` | Revoga manualmente (`revokeReason = MANUAL`) (RN06) | 200 |

Exemplo — `POST /licenses`
```json
{ "productId": "…", "employeeId": "…" }
```

### Reports

| Método | Rota | Descrição | Sucesso |
|---|---|---|---|
| GET | `/reports/costs` | Relatório de custos e desperdício | 200 |

Exemplo — resposta de `GET /reports/costs`
```json
{
  "totalMonthlyCostCents": 189000,
  "byDepartment": [
    { "department": "TI", "activeLicenses": 5, "monthlyCostCents": 94500 }
  ],
  "idleSeats": [
    { "productId": "…", "productName": "Microsoft 365 E3", "idleSeats": 3, "wastedMonthlyCostCents": 56700 }
  ],
  "potentialMonthlySavingsCents": 56700
}
```

Como calcular:
- `totalMonthlyCostCents` = soma de `totalSeats × monthlyCostCents` de todos os produtos (é o que a empresa paga).
- `byDepartment` = para cada departamento, soma do `monthlyCostCents` das atribuições **ativas** dos colaboradores daquele departamento.
- `idleSeats` = produtos onde `totalSeats − seatsInUse > 0`; `wastedMonthlyCostCents = idleSeats × monthlyCostCents`.
- `potentialMonthlySavingsCents` = soma de todos os `wastedMonthlyCostCents`.

Pode ser feito com queries do MikroORM ou SQL via `em.getConnection().execute()` / QueryBuilder — o que ficar mais legível.

---

## 6. Estrutura de pastas

Organização **por domínio** (cada módulo contém tudo o que é dele):

```
licensehub/
├── src/
│   ├── main.ts                     # bootstrap, ValidationPipe global, Swagger
│   ├── app.module.ts
│   ├── mikro-orm.config.ts
│   ├── products/
│   │   ├── product.entity.ts
│   │   ├── products.module.ts
│   │   ├── products.controller.ts
│   │   ├── products.service.ts
│   │   ├── products.service.spec.ts
│   │   └── dto/
│   ├── employees/
│   │   ├── employee.entity.ts
│   │   ├── employee-status.enum.ts
│   │   ├── employees.module.ts
│   │   ├── employees.controller.ts
│   │   ├── employees.service.ts
│   │   ├── employees.service.spec.ts
│   │   └── dto/
│   ├── licenses/
│   │   ├── license-assignment.entity.ts
│   │   ├── revoke-reason.enum.ts
│   │   ├── licenses.module.ts
│   │   ├── licenses.controller.ts
│   │   ├── licenses.service.ts
│   │   ├── licenses.service.spec.ts
│   │   └── dto/
│   ├── reports/
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts
│   │   └── reports.service.ts
│   └── database/
│       ├── migrations/
│       └── seed.ts                 # dados de exemplo
├── test/
│   └── app.e2e-spec.ts             # opcional (ver seção 8)
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 7. Banco, Docker e configuração

### `.env.example`
```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=licensehub
DB_PASSWORD=licensehub
DB_NAME=licensehub
```

### Requisitos
- `docker compose up --build` deve subir **PostgreSQL + API** e deixar tudo funcionando, sem passos manuais.
- O PostgreSQL no compose tem `healthcheck`, e a API só sobe depois que o banco está saudável (`depends_on: condition: service_healthy`).
- As migrations rodam automaticamente na inicialização da API (por exemplo, `migrator.up()` no bootstrap ou um script `start` que roda as migrations antes).
- O schema é criado **só por migrations** (sem `schema:update` / `synchronize` em produção).
- Dockerfile **multi-stage** (build → runtime enxuto, com `npm ci --omit=dev` na imagem final).
- Script `npm run seed` para popular o banco com dados de exemplo: ~4 produtos, ~10 colaboradores em 3 departamentos e algumas atribuições, incluindo pelo menos 1 produto com licenças ociosas e 1 colaborador `ON_LEAVE`.

### Scripts no `package.json`
```
start, start:dev, build, test, test:cov, lint,
migration:create, migration:up, seed
```

---

## 8. Testes

### Obrigatório: testes unitários dos services
Com Jest e o `EntityManager`/repositórios **mockados**. Casos mínimos:

**LicensesService**
- atribui licença com sucesso quando há vaga e o colaborador está `ACTIVE`
- RN01 — falha com 409 quando o produto está sem vagas
- RN02 — falha com 409 quando o colaborador está `ON_LEAVE` ou `OFFBOARDED`
- RN03 — falha com 409 quando o colaborador já tem licença ativa do produto
- RN06 — falha com 409 ao revogar uma atribuição já revogada
- RN10 — falha com 404 quando o produto ou o colaborador não existe

**EmployeesService**
- RN04 — desligar revoga todas as licenças ativas com `OFFBOARDING` e retorna a contagem correta
- RN05 — falha com 409 ao desligar quem já está `OFFBOARDED`
- RN08 — mudar para `ON_LEAVE` não revoga licenças

**ProductsService**
- RN07 — falha com 409 ao reduzir `totalSeats` abaixo do que está em uso

### Opcional: um teste e2e
Um fluxo completo contra o banco do Docker: criar produto → criar colaborador → atribuir → desligar → conferir que a licença foi liberada.

---

## 9. Extra opcional (só depois de tudo pronto)

**Alerta em tempo real via WebSocket.** Um gateway do NestJS (`@nestjs/websockets` + `socket.io`) que emite o evento `seats.threshold` quando, após uma atribuição, um produto atinge **90% ou mais** das licenças em uso:

```json
{ "productId": "…", "productName": "Microsoft 365 E3", "seatsInUse": 9, "totalSeats": 10 }
```

Incluir no README como testar (por exemplo, com um cliente socket.io simples ou o Postman).

---

## 10. README (em português)

O README é tão importante quanto o código. Seções:

1. **LicenseHub** — uma frase do que é.
2. **O problema** — a história real do estágio (seção 1 deste documento), em 1 parágrafo.
3. **Funcionalidades** — lista curta.
4. **Regras de negócio** — a tabela RN01–RN10.
5. **Stack** — com uma linha justificando cada escolha.
6. **Como rodar** — `docker compose up --build`, depois `npm run seed`, e o link do Swagger.
7. **Exemplos de uso** — 3 ou 4 chamadas `curl` mostrando o fluxo atribuir → desligar → relatório.
8. **Como rodar os testes.**
9. **Estrutura do projeto** — a árvore de pastas com 1 linha por módulo.
10. **Decisões técnicas** — por que dinheiro em centavos, por que soft-revoke (histórico), por que a transação no desligamento, por que organização por domínio.
11. **O que eu faria em produção** — autenticação, paginação, auditoria de quem fez cada ação, integração real com a API da Microsoft (Graph), fila para processar desligamentos em lote.
12. **Uso de IA no desenvolvimento** — como usei IA, e exemplos concretos do que revisei, corrigi ou rejeitei.

---

## 11. Plano de execução (commits pequenos)

Cada etapa = 1 commit (ou poucos), com mensagem no padrão Conventional Commits.

| # | Etapa | Pronto quando |
|---|---|---|
| 1 | Projeto NestJS + TS strict + ESLint/Prettier | `npm run start:dev` sobe |
| 2 | Docker Compose com PostgreSQL + configuração do MikroORM | API conecta no banco |
| 3 | Entidade e módulo de **Products** + migration | CRUD responde no Swagger |
| 4 | Entidade e módulo de **Employees** + migration | CRUD e filtros funcionam |
| 5 | **Licenses**: atribuir e revogar com RN01–RN03, RN06 + testes | testes passam |
| 6 | **Offboarding** transacional (RN04, RN05, RN08) + testes | testes passam |
| 7 | RN07 em products + teste | teste passa |
| 8 | **Reports** de custo | números batem com o seed |
| 9 | Dockerfile multi-stage + migrations automáticas + seed | `docker compose up --build` funciona do zero |
| 10 | README completo | outra pessoa consegue rodar só lendo o README |
| 11 | (Opcional) teste e2e | — |
| 12 | (Opcional) WebSocket `seats.threshold` | — |

Exemplos de mensagens: `feat(licenses): assign license with seat availability check`, `test(employees): cover offboarding rules`, `docs: add README with business rules`.

---

## 12. Como trabalhar comigo (instruções para a IA)

- **Siga o plano da seção 11, uma etapa por vez.** Ao terminar cada etapa, pare, explique o que foi feito e espere minha confirmação antes de seguir.
- **Explique as decisões** de forma curta: estou aprendendo NestJS e MikroORM e preciso conseguir explicar este código numa entrevista.
- **Não adicione nada fora do escopo** (seção 2). Se achar que algo é necessário, pergunte antes.
- **Não adicione dependências** além das listadas sem me perguntar.
- **Código simples e legível** acima de código "esperto". Nada de abstrações genéricas (repositórios base, factories, padrões desnecessários).
- **Nomes em inglês** no código; README em português.
- Regras de negócio **sempre nos services**; controllers só recebem a requisição, validam o DTO e chamam o service.
- Sempre que criar ou alterar uma entidade, gere a **migration** correspondente.
- Rode os testes e o lint ao final de cada etapa e me mostre o resultado.
