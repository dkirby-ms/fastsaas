import { createApp } from './app';
import { createConfig } from './config';
import { logger } from './lib/logger';

const config = createConfig();
const app = createApp(config);

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'API server listening');
});
