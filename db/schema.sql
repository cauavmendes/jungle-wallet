DROP TABLE IF EXISTS outbox_messages CASCADE;
DROP TABLE IF EXISTS inbox_messages CASCADE;
DROP TABLE IF EXISTS wallet_ledger_entries CASCADE;
DROP TABLE IF EXISTS wager_transactions CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP FUNCTION IF EXISTS prevent_ledger_mutation CASCADE;

CREATE TABLE wallets (
  id            uuid        PRIMARY KEY,
  player_id     uuid        NOT NULL,
  currency      char(3)     NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  balance_cents bigint      NOT NULL CHECK (balance_cents >= 0),
  version       integer     NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency),
  CONSTRAINT wallets_identity_unique UNIQUE (id, player_id, currency)
);

CREATE TABLE wager_transactions (
  id                                uuid        PRIMARY KEY,
  provider_id                       text        NOT NULL,
  external_transaction_id           text        NOT NULL,
  idempotency_key                   text        NOT NULL,
  payload_hash                      char(64)    NOT NULL,
  wallet_id                         uuid        NOT NULL,
  player_id                         uuid        NOT NULL,
  currency                          char(3)     NOT NULL,
  round_id                          text,
  game_id                           text,
  kind                              text        NOT NULL
    CHECK (kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')),
  amount_cents                      bigint      NOT NULL CHECK (amount_cents >= 0),
  reference_external_transaction_id text,
  reference_transaction_id          uuid        REFERENCES wager_transactions (id),
  status                            text        NOT NULL
    CHECK (status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')),
  failure_code                      text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  processed_at                      timestamptz,

  CONSTRAINT wager_tx_idempotency_key_unique UNIQUE (idempotency_key),
  CONSTRAINT wager_tx_provider_external_unique UNIQUE (provider_id, external_transaction_id),
  CONSTRAINT wager_tx_wallet_fk FOREIGN KEY (wallet_id, player_id, currency)
    REFERENCES wallets (id, player_id, currency),
  CONSTRAINT wager_tx_reference_required
    CHECK (kind NOT IN ('REFUND', 'ROLLBACK') OR reference_external_transaction_id IS NOT NULL),
  CONSTRAINT wager_tx_failure_code_consistency
    CHECK ((status IN ('REJECTED', 'FAILED')) = (failure_code IS NOT NULL))
);

CREATE TABLE wallet_ledger_entries (
  id                   uuid        PRIMARY KEY,
  sequence             bigint      GENERATED ALWAYS AS IDENTITY UNIQUE,
  wallet_id            uuid        NOT NULL REFERENCES wallets (id),
  transaction_id       uuid        NOT NULL REFERENCES wager_transactions (id),
  direction            text        NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
  amount_cents         bigint      NOT NULL CHECK (amount_cents > 0),
  balance_before_cents bigint      NOT NULL CHECK (balance_before_cents >= 0),
  balance_after_cents  bigint      NOT NULL CHECK (balance_after_cents >= 0),
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ledger_one_entry_per_transaction UNIQUE (transaction_id, wallet_id),
  CONSTRAINT ledger_balanced CHECK (
    (direction = 'CREDIT' AND balance_after_cents = balance_before_cents + amount_cents)
    OR
    (direction = 'DEBIT' AND balance_after_cents = balance_before_cents - amount_cents)
  )
);

CREATE INDEX ledger_wallet_sequence_idx ON wallet_ledger_entries (wallet_id, sequence);

CREATE FUNCTION prevent_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledger_entries is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_no_update_delete
  BEFORE UPDATE OR DELETE ON wallet_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_ledger_mutation();

CREATE TRIGGER ledger_no_truncate
  BEFORE TRUNCATE ON wallet_ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_ledger_mutation();

CREATE UNIQUE INDEX wager_tx_single_reversal_idx
  ON wager_transactions (reference_transaction_id, kind)
  WHERE reference_transaction_id IS NOT NULL AND status = 'PROCESSED';

CREATE INDEX wager_tx_pending_reference_idx
  ON wager_transactions (created_at)
  WHERE status = 'PENDING_REFERENCE';

CREATE TABLE inbox_messages (
  consumer_name text        NOT NULL,
  message_id    text        NOT NULL,
  payload_hash  char(64)    NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,

  PRIMARY KEY (consumer_name, message_id)
);

CREATE TABLE outbox_messages (
  id              uuid        PRIMARY KEY,
  aggregate_id    uuid        NOT NULL,
  event_type      text        NOT NULL,
  payload         jsonb       NOT NULL,
  occurred_at     timestamptz NOT NULL,
  attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);

CREATE INDEX outbox_pending_idx
  ON outbox_messages (next_attempt_at)
  WHERE published_at IS NULL;