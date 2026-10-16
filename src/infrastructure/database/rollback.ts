import { MikroORM } from '@mikro-orm/postgresql';
import config from './mikro-orm.config';

async function rollback(): Promise<void> {
  const orm = await MikroORM.init(config);

  try {
    await orm.migrator.down();
  } finally {
    await orm.close(true);
  }
}

void rollback();
