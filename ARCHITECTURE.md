# Arquitetura e decisões

Este documento registra as decisões técnicas, os trade-offs e as limitações conhecidas da solução.

## Stack e ambiente

- **Bun como runtime e test runner**: os scripts executam `src/main.ts` diretamente com o Bun, deixando o runtime explícito no `package.json`.
- **TypeScript em modo estrito completo**, sem exceções. DTOs de entrada usam a asserção `!` de forma localizada.
- **CommonJS em vez de ESM**: maior maturidade do ecossistema NestJS/MikroORM e menos risco de configuração no prazo do desafio.
- **MiniStack em vez de LocalStack**: desde março de 2026 o LocalStack exige token de autenticação, o que impediria o avaliador de subir o ambiente sem criar conta. O MiniStack é MIT, não exige conta e é compatível na porta 4566.
- **Versões de imagem fixas** (`postgres:17-alpine`, `ministackorg/ministack:1.5.27`), para que o ambiente seja reproduzível.
- As filas SQS são criadas por um script na fase _ready_ do MiniStack, depois que o servidor já está ouvindo. Na fase _boot_ o script rodaria antes da porta abrir.

## Dinheiro (`Money`)

- **Valor em centavos como `bigint`**, sem biblioteca decimal: o domínio só exige soma, subtração e comparação, com escala fixa de 2 casas. Inteiros dão exatidão total sem dependência externa.
- **Validação por expressão regular** na entrada (`^\d+(\.\d{1,2})?$`): rejeita `NaN`, `Infinity`, notação científica, texto vazio, negativos e mais de 2 casas.
- **`"25"` é aceito e normalizado para `"25.00"`**: o desafio proíbe mais de 2 casas, mas não menos.
- **`Money` pode ser negativo internamente** (necessário para a diferença da reconciliação e para o `negate`). Negativos são rejeitados no contrato de entrada (`Money.from`) e o saldo é protegido pela `Wallet` e pelo banco.
- **Moedas diferentes**: operações e `isLessThan` lançam `CurrencyMismatchError`; `equals` devolve `false`.
- Construtor privado: a única entrada é `Money.from`, então não existe `Money` inválido.

## Garantias no banco de dados

| Regra                                            | Mecanismo                                                     |
| ------------------------------------------------ | ------------------------------------------------------------- |
| Uma wallet por jogador e moeda                   | `UNIQUE (player_id, currency)`                                |
| Saldo nunca negativo                             | `CHECK (balance_cents >= 0)`                                  |
| Idempotência persistente                         | `UNIQUE (idempotency_key)`                                    |
| Uma transação por provedor                       | `UNIQUE (provider_id, external_transaction_id)`               |
| Transação na wallet, jogador e moeda corretos    | chave estrangeira composta `(wallet_id, player_id, currency)` |
| `REFUND`/`ROLLBACK` exigem referência            | `CHECK`                                                       |
| Rejeição sempre com motivo                       | `CHECK` entre `status` e `failure_code`                       |
| Reversão única por tipo                          | índice único parcial                                          |
| No máximo um lançamento por transação por wallet | `UNIQUE (transaction_id, wallet_id)`                          |
| Lançamento com aritmética correta                | `CHECK (balance_before ± amount = balance_after)`             |
| Ledger imutável                                  | triggers que recusam `UPDATE`, `DELETE` e `TRUNCATE`          |
| Deduplicação de mensagens                        | chave primária `(consumer_name, message_id)` no inbox         |

## Concorrência

_A definir._

## Idempotência

_A definir._

## Mensageria (inbox e outbox)

_A definir._

## Autenticação

Não implementada, conforme permitido pelo desafio (seção 2). Desenho adotado: Keycloak como Identity Provider, com client credentials por provedor; o `providerId` da requisição seria validado contra a identidade do token. O ponto de extensão no código é um `AuthGuard`.

## Limitações conhecidas

_A definir ao final._
