# Spec — Employees

Cadastro de colaboradores, mudança de status (férias/afastamento) e
desligamento com liberação automática das licenças.

Regras aplicadas: **RN02** (indireta), **RN04**, **RN05**, **RN08**, **RN09**, **RN10**.

## Modelo

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| name | string | obrigatório |
| email | string | obrigatório, único, formato de e-mail |
| department | string | obrigatório |
| status | enum `EmployeeStatus` | `ACTIVE` \| `ON_LEAVE` \| `OFFBOARDED`; padrão `ACTIVE` |
| offboardedAt | timestamptz \| null | preenchido no desligamento |
| createdAt / updatedAt | timestamptz | automáticos |

### Transições de status

```
ACTIVE  ⇄  ON_LEAVE        via PATCH /employees/:id/status
ACTIVE   → OFFBOARDED      via POST  /employees/:id/offboard
ON_LEAVE → OFFBOARDED      via POST  /employees/:id/offboard
OFFBOARDED → (nada)        estado final
```

## Endpoints

| Método | Rota | Corpo / Query | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/employees` | `CreateEmployeeDto` | 201 `EmployeeResponse` | 400, 409 |
| GET | `/employees` | `?status=` `?department=` (opcionais, combináveis) | 200 `EmployeeResponse[]` | 400 |
| GET | `/employees/:id` | — | 200 `EmployeeDetailResponse` | 400, 404 |
| PATCH | `/employees/:id/status` | `UpdateEmployeeStatusDto` | 200 `EmployeeResponse` | 400, 404, 409 |
| POST | `/employees/:id/offboard` | — | 200 `OffboardResponse` | 400, 404, 409 |

`CreateEmployeeDto`
```json
{ "name": "Ana Souza", "email": "ana.souza@empresa.com", "department": "TI" }
```

`UpdateEmployeeStatusDto` — `status` aceita **apenas** `ACTIVE` ou `ON_LEAVE`.
```json
{ "status": "ON_LEAVE" }
```

`EmployeeResponse`
```json
{
  "id": "…", "name": "Ana Souza", "email": "ana.souza@empresa.com", "department": "TI",
  "status": "ACTIVE", "offboardedAt": null,
  "createdAt": "2026-10-02T12:00:00.000Z", "updatedAt": "2026-10-02T12:00:00.000Z"
}
```

`EmployeeDetailResponse` = `EmployeeResponse` + licenças **ativas**:
```json
{
  "…": "campos do EmployeeResponse",
  "activeLicenses": [
    { "assignmentId": "…", "productId": "…", "productName": "Slack Pro", "assignedAt": "…" }
  ]
}
```

`OffboardResponse`
```json
{ "employeeId": "…", "status": "OFFBOARDED", "revokedLicenses": 3, "monthlySavingsCents": 27400 }
```
`monthlySavingsCents` = soma do `monthlyCostCents` dos produtos das atribuições revogadas.

## Mensagens de erro

| Situação | Status | Mensagem |
|---|---|---|
| E-mail duplicado | 409 | `Employee with email 'ana.souza@empresa.com' already exists` |
| Colaborador inexistente | 404 | `Employee '<id>' not found` |
| Já desligado (offboard) | 409 | `Employee 'Ana Souza' is already offboarded` |
| Mudar status de desligado | 409 | `Employee 'Ana Souza' is offboarded and cannot change status` |

## Critérios de aceite

### EMP-AC01 — cria colaborador ativo                        [unit]
- Dado   que não existe colaborador com o e-mail informado
- Quando faço `POST /employees` com dados válidos
- Então  recebo 201 com `status = ACTIVE` e `offboardedAt = null`

### EMP-AC02 — rejeita e-mail duplicado                      [unit] RN09
- Dado   que já existe um colaborador com `ana.souza@empresa.com`
- Quando faço `POST /employees` com o mesmo e-mail
- Então  recebo 409 com `Employee with email 'ana.souza@empresa.com' already exists`

### EMP-AC03 — valida a entrada                              [pipe]
- Quando faço `POST /employees` com e-mail inválido, campo faltando, campo desconhecido
  ou enviando `status` no corpo
- Então  recebo 400

### EMP-AC04 — lista com filtros                             [unit]
- Dado   colaboradores de TI, RH e Financeiro com status variados
- Quando faço `GET /employees?status=ACTIVE&department=TI`
- Então  recebo só os colaboradores ativos de TI
- E      sem filtros, recebo todos; `?status=` com valor fora do enum retorna 400 [pipe]

### EMP-AC05 — detalha com licenças ativas                   [unit] *(etapa 5)*
- Dado   um colaborador com 2 atribuições ativas e 1 revogada
- Quando faço `GET /employees/:id`
- Então  `activeLicenses` contém só as 2 ativas, com `productName`

### EMP-AC06 — colaborador inexistente                       [unit] RN10
- Quando chamo `GET /employees/:id`, `PATCH /employees/:id/status` ou
  `POST /employees/:id/offboard` com id que não existe
- Então  recebo 404 com `Employee '<id>' not found`

### EMP-AC07 — coloca em férias sem perder licenças          [unit] RN08 *(status: etapa 4; "nenhuma revogada": etapa 6)*
- Dado   um colaborador `ACTIVE` com 2 licenças ativas
- Quando faço `PATCH /employees/:id/status` com `{ "status": "ON_LEAVE" }`
- Então  recebo 200 com `status = ON_LEAVE`
- E      nenhuma atribuição é revogada

### EMP-AC08 — volta de férias                               [unit]
- Dado   um colaborador `ON_LEAVE`
- Quando faço `PATCH /employees/:id/status` com `{ "status": "ACTIVE" }`
- Então  recebo 200 com `status = ACTIVE`

### EMP-AC09 — PATCH status não aceita OFFBOARDED            [pipe]
- Quando faço `PATCH /employees/:id/status` com `{ "status": "OFFBOARDED" }`
- Então  recebo 400 (para desligar existe `POST /employees/:id/offboard`)

### EMP-AC10 — desligado não muda de status                  [unit]
- Dado   um colaborador `OFFBOARDED`
- Quando faço `PATCH /employees/:id/status` com qualquer valor
- Então  recebo 409 com `Employee 'Ana Souza' is offboarded and cannot change status`

### EMP-AC11 — desligamento revoga todas as licenças         [unit] RN04 *(etapa 6)*
- Dado   "Ana Souza" `ACTIVE` com licenças ativas de M365 (18900), Slack Pro (4500)
  e Jira Software (4000)
- Quando faço `POST /employees/:id/offboard`
- Então  recebo 200 com `{ "status": "OFFBOARDED", "revokedLicenses": 3, "monthlySavingsCents": 27400 }`
- E      `offboardedAt` é preenchido com a data atual
- E      as 3 atribuições ficam com `revokedAt` preenchido e `revokeReason = OFFBOARDING`
- E      tudo acontece dentro de **uma única transação** (`em.transactional`):
  se algo falhar, nem o status nem as atribuições mudam

### EMP-AC12 — desligamento sem licenças                     [unit] RN04 *(etapa 6)*
- Dado   um colaborador sem licenças ativas
- Quando faço `POST /employees/:id/offboard`
- Então  recebo 200 com `revokedLicenses = 0` e `monthlySavingsCents = 0`

### EMP-AC13 — desligamento de quem está de férias           [unit] RN04 *(etapa 6)*
- Dado   um colaborador `ON_LEAVE` com licenças ativas
- Quando faço `POST /employees/:id/offboard`
- Então  o desligamento acontece normalmente e as licenças são revogadas

### EMP-AC15 — desligamento e atribuição simultâneos          [unit] [manual] RN02 RN04 *(etapa 6)*
- Dado   um colaborador `ACTIVE`
- Quando um `POST /employees/:id/offboard` e um `POST /licenses` para ele chegam ao mesmo tempo
  (ou dois offboards ao mesmo tempo)
- Então  ele nunca termina `OFFBOARDED` com licença ativa, e só um offboard tem sucesso
  (o outro recebe 409 da RN05)
- Como   o offboarding lê o colaborador com `FOR UPDATE`; a atribuição também
  (LIC-AC14). Quem chegar depois espera e lê o status já atualizado

### EMP-AC14 — não desliga duas vezes                        [unit] RN05 *(etapa 6)*
- Dado   um colaborador `OFFBOARDED`
- Quando faço `POST /employees/:id/offboard`
- Então  recebo 409 com `Employee 'Ana Souza' is already offboarded` e nada é alterado
