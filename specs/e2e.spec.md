# Spec — Testes e2e

Testes ponta a ponta contra o PostgreSQL de verdade (o do Docker), passando
por HTTP, `ValidationPipe`, controllers, services, transações e locks.
Automatizam os critérios `[pipe]` e `[manual]` das outras specs.

## Ambiente

- Banco **separado**: `licensehub_e2e` (ou `DB_NAME_E2E`). Os dados do seed no
  banco de desenvolvimento não são tocados.
- O MikroORM cria o banco se ele não existir; as **migrations** criam o schema
  (o mesmo caminho da produção).
- As tabelas são esvaziadas antes de cada teste: cada cenário é independente.
- A app de teste usa a mesma configuração da real (`configureApp`: mesmo
  `ValidationPipe`).
- Rodar: `docker compose up -d db` e `npm run test:e2e`.

## Cenários

| ID | Cenário | Cobre |
|---|---|---|
| E2E-01 | **Fluxo completo:** criar produto → criar colaborador → atribuir → desligar → a licença foi liberada (`seatsInUse` volta a 0, atribuição revogada com `OFFBOARDING`, detalhe sem licenças ativas) | RN01, RN04, LIC-AC01, EMP-AC05, EMP-AC11 |
| E2E-02 | **Validação de entrada:** 400 para corpo inválido, campo desconhecido, `status` `OFFBOARDED` no PATCH, `?active=` inválido e `:id` que não é UUID | PRD-AC03, EMP-AC03, EMP-AC09, LIC-AC08, LIC-AC09 |
| E2E-03 | **Atomicidade do desligamento:** se o `UPDATE` do colaborador falhar (trigger temporário), nenhuma licença é revogada | RN04, EMP-AC11 |
| E2E-04 | **Relatório ignora revogadas:** depois de revogar, a atribuição sai de `byDepartment` e a vaga vira ociosa | REP-AC05 |
| E2E-05 | **Última vaga disputada:** 20 colaboradores diferentes, 1 vaga, ao mesmo tempo → 1×201, 19×409, `1/1` | RN01, LIC-AC14 |
| E2E-06 | **Mesma atribuição em paralelo:** 10 requisições do mesmo par → 1×201, 9×409 | RN03, LIC-AC13 |
| E2E-07 | **Revogação em paralelo:** 10 revogações da mesma atribuição → 1×200, 9×409 | RN06, LIC-AC15 |
| E2E-08 | **Desligamento em paralelo:** 10 offboards → 1×200, 9×409; offboard junto com atribuições → nenhuma licença ativa sobra | RN04, RN05, EMP-AC15 |
| E2E-09 | **Redução de vagas vs. atribuições:** `PATCH totalSeats` junto com atribuições → `seatsInUse ≤ totalSeats` sempre | RN07, PRD-AC11 |
| E2E-10 | **Alerta em tempo real:** um cliente WebSocket conectado recebe `seats.threshold` quando uma atribuição leva o produto a 9/10 | RT-AC07 |
| E2E-11 | **RN09 em paralelo:** criações simultâneas do mesmo produto/e-mail e renomeações simultâneas para o mesmo nome → uma tem sucesso, as demais recebem 409 | RN09, PRD-AC12, PRD-AC13, EMP-AC16 |

Nos cenários de concorrência, a asserção principal é o **invariante** (ex.:
`seatsInUse ≤ totalSeats`, no máximo 1 sucesso), que vale qualquer que seja a
ordem em que o banco processa as requisições.
