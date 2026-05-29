import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime
});
