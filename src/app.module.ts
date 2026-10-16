import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import mikroOrmConfig from './infrastructure/database/mikro-orm.config';
import { WalletModule } from './wallet/wallet.module';

@Module({
  imports: [MikroOrmModule.forRoot(mikroOrmConfig), WalletModule],
})
export class AppModule {}
