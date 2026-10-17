import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { JsonLogger } from './shared/infrastructure/json-logger';
import { DomainErrorFilter } from './shared/interface/http/domain-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
