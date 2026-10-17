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

    process.stdout.write(
      `${JSON.stringify({
        level,
        time: new Date().toISOString(),
        context: typeof context === 'string' ? context : undefined,
        ...toFields(message),
      })}\n`,
    );
  }
}

function toFields(message: unknown): Record<string, unknown> {
  if (message instanceof Error) {
    return {
      message: message.message,
      error: message.name,
      stack: message.stack,
    };
  }

  if (typeof message === 'object' && message !== null) {
    return { ...message };
  }

  return { message: String(message) };
}
