import { Global, Module } from '@nestjs/common';
import { Metrics } from './metrics';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [Metrics],
  exports: [Metrics],
})
export class MetricsModule {}
