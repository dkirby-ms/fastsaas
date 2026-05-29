import pino, { type DestinationStream, type LoggerOptions } from 'pino';

export function createLogger(options?: LoggerOptions & { destination?: DestinationStream }) {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? 'info',
      base: undefined,
      messageKey: 'message',
      timestamp: pino.stdTimeFunctions.isoTime,
      ...options
    },
    options?.destination
  );
}

export type ApiLogger = ReturnType<typeof createLogger>;

export const logger = createLogger();
