# Spec — Products

Cadastro dos produtos de software (licenças compradas) e cálculo de quantas
vagas estão em uso.

Regras aplicadas: **RN07**, **RN09**, **RN10**.

## Modelo

| Campo | Tipo | Regras |
|---|---|---|
| id | uuid | PK |
| name | string | obrigatório, único |
| vendor | string | obrigatório |
| monthlyCostCents | integer | obrigatório, ≥ 0 |
| totalSeats | integer | obrigatório, ≥ 1 |
| createdAt / updatedAt | timestamptz | automáticos |

Campos calculados (não ficam no banco):

- `seatsInUse` = número de atribuições **ativas** (`revokedAt IS NULL`) do produto
- `seatsAvailable` = `totalSeats − seatsInUse`

## Endpoints

| Método | Rota | Corpo | Sucesso | Erros |
|---|---|---|---|---|
| POST | `/products` | `CreateProductDto` | 201 `ProductResponse` | 400, 409 |
| GET | `/products` | — | 200 `ProductResponse[]` | — |
| GET | `/products/:id` | — | 200 `ProductResponse` | 400, 404 |
| PATCH | `/products/:id` | `UpdateProductDto` | 200 `ProductResponse` | 400, 404, 409 |

`CreateProductDto`
```json
{ "name": "Microsoft 365 E3", "vendor": "Microsoft", "monthlyCostCents": 18900, "totalSeats": 10 }
```

`UpdateProductDto` — os mesmos campos, todos opcionais.

`ProductResponse`
```json
{
  "id": "…", "name": "Microsoft 365 E3", "vendor": "Microsoft",
  "monthlyCostCents": 18900, "totalSeats": 10,
  "seatsInUse": 7, "seatsAvailable": 3
}
```

## Mensagens de erro

| Situação | Status | Mensagem |
|---|---|---|
| Nome duplicado | 409 | `Product 'Microsoft 365 E3' already exists` |
| Produto inexistente | 404 | `Product '<id>' not found` |
| Reduzir abaixo do uso | 409 | `Cannot reduce totalSeats of 'Microsoft 365 E3' to 5: 7 seats in use` |

## Critérios de aceite

### PRD-AC01 — cria produto                                  [unit]
- Dado   que não existe produto com o nome "Microsoft 365 E3"
- Quando faço `POST /products` com dados válidos
- Então  recebo 201 com o produto criado, `seatsInUse = 0` e `seatsAvailable = totalSeats`

### PRD-AC02 — rejeita nome duplicado                        [unit] RN09
- Dado   que já existe o produto "Microsoft 365 E3"
- Quando faço `POST /products` com o mesmo `name`
- Então  recebo 409 com `Product 'Microsoft 365 E3' already exists` e nada é gravado

### PRD-AC03 — valida a entrada                              [pipe]
- Quando faço `POST /products` sem `name`, com `monthlyCostCents < 0`,
  com `totalSeats < 1`, com valores não inteiros ou com campos desconhecidos
- Então  recebo 400 com a lista de erros de validação

### PRD-AC04 — lista com vagas calculadas                    [unit]
- Dado   o produto "Microsoft 365 E3" com `totalSeats = 10`, 7 atribuições ativas e 2 revogadas
- Quando faço `GET /products`
- Então  o item desse produto tem `seatsInUse = 7` e `seatsAvailable = 3`
  (atribuições revogadas não contam)

### PRD-AC05 — detalha produto                               [unit]
- Dado   um produto existente
- Quando faço `GET /products/:id`
- Então  recebo 200 com o `ProductResponse` (incluindo `seatsInUse` e `seatsAvailable`)

### PRD-AC06 — produto inexistente                           [unit] RN10
- Quando faço `GET /products/:id` ou `PATCH /products/:id` com um id que não existe
- Então  recebo 404 com `Product '<id>' not found`

### PRD-AC07 — atualiza campos                               [unit]
- Dado   um produto existente
- Quando faço `PATCH /products/:id` com `{ "monthlyCostCents": 19900 }`
- Então  recebo 200 com o valor novo e os outros campos inalterados

### PRD-AC08 — rejeita renomear para nome já usado           [unit] RN09
- Dado   os produtos "Slack Pro" e "Jira Software"
- Quando faço `PATCH` em "Jira Software" com `{ "name": "Slack Pro" }`
- Então  recebo 409 com `Product 'Slack Pro' already exists`
- E      manter o próprio nome (`PATCH` com o nome atual) **não** é conflito

### PRD-AC09 — não reduz totalSeats abaixo do uso            [unit] RN07  *(etapa 7)*
- Dado   "Microsoft 365 E3" com 7 vagas em uso
- Quando faço `PATCH` com `{ "totalSeats": 5 }`
- Então  recebo 409 com `Cannot reduce totalSeats of 'Microsoft 365 E3' to 5: 7 seats in use`
  e o produto não é alterado

### PRD-AC10 — pode reduzir até exatamente o uso             [unit] RN07  *(etapa 7)*
- Dado   "Microsoft 365 E3" com 7 vagas em uso
- Quando faço `PATCH` com `{ "totalSeats": 7 }`
- Então  recebo 200 com `seatsAvailable = 0`
