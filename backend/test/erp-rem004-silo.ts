// A genuinely separate NestJS/AuthService/Prisma process for the second disposable company.
import { FleetGateway } from '../src/modules/fleet/fleet.gateway';
import { SessionRevocationRegistry } from '../src/common/session/session-revocation.registry';
import { Rem003Harness } from './erp-rem003-harness';
const h = new Rem003Harness();
process.on('message', (message: unknown) => {
  if (message === 'socket-state' || message === 'socket-probe') {
    const gateway = h.app.get(FleetGateway);
    const sessions = h.app.get(SessionRevocationRegistry);
    if (message === 'socket-probe')
      gateway.emitRouteUpdated({ source: 'ci004-silo-b' });
    process.send?.({
      sockets: (gateway.server as unknown as { sockets: Map<string, unknown> })
        .sockets.size,
      tracked: sessions.connectionCount,
      pending: sessions.pendingAuthorizationCount,
    });
  }
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
