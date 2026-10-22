import { createApp } from './app.js';
import { readConfig } from './config.js';

async function main(): Promise<void> {
  const config = readConfig();
  const app = createApp(config);

  await app.listen({ port: config.port, host: config.host });

  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void app.close().catch(() => {
      console.error('Backend failed to shut down cleanly.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void main().catch((err: unknown) => {
  // Do not print configuration values, request contents, or provider credentials.
  const reason = err instanceof Error ? `: ${err.message}` : '';
  console.error(`Backend failed to start (check configuration and port availability)${reason}.`);
  process.exitCode = 1;
});
