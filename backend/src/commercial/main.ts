import 'reflect-metadata';
import { loadLeadConfig } from './config';
import { createReceiver } from './receiver';
import { LeadStore } from './store';
import { NotificationWorker } from './notification';

async function bootstrap() {
  process.umask(0o077);
  const config = loadLeadConfig();
  const store = new LeadStore(config.dbPath);
  const app = await createReceiver(config, store);
  const worker = new NotificationWorker(store, config);
  const timer = setInterval(() => {
    void worker.tick().catch(() => {
      /* Retry on next tick; never log payloads. */
    });
  }, 5000);
  timer.unref();
  app.enableShutdownHooks();
  await app.listen(config.port, config.local ? '127.0.0.1' : '0.0.0.0');
  console.info('Commercial receiver ready');
  const close = () => {
    clearInterval(timer);
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
}
void bootstrap().catch(() => {
  console.error(
    'Commercial receiver unavailable: check server configuration/storage',
  );
  process.exitCode = 1;
});
