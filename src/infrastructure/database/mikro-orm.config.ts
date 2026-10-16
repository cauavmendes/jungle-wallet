import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migration20261016180000InitialSchema } from './migrations/Migration20261016180000_initial_schema';

export default defineConfig({
  clientUrl:
    process.env.DATABASE_URL ??
    'postgresql://wallet:wallet@localhost:5432/wallet',
  entities: [],
  discovery: { warnWhenNoEntities: false },
  extensions: [Migrator],
  migrations: {
    migrationsList: [Migration20261016180000InitialSchema],
    snapshot: false,
  },
});
