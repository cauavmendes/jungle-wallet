import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import mikroOrmConfig from './infrastructure/database/mikro-orm.config';
import { WageringModule } from './wagering/wagering.module';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [
    MikroOrmModule.forRoot(mikroOrmConfig),
    WalletModule,
    WageringModule,
  ],
})
export class AppModule {}
