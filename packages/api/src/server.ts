import { createApp } from './app';
import { createConfig } from './config';
import { logger } from './lib/logger';
import { createMeteringRuntime } from './metering/runtime';

const config = createConfig();
const meteringRuntime = createMeteringRuntime(config);
const app = createApp(config, meteringRuntime);

async function runMeteringWorker(): Promise<void> {
  try {
    const result = await meteringRuntime.worker.runNextBatch();

    if (result.attempted > 0) {
      logger.info(result, 'Completed metering outbox batch');
    }
  } catch (error) {
    logger.error({ err: error }, 'Metering worker run failed');
  }
}

setInterval(() => {
  void runMeteringWorker();
}, config.metering.workerIntervalMs).unref();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API server listening');
});