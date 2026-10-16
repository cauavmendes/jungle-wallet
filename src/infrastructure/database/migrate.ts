import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config';

async function migrate(): Promise<void> {
  const orm = await MikroORM.init(config);

  try {
    await orm.migrator.up();
  } finally {
    await orm.close(true);
  }
}

void migrate();
