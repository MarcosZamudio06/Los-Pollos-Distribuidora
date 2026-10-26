// A genuinely separate NestJS/AuthService/Prisma process for the second disposable company.
import { Rem003Harness } from './erp-rem003-harness';
const h = new Rem003Harness();
process.on('message', (message: unknown) => {
  if (message === 'close') void h.close().then(() => process.exit(0));
});
void h
  .start()
  .then(() => {
    process.send?.({ url: h.url, token: h.tokens.admin });
  })
  .catch(() => {
    process.send?.({ error: 'Second silo failed to start' });
    process.exit(1);
  });
