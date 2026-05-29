import { createApp } from './app';
import { createConfig } from './config';
import { logger } from './lib/logger';
import { createMeteringRuntime } from './metering/runtime';

const config = createConfig();
const meteringRuntime = createMeteringRuntime(config);
const app = createApp(config, meteringRuntime);

setInterval(async () => {
  const result = await meteringRuntime.worker.runNextBatch();

  if (result.attempted > 0) {
    logger.info(result, 'Completed metering outbox batch');
  }
}, config.metering.workerIntervalMs).unref();

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API server listening');
});
