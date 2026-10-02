# Spec — Reports

Relatório de custo mensal e desperdício (licenças pagas e não usadas).
Somente leitura; nenhuma regra de negócio altera dados aqui.

## Endpoint

| Método | Rota | Sucesso |
|---|---|---|
| GET | `/reports/costs` | 200 `CostReport` |

`CostReport`
```json
{
  "totalMonthlyCostCents": 326000,
  "byDepartment": [
    { "department": "TI", "activeLicenses": 11, "monthlyCostCents": 105100 }
  ],
  "idleSeats": [
    { "productId": "…", "productName": "Microsoft 365 E3", "idleSeats": 3, "wastedMonthlyCostCents": 56700 }
  ],
  "potentialMonthlySavingsCents": 127700
}
```

## Fórmulas

| Campo | Cálculo |
|---|---|
| `totalMonthlyCostCents` | Σ `totalSeats × monthlyCostCents` de todos os produtos (o que a empresa paga) |
| `byDepartment[]` | por departamento: nº de atribuições **ativas** e Σ `monthlyCostCents` delas |
| `idleSeats[]` | produtos com `totalSeats − seatsInUse > 0`; `wastedMonthlyCostCents = idleSeats × monthlyCostCents` |
| `potentialMonthlySavingsCents` | Σ `wastedMonthlyCostCents` |

Ordenação: `byDepartment` por `monthlyCostCents` decrescente; `idleSeats` por
`wastedMonthlyCostCents` decrescente (empate: ordem alfabética). Departamentos sem
licenças ativas não aparecem.

## Como é calculado

- O **banco agrega** (`COUNT`/`SUM`/`GROUP BY`) em duas consultas: vagas em uso por
  produto e custo das atribuições ativas por departamento.
- O **service deriva** o resto em TypeScript: total, vagas ociosas, desperdício,
  economia e ordenação.
- As duas consultas rodam numa transação `REPEATABLE READ` (uma "foto" única do
  banco), então `totalMonthlyCostCents − Σ byDepartment = potentialMonthlySavingsCents`
  sempre fecha.

## Dados do seed (base para conferir os números)

**Produtos**

| Produto | Vendor | Custo/mês | Seats | Em uso | Ociosas |
|---|---|---|---|---|---|
| Microsoft 365 E3 | Microsoft | 18900 | 10 | 7 | 3 |
| Slack Pro | Slack | 4500 | 5 | 5 | 0 (lotado) |
| Adobe Creative Cloud | Adobe | 27500 | 3 | 1 | 2 |
| Jira Software | Atlassian | 4000 | 8 | 4 | 4 |

**Colaboradores** (10, em 3 departamentos)

| Departamento | Colaboradores |
|---|---|
| TI | Ana Souza, Bruno Lima, Carla Mendes, Diego Rocha |
| RH | Elisa Martins, Fábio Lima (`ON_LEAVE`), Gabriela Nunes |
| Financeiro | Hugo Alves, Isabela Costa, João Pereira |

**Atribuições ativas** (17)

| Produto | Colaboradores |
|---|---|
| Microsoft 365 E3 | Ana, Bruno, Carla, Diego, Elisa, Fábio, Hugo |
| Slack Pro | Ana, Bruno, Carla, Gabriela, Isabela |
| Adobe Creative Cloud | Elisa |
| Jira Software | Ana, Bruno, Carla, Diego |

Fábio está `ON_LEAVE` e mantém a licença M365 (RN08). João Pereira não tem
nenhuma licença (bom para testar uma atribuição nova).

## Critérios de aceite

### REP-AC01 — custo total                                   [unit] [manual]
- Dado   os produtos do seed
- Quando faço `GET /reports/costs`
- Então  `totalMonthlyCostCents = 326000`
  (189000 + 22500 + 82500 + 32000)

### REP-AC02 — custo por departamento                        [unit] [manual]
- Dado   as atribuições ativas do seed
- Então  `byDepartment` é:

| department | activeLicenses | monthlyCostCents |
|---|---|---|
| TI | 11 | 105100 |
| RH | 4 | 69800 |
| Financeiro | 2 | 23400 |

### REP-AC03 — vagas ociosas                                 [unit] [manual]
- Então  `idleSeats` é (Slack Pro não aparece, está lotado):

| productName | idleSeats | wastedMonthlyCostCents |
|---|---|---|
| Microsoft 365 E3 | 3 | 56700 |
| Adobe Creative Cloud | 2 | 55000 |
| Jira Software | 4 | 16000 |

### REP-AC04 — economia potencial                            [unit] [manual]
- Então  `potentialMonthlySavingsCents = 127700`
- E      confere: `totalMonthlyCostCents − Σ byDepartment.monthlyCostCents`
  = 326000 − 198300 = 127700

### REP-AC05 — atribuições revogadas não contam              [manual]
- Dado   uma atribuição revogada
- Então  ela não entra em `byDepartment` e a vaga dela conta como ociosa
- Por que [manual]: o filtro `revoked_at IS NULL` está dentro do SQL de agregação;
  um teste com o banco mockado não consegue provar isso. Conferido contra o banco
  com o seed (etapa 9)

### REP-AC06 — banco vazio                                   [unit]
- Dado   nenhum produto cadastrado
- Então  recebo `{ "totalMonthlyCostCents": 0, "byDepartment": [], "idleSeats": [], "potentialMonthlySavingsCents": 0 }`

### REP-AC07 — reflete o desligamento                        [manual]
- Dado   o seed
- Quando desligo "Ana Souza" (`POST /employees/:id/offboard` → `monthlySavingsCents = 27400`)
- Então  `potentialMonthlySavingsCents` passa a ser 127700 + 27400 = **155100**
  e TI cai para 8 licenças / 77700
