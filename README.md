# Jungle Wallet

Processador distribuído de transações de apostas: carteiras com saldo, ledger imutável, idempotência, concorrência segura entre várias instâncias e mensageria com inbox, outbox e DLQ.

As decisões técnicas, os trade-offs e as limitações estão em [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack

|                  |                                                   |
| ---------------- | ------------------------------------------------- |
| Runtime e testes | Bun 1.4.3                                         |
| Framework        | NestJS 12, TypeScript em modo estrito             |
| Banco            | PostgreSQL 17                                     |
| Persistência     | MikroORM 7 (SQL explícito nas operações críticas) |
| Mensageria       | SQS, emulado localmente pelo MiniStack 1.5.27     |
| Métricas         | Prometheus (`prom-client`)                        |

## Requisitos

- [Docker](https://www.docker.com/) com Docker Compose
- [Bun](https://bun.sh/) 1.4.3 ou superior

Nenhuma conta ou token é necessário: o MiniStack substitui o LocalStack, que passou a exigir autenticação.

## Como rodar

```bash
bun install
docker compose up -d
bun run db:migrate
bun run start:dev
```

A aplicação sobe em `http://localhost:3000`. O `docker compose up -d` cria:

- o PostgreSQL, com os bancos `wallet` (desenvolvimento) e `wallet_test` (testes de integração);
- o MiniStack, com as filas `wager-transactions.fifo`, `wager-transactions-dlq.fifo` e `wallet-events.fifo`.

Para conferir: `GET http://localhost:3000/health/ready` deve responder `200`.

## Testes

```bash
bun run test               # unitários: domínio puro, sem banco
bun run test:integration   # integração: PostgreSQL real, com o Docker no ar
```

Os testes de integração usam o banco `wallet_test` e não interferem na aplicação em execução. Incluem os cenários obrigatórios de concorrência: a mesma aposta em paralelo, duas apostas de 80,00 com saldo de 100,00, publicadores concorrentes da outbox, três instâncias da aplicação ao mesmo tempo e um worker que morre depois do commit e antes do ack.

Outras verificações:

```bash
bun run typecheck   # tipos, incluindo a pasta test
bun run lint
bun run build
```

## API

| Método | Rota                                                                  | Descrição                                                            |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `POST` | `/wallets`                                                            | Cria uma carteira com saldo inicial                                  |
| `GET`  | `/wallets/:walletId`                                                  | Consulta saldo e versão                                              |
| `GET`  | `/wallets/:walletId/ledger?cursor=&limit=`                            | Lançamentos do ledger, paginados por cursor (padrão 50, máximo 100)  |
| `POST` | `/wallets/:walletId/reconciliation`                                   | Compara o saldo guardado com o saldo reconstruído pelo ledger        |
| `POST` | `/wagering/transactions`                                              | Processa `BET`, `WIN` ou `LOSS`; exige o cabeçalho `Idempotency-Key` |
| `GET`  | `/wagering/transactions/:transactionId`                               | Consulta uma transação pelo id interno                               |
| `GET`  | `/providers/:providerId/wagering/transactions/:externalTransactionId` | Consulta uma transação pelo id do provedor                           |
| `GET`  | `/health/live`                                                        | O processo está de pé                                                |
| `GET`  | `/health/ready`                                                       | PostgreSQL e SQS alcançáveis                                         |
| `GET`  | `/metrics`                                                            | Métricas no formato Prometheus                                       |

Valores monetários trafegam sempre como texto com duas casas decimais: `{ "amount": "25.00", "currency": "BRL" }`.

Respostas do processamento: `201` para transação nova, `200` para replay idempotente, `422` para rejeição de negócio (por exemplo, saldo insuficiente), `409` para a mesma idempotency key com conteúdo diferente e `503` para falhas transitórias. Erros seguem o formato `{ "error": { "code", "message" } }`.

### Exemplos

A pasta [`http/`](http) tem requisições prontas para a extensão [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) do VS Code. Crie uma carteira com a primeira requisição de `http/wallets.http` e use o `id` devolvido em `http/wagering.http`.

Com `curl`:

```bash
curl -X POST http://localhost:3000/wallets \
  -H "Content-Type: application/json" \
  -d '{"playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1","initialBalance":{"amount":"100.00","currency":"BRL"}}'

curl -X POST http://localhost:3000/wagering/transactions \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: provider-a:bet-1" \
  -d '{"providerId":"provider-a","externalTransactionId":"bet-1","playerId":"0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1","walletId":"<id da carteira>","roundId":"round-1","gameId":"game-1","kind":"BET","money":{"amount":"25.00","currency":"BRL"}}'
```

### Pela fila SQS

Com a aplicação rodando, o script `sqs:send` publica uma mensagem na fila de entrada:

```bash
bun run sqs:send <walletId> <playerId> [amount] [kind] [messageId]

bun run sqs:send <walletId> <playerId> 25.00                  # processa uma aposta
bun run sqs:send <walletId> <playerId> 25.00 BET msg-dup-1    # enviada duas vezes, gera um único débito
bun run sqs:send <walletId> <playerId> 10.00 OPENING          # fora do contrato: vai para a DLQ
```

Para ler os eventos publicados pela outbox:

```bash
docker compose exec ministack aws --endpoint-url http://localhost:4566 --region us-east-1 \
  sqs receive-message --queue-url http://localhost:4566/000000000000/wallet-events.fifo
```

## Configuração

Todas as variáveis têm valores padrão para o ambiente local.

| Variável                                      | Padrão                                             | Descrição                                 |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| `PORT`                                        | `3000`                                             | Porta HTTP                                |
| `DATABASE_URL`                                | `postgresql://wallet:wallet@localhost:5432/wallet` | Conexão com o PostgreSQL                  |
| `SQS_ENDPOINT`                                | `http://localhost:4566`                            | Endpoint do SQS                           |
| `AWS_REGION`                                  | `us-east-1`                                        | Região                                    |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `test`                                             | Credenciais (fictícias no ambiente local) |
| `WAGER_QUEUE_URL`                             | fila `wager-transactions.fifo` local               | Fila de entrada                           |
| `WAGER_DLQ_URL`                               | fila `wager-transactions-dlq.fifo` local           | Dead letter queue                         |
| `EVENTS_QUEUE_URL`                            | fila `wallet-events.fifo` local                    | Fila dos eventos publicados               |
| `SQS_CONSUMER_ENABLED`                        | `true`                                             | `false` desliga o consumidor da fila      |
| `OUTBOX_WORKER_ENABLED`                       | `true`                                             | `false` desliga a publicação da outbox    |

## Estrutura

```
src/
  shared/      Money, erros de domínio, eventos de integração, logger, cliente SQS
  wallet/      carteira, ledger, reconciliação
  wagering/    processamento de apostas, entrada HTTP e consumidor SQS
  inbox/       deduplicação de mensagens recebidas
  outbox/      publicação confiável de eventos
  health/      health checks
  metrics/     métricas Prometheus
```

Cada módulo segue as camadas `domain` (regras puras), `application` (casos de uso e portas), `infrastructure` (SQL e SQS) e `interface` (HTTP e fila).
