import type { LoggerService } from '@nestjs/common';

type LogLevel = 'info' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

export class JsonLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: LogLevel, message: unknown, params: unknown[]): void {
    const context = params.at(-1);
    const fields =
      typeof message === 'object' && message !== null
        ? message
        : { message: String(message) };

    process.stdout.write(
      `${JSON.stringify({
        level,
        time: new Date().toISOString(),
        context: typeof context === 'string' ? context : undefined,
        ...fields,
      })}\n`,
    );
  }
}
