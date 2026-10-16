import { Migration } from '@mikro-orm/migrations';

export class Migration20261016200000WagerBalanceSnapshot extends Migration {
  override name = 'Migration20261016200000_wager_balance_snapshot';

  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
        ADD COLUMN balance_after_cents bigint CHECK (balance_after_cents >= 0)
    `);
  }

  override async down(): Promise<void> {
    this.addSql(
      'ALTER TABLE wager_transactions DROP COLUMN balance_after_cents',
    );
  }
}
