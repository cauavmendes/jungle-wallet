import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Metrics } from './metrics';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: Metrics) {}

  @Get()
  async scrape(
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    response.type(this.metrics.registry.contentType);

    return this.metrics.registry.metrics();
  }
}
