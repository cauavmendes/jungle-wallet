# Arquitetura e decisões

Este documento registra as decisões técnicas, os trade-offs e as limitações conhecidas da solução.

## Stack e ambiente

- **Bun como runtime e test runner**: os scripts executam `src/main.ts` diretamente com o Bun, deixando o runtime explícito no `package.json`.
- **TypeScript em modo estrito completo**, sem exceções. DTOs de entrada usam a asserção `!` de forma localizada.
- **CommonJS em vez de ESM**: maior maturidade do ecossistema NestJS/MikroORM e menos risco de configuração no prazo do desafio.
- **MiniStack em vez de LocalStack**: desde março de 2026 o LocalStack exige token de autenticação, o que impediria o avaliador de subir o ambiente sem criar conta. O MiniStack é MIT, não exige conta e é compatível na porta 4566.
- **Versões de imagem fixas** (`postgres:17-alpine`, `ministackorg/ministack:1.5.27`), para que o ambiente seja reproduzível.
- As filas SQS são criadas por um script na fase _ready_ do MiniStack, depois que o servidor já está ouvindo. Na fase _boot_ o script rodaria antes da porta abrir. A DLQ é criada antes da fila principal, porque a política de redirecionamento (`RedrivePolicy`, com `maxReceiveCount` de 5) precisa do ARN dela.

## Dinheiro (`Money`)

- **Valor em centavos como `bigint`**, sem biblioteca decimal: o domínio só exige soma, subtração e comparação, com escala fixa de 2 casas. Inteiros dão exatidão total sem dependência externa.
- **Validação por expressão regular** na entrada (`^\d+(\.\d{1,2})?$`): rejeita `NaN`, `Infinity`, notação científica, texto vazio, negativos e mais de 2 casas.
- **`"25"` é aceito e normalizado para `"25.00"`**: o desafio proíbe mais de 2 casas, mas não menos.
- **`Money` pode ser negativo internamente** (necessário para a diferença da reconciliação e para o `negate`). Negativos são rejeitados no contrato de entrada (`Money.from`) e o saldo é protegido pela `Wallet` e pelo banco.
- **Moedas diferentes**: operações e `isLessThan` lançam `CurrencyMismatchError`; `equals` devolve `false`.
- Construtor privado: toda criação passa por `Money.fromCents`, então não existe `Money` inválido. `Money.from` interpreta o texto da API; `Money.fromCents` reconstrói valores vindos do banco.

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

## Persistência

- **MikroORM 7** para conexão, transações (`em.transactional`) e migrations versionadas e reversíveis (`db:migrate` e `db:rollback`).
- **SQL explícito nas operações críticas**, com parâmetros nomeados. Para correção financeira, cada comando enviado ao banco fica visível e revisável, em vez de gerado pelo ORM.
- **Migrations em SQL escrito à mão** e listadas explicitamente na configuração (`migrationsList`), com comportamento previsível no Bun e no build. O snapshot de schema está desativado, porque só serve para gerar migrations a partir de entidades.
- **Valores em centavos trafegam como texto** entre a aplicação e o banco: nenhum valor monetário passa por `number`.

## API HTTP

| Situação                              | Status | Exemplo de `code`                                             |
| ------------------------------------- | ------ | ------------------------------------------------------------- |
| Entrada com formato ou valor inválido | 400    | `INVALID_REQUEST`, `INVALID_MONEY_AMOUNT`, `INVALID_CURRENCY` |
| Recurso não encontrado                | 404    | `WALLET_NOT_FOUND`                                            |
| Conflito com o estado existente       | 409    | `WALLET_ALREADY_EXISTS`, `IDEMPOTENCY_CONFLICT`               |
| Regra de negócio recusada             | 422    | `INSUFFICIENT_FUNDS`, `WALLET_PLAYER_MISMATCH`                |
| Falha transitória, pode reenviar      | 503    | `CONCURRENT_WALLET_MODIFICATION`, `WALLET_LOCK_TIMEOUT`       |

Toda resposta de erro tem o formato `{ "error": { "code", "message" } }`. O `code` é estável e legível por máquina, para o provedor decidir se reenvia, corrige ou desiste sem interpretar texto.

## Concorrência

- **Unidade de concorrência: a carteira.** Cada processamento abre uma transação e executa `SELECT ... FROM wallets WHERE id = :walletId FOR UPDATE`, trancando só a linha daquela carteira. Operações na mesma carteira são serializadas; carteiras diferentes não se bloqueiam. Não existe lock global.
- **Lock pessimista em vez de otimista:** numa carteira muito disputada, o lock otimista geraria falhas e retries em cascata. O lock pessimista troca isso por uma espera curta, restrita à mesma carteira.
- **Verificação de versão como defesa extra:** o `UPDATE` do saldo inclui `WHERE version = :versaoEsperada`. Com o lock, a condição sempre é satisfeita; se algum dia não for, a transação inteira é desfeita (`CONCURRENT_WALLET_MODIFICATION`, 503) em vez de perder uma atualização.
- **O lock vive no banco**, então a garantia vale igualmente para uma ou várias instâncias da aplicação.
- **`lock_timeout` de 5 segundos:** se o lock da carteira não for obtido nesse prazo, a requisição falha com `WALLET_LOCK_TIMEOUT` (503) em vez de esperar indefinidamente, sinalizando ao provedor que pode reenviar.

## Idempotência

- **Verificação sempre depois do lock:** a busca pela idempotency key acontece com a carteira já trancada. Assim, a resposta "já existe?" não pode ficar desatualizada entre a verificação e a gravação (problema _check-then-act_).
- **`UNIQUE (idempotency_key)` como última defesa:** se uma duplicata escapar do lock (por exemplo, a mesma key enviada para carteiras diferentes), o banco recusa; a aplicação tenta uma única vez de novo e responde como replay ou conflito.
- **Hash do payload:** SHA-256 de um JSON canônico (chaves ordenadas em todos os níveis) com os campos de negócio: `providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money` e `referenceExternalTransactionId`. O cabeçalho e os metadados de transporte não entram. O valor entra normalizado (`"25"` e `"25.00"` geram o mesmo hash) e campos ausentes entram como `null`.
- **Mesma key e mesmo hash:** replay, com o resultado original, incluindo o saldo observado naquele momento (guardado em `balance_after_cents`).
- **Mesma key e hash diferente:** conflito (`IDEMPOTENCY_CONFLICT`, 409), nunca replay.
- **Status HTTP do processamento:** 201 para transação nova processada, 200 para replay e 422 para rejeição por regra de negócio. A rejeição é gravada e auditável, e o replay de uma rejeição devolve o mesmo 422.

## Mensageria

### Entrada: consumidor SQS com inbox

- **Mesmo caso de uso da API:** o consumidor da fila `wager-transactions.fifo` valida o `data` da mensagem com o mesmo parser da API e chama o mesmo `ProcessWagerTransactionUseCase`.
- **Inbox persistente:** cada mensagem é registrada em `inbox_messages` por `(consumer_name, message_id)`, na mesma transação SQL da alteração financeira, do ledger e da outbox. Mensagens já registradas são confirmadas sem abrir transação. A idempotency key continua como segunda defesa.
- **Ack somente após o commit:** a mensagem só é apagada da fila depois que o processamento terminou. Se o processo morrer entre o commit e o ack, a reentrega é reconhecida pela inbox e confirmada sem novo efeito.
- **Classificação de erros:**
  - **negócio** (rejeição gravada, carteira inexistente, jogador incorreto, conflito de idempotência): ack;
  - **transitório** (lock não obtido, modificação concorrente, erros de infraestrutura desconhecidos): a mensagem volta para a fila com visibilidade crescente (2 s, 4 s, 8 s... até 5 minutos), calculada a partir do `ApproximateReceiveCount`;
  - **permanente** (JSON inválido, mensagem fora do contrato, `kind` não suportado): enviada explicitamente para `wager-transactions-dlq.fifo` com o motivo no atributo `failureReason`, e apagada da fila principal.
- **Limite de tentativas:** mensagens com falha transitória persistente vão para a DLQ pela `RedrivePolicy` após 5 recebimentos.
- **Desligamento gracioso:** no `SIGTERM`, a mensagem em processamento é concluída; as já recebidas e ainda não iniciadas voltam imediatamente para a fila (visibilidade 0).

### Saída: Transactional Outbox

- **Eventos gravados na mesma transação:** os eventos de integração vão para `outbox_messages` junto com a aposta, o lançamento e o saldo. Ou tudo é confirmado junto, ou nada é; nenhum evento é publicado antes do commit.
- **Eventos:** classe abstrata `IntegrationEvent` com o envelope (`eventId`, `eventType`, `aggregateId`, `correlationId`, `causationId`, `occurredAt`, `version`, `data`) e uma subclasse por evento, com tipo e versão definidos na própria classe. `data` carrega `MoneyProps` (texto), nunca a instância de `Money`.
  - `WagerTransactionProcessed`: toda transação aplicada, inclusive `LOSS`.
  - `WagerTransactionRejected`: transação rejeitada por regra de negócio.
  - `WalletBalanceChanged`: só quando há lançamento no ledger, ou seja, quando o saldo muda.
- **Relay com `FOR UPDATE SKIP LOCKED`:** cada publicador pega um lote de eventos pendentes, trancando as linhas e pulando as que outro publicador já pegou. Vários publicadores dividem o trabalho sem esperar uns pelos outros.
- **Entrega at-least-once:** se um publicador enviar o evento e morrer antes de marcá-lo como publicado, outro o enviará de novo. O consumidor deduplica pelo `eventId`. A fila de eventos `wallet-events.fifo` usa `MessageGroupId` igual ao agregado (ordem por carteira ou transação) e `MessageDeduplicationId` igual ao `eventId`, como otimização.
- **Backoff exponencial:** falha na publicação mantém o evento pendente e agenda a próxima tentativa (1 s, 2 s, 4 s... até 5 minutos), registrada em `attempts` e `next_attempt_at`.
- **Desligamento gracioso:** no `SIGTERM`, o worker conclui o lote em andamento antes que a conexão com o banco seja fechada.

## Testes

- **Unitários** (`bun run test`): domínio puro, sem banco nem framework.
- **Integração** (`bun run test:integration`): contra PostgreSQL real, num banco dedicado (`wallet_test`), criado automaticamente na primeira inicialização do container. Os testes não interferem no banco de desenvolvimento nem nos workers da aplicação em execução.
- **Concorrência**, com paralelismo real: a mesma aposta 50 vezes em paralelo, duas apostas de 80,00 com saldo de 100,00, 20 apostas disputando a mesma carteira e carteiras distintas em paralelo. Todos verificam que o saldo guardado é igual ao saldo reconstruído pelo ledger e que os eventos da outbox são gravados exatamente uma vez.
- **Outbox:** dois relays concorrentes publicando cada evento exatamente uma vez, eventos deixados por um processo que morreu após o commit e nova tentativa agendada após falha de publicação.
- **Consumidor:** processamento e ack, reentrega após o commit sem novo débito, a mesma mensagem entregue 10 vezes em paralelo, rejeição de negócio confirmada e mensagens malformadas enviadas à DLQ. O handler é testado contra o banco real; a camada que conversa com o SQS foi validada manualmente com `bun run sqs:send`.

## Autenticação

Não implementada, conforme permitido pelo desafio (seção 2). Desenho adotado: Keycloak como Identity Provider, com client credentials por provedor; o `providerId` da requisição seria validado contra a identidade do token. O ponto de extensão no código é um `AuthGuard`.

## Limitações conhecidas

_A definir ao final._
