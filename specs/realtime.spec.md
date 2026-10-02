# Spec — Alerta em tempo real (WebSocket)

Avisar o TI, na hora, quando um produto está quase lotado, antes de alguém
receber um 409 por falta de vagas.

## Canal

- **Socket.IO** no mesmo servidor e porta da API (`http://localhost:3000`),
  namespace padrão (`/`).
- Gateway do NestJS: `SeatsThresholdGateway` (módulo `licenses`).
- Sem autenticação (fora do escopo, como no resto da API).

## Evento `seats.threshold`

Emitido para **todos os clientes conectados** quando, **após uma atribuição**,
o produto fica com **90% ou mais** das vagas em uso.

```json
{ "productId": "…", "productName": "Microsoft 365 E3", "seatsInUse": 9, "totalSeats": 10 }
```

- `seatsInUse` já inclui a atribuição que acabou de ser feita.
- O limite é comparado com **inteiros** (`seatsInUse × 100 ≥ totalSeats × 90`),
  não com `float`. Com 90% o `float` por acaso funciona, mas para outros
  percentuais não: com 7%, `100 × 0.07` dá `7.000000000000001` e exatamente
  7/100 não dispararia (11 percentuais entre 1% e 99% têm esse problema). Com
  inteiros, o limite pode mudar sem risco.
- É emitido **depois do commit** da transação: nunca avisa sobre uma atribuição
  que acabou não sendo salva.
- Só atribuições disparam o evento (revogar, desligar ou mudar `totalSeats`, não).

## Critérios de aceite

### RT-AC01 — avisa ao atingir 90%                            [unit]
- Dado   um produto com `totalSeats = 10` e 8 em uso
- Quando faço uma atribuição com sucesso (9/10)
- Então  o evento `seats.threshold` é emitido com `seatsInUse = 9` e `totalSeats = 10`

### RT-AC02 — não avisa abaixo de 90%                         [unit]
- Dado   um produto com `totalSeats = 10` e 7 em uso
- Quando faço uma atribuição com sucesso (8/10)
- Então  nenhum evento é emitido

### RT-AC03 — continua avisando acima de 90%                  [unit]
- Dado   um produto com `totalSeats = 10` e 9 em uso
- Quando faço a atribuição da última vaga (10/10)
- Então  o evento é emitido com `seatsInUse = 10`

### RT-AC04 — exatamente no limite                            [unit]
- Dado   um produto com `totalSeats = 70` e 62 em uso
- Quando faço uma atribuição (63/70 = exatamente 90%)
- Então  o evento é emitido (o limite é inclusivo: "90% **ou mais**")

### RT-AC05 — atribuição recusada não avisa                   [unit]
- Quando uma atribuição falha (404, 409 de qualquer regra)
- Então  nenhum evento é emitido

### RT-AC06 — só depois do commit                             [unit]
- Quando uma atribuição atinge o limite
- Então  o evento é emitido **depois** de a transação terminar, não dentro dela

### RT-AC07 — cliente conectado recebe o evento               [e2e] (E2E-10)
- Dado   um cliente Socket.IO conectado em `ws://localhost:<porta>/socket.io/`
- Quando uma atribuição via `POST /licenses` leva o produto a 9/10
- Então  o cliente recebe `seats.threshold` com o payload acima
