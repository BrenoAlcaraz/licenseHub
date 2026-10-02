# Spec — Licenses

Atribuição e revogação de licenças. A tabela de atribuições **é o histórico**:
nada é apagado, revogar = preencher `revokedAt`.

Regras aplicadas: **RN01**, **RN02**, **RN03**, **RN06**, **RN08**, **RN10**.

## Modelo — LicenseAssignment

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| product | ManyToOne → Product | obrigatório |
| employee | ManyToOne → Employee | obrigatório |
| assignedAt | timestamptz | automático |
| revokedAt | timestamptz \| null | preenchido na revogação |
| revokeReason | enum `RevokeReason` \| null | `MANUAL` \| `OFFBOARDING` |

Uma atribuição está **ativa** quando `revokedAt IS NULL`.

**Reforço da RN03 no banco:** índice único parcial
`UNIQUE (product_id, employee_id) WHERE revoked_at IS NULL`. O service continua
checando antes (para devolver uma mensagem clara), mas o índice garante a regra
mesmo com duas requisições simultâneas. Se o índice for violado, a API responde
409 com a mesma mensagem da LIC-AC05.

## Endpoints

| Método | Rota | Corpo / Query | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/licenses` | `AssignLicenseDto` | 201 `LicenseResponse` | 400, 404, 409 |
| GET | `/licenses` | `?productId=` `?employeeId=` `?active=true\|false` (opcionais, combináveis) | 200 `LicenseResponse[]` | 400 |
| POST | `/licenses/:id/revoke` | — | 200 `LicenseResponse` | 400, 404, 409 |

`AssignLicenseDto`
```json
{ "productId": "…", "employeeId": "…" }
```

`LicenseResponse`
```json
{
  "id": "…",
  "productId": "…", "productName": "Slack Pro",
  "employeeId": "…", "employeeName": "Ana Souza",
  "assignedAt": "2026-10-02T12:00:00.000Z",
  "revokedAt": null, "revokeReason": null
}
```

## Ordem das verificações ao atribuir

O service checa nesta ordem e para no primeiro erro (guard clauses):

1. produto existe → senão **404** (RN10)
2. colaborador existe → senão **404** (RN10)
3. colaborador está `ACTIVE` → senão **409** (RN02 / RN08)
4. colaborador não tem atribuição ativa desse produto → senão **409** (RN03)
5. produto tem vaga (`seatsInUse < totalSeats`) → senão **409** (RN01)

## Mensagens de erro

| Situação | Status | Mensagem |
|---|---|---|
| Produto inexistente | 404 | `Product '<id>' not found` |
| Colaborador inexistente | 404 | `Employee '<id>' not found` |
| Atribuição inexistente | 404 | `License assignment '<id>' not found` |
| Colaborador não ativo | 409 | `Employee 'Fábio Lima' is ON_LEAVE; only ACTIVE employees can receive licenses` |
| Licença ativa repetida | 409 | `Employee 'Ana Souza' already has an active 'Slack Pro' license` |
| Sem vagas | 409 | `Product 'Slack Pro' has no available seats (5/5 in use)` |
| Já revogada | 409 | `License assignment '<id>' is already revoked` |

## Critérios de aceite

### LIC-AC01 — atribui licença                               [unit]
- Dado   "Slack Pro" com 4/5 vagas em uso e "Ana Souza" `ACTIVE` sem licença dele
- Quando faço `POST /licenses`
- Então  recebo 201 com `assignedAt` preenchido, `revokedAt = null` e `revokeReason = null`

### LIC-AC02 — produto inexistente                           [unit] RN10
- Quando faço `POST /licenses` com `productId` que não existe
- Então  recebo 404 com `Product '<id>' not found`

### LIC-AC03 — colaborador inexistente                       [unit] RN10
- Quando faço `POST /licenses` com `employeeId` que não existe
- Então  recebo 404 com `Employee '<id>' not found`

### LIC-AC04 — colaborador não ativo                         [unit] RN02 RN08
- Dado   um colaborador `ON_LEAVE` (e, em outro caso, `OFFBOARDED`)
- Quando faço `POST /licenses` para ele
- Então  recebo 409 com `Employee '<name>' is <STATUS>; only ACTIVE employees can receive licenses`

### LIC-AC05 — licença ativa repetida                        [unit] RN03
- Dado   "Ana Souza" com atribuição ativa de "Slack Pro"
- Quando faço `POST /licenses` com o mesmo par produto/colaborador
- Então  recebo 409 com `Employee 'Ana Souza' already has an active 'Slack Pro' license`

### LIC-AC13 — duplicata concorrente barrada pelo índice     [unit] RN03
- Dado   duas requisições simultâneas atribuindo o mesmo produto ao mesmo colaborador
- Quando as duas passam pela checagem do service e a segunda grava no banco
- Então  o índice único parcial rejeita a segunda e a API responde 409 com a
  mesma mensagem da LIC-AC05 (não 500)

### LIC-AC06 — pode receber de novo depois de revogada       [unit] RN03
- Dado   "Ana Souza" com uma atribuição **revogada** de "Slack Pro" e vaga disponível
- Quando faço `POST /licenses` com o mesmo par
- Então  recebo 201 (só atribuições **ativas** contam para a RN03)

### LIC-AC07 — produto sem vagas                             [unit] RN01
- Dado   "Slack Pro" com 5/5 vagas em uso
- Quando faço `POST /licenses` para um colaborador `ACTIVE` sem essa licença
- Então  recebo 409 com `Product 'Slack Pro' has no available seats (5/5 in use)`
  e nenhuma atribuição é criada

### LIC-AC08 — valida a entrada                              [pipe]
- Quando faço `POST /licenses` sem `productId`, com id que não é UUID ou com campo extra
- Então  recebo 400

### LIC-AC09 — lista com filtros                             [unit]
- Dado   atribuições ativas e revogadas de vários produtos e colaboradores
- Quando faço `GET /licenses?productId=<slack>&active=true`
- Então  recebo só as atribuições ativas do Slack Pro
- E      `?active=false` retorna só as revogadas; sem filtros, retorna todas
- E      `?active=` com valor diferente de `true`/`false` retorna 400 [pipe]

### LIC-AC10 — revoga manualmente                            [unit]
- Dado   uma atribuição ativa
- Quando faço `POST /licenses/:id/revoke`
- Então  recebo 200 com `revokedAt` preenchido e `revokeReason = MANUAL`
- E      a vaga volta a ficar disponível no produto

### LIC-AC11 — não revoga duas vezes                         [unit] RN06
- Dado   uma atribuição já revogada
- Quando faço `POST /licenses/:id/revoke`
- Então  recebo 409 com `License assignment '<id>' is already revoked`
  e `revokedAt`/`revokeReason` originais são mantidos

### LIC-AC12 — atribuição inexistente                        [unit] RN10
- Quando faço `POST /licenses/:id/revoke` com id que não existe
- Então  recebo 404 com `License assignment '<id>' not found`
