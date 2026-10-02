# Specs — LicenseHub

Esta pasta é a **fonte da verdade** do comportamento da API. O projeto segue
Spec Driven Development: nada é implementado sem estar descrito aqui antes.

## Fluxo de trabalho

1. **Spec** — o comportamento é descrito neste diretório e revisado.
2. **Red** — cada critério de aceite marcado como `[unit]` vira um `it()` no
   `*.service.spec.ts` do módulo. O teste é escrito antes do código e falha.
3. **Green** — entidade, migration, DTOs, service e controller são
   implementados até os testes passarem.
4. **Refactor** — limpeza com os testes verdes (`npm run test` + `npm run lint`).

## Convenção de IDs

Cada critério de aceite tem um ID `<MÓDULO>-AC<NN>`:

| Prefixo | Módulo | Arquivo |
|---|---|---|
| `PRD` | Products | [products.spec.md](products.spec.md) |
| `EMP` | Employees | [employees.spec.md](employees.spec.md) |
| `LIC` | Licenses | [licenses.spec.md](licenses.spec.md) |
| `REP` | Reports | [reports.spec.md](reports.spec.md) |

O nome do teste cita o ID do critério e a regra de negócio, por exemplo:

```ts
it('LIC-AC05 (RN03) rejects a second active assignment of the same product', ...)
```

Assim, um `grep` pelo ID encontra a spec e o teste que a garante.

## Como o critério é verificado

| Marcação | Onde é verificado |
|---|---|
| `[unit]` | Teste unitário do service (Jest, `EntityManager` mockado) — obrigatório |
| `[pipe]` | `ValidationPipe` global + decorators do DTO (verificado no Swagger/e2e) |
| `[manual]` | Conferido manualmente contra o banco com o seed (Swagger ou `curl`) |

## Formato dos critérios

```
### XXX-AC01 — título curto            [unit] RN0x
- Dado   <estado inicial>
- Quando <ação>
- Então  <resultado observável: status HTTP, corpo, efeito no banco>
```

## Regras transversais

- IDs são UUID; um `:id` que não é UUID válido retorna **400** (`ParseUUIDPipe`).
- Dinheiro sempre em **centavos inteiros**; datas em UTC (ISO 8601).
- Mensagens de erro em inglês, no corpo padrão do Nest:
  `{ "statusCode": 409, "message": "...", "error": "Conflict" }`.
