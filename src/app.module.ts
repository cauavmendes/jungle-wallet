import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import mikroOrmConfig from './infrastructure/database/mikro-orm.config';
import { OutboxModule } from './outbox/outbox.module';
import { WageringModule } from './wagering/wagering.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    HealthModule,
    WalletModule,
    WageringModule,
    OutboxModule,
  ],
})
export class AppModule {}
