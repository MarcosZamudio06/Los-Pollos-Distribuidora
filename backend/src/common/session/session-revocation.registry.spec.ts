import { EventEmitter } from 'node:events';
import { SessionRevocationRegistry } from './session-revocation.registry';

describe('Central realtime session lifecycle', () => {
  let registry: SessionRevocationRegistry;
  beforeEach(() => {
    jest.useFakeTimers();
    registry = new SessionRevocationRegistry();
  });
  afterEach(() => {
    registry.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
  function fixture(sessionId = 'session-a') {
    const events = new EventEmitter();
    const conn = new EventEmitter();
    const rooms = new Set<string>();
    const socket = {
      conn,
      rooms,
      join: jest.fn((rs: string[]) => {
        for (const r of rs) rooms.add(r);
      }),
      leave: jest.fn((r: string) => rooms.delete(r)),
      once: events.once.bind(events),
      off: events.off.bind(events),
      disconnect: jest.fn(() => events.emit('disconnect')),
    };
    const session = {
      principal: {
        id: 'user',
        authSessionId: sessionId,
        role: 'ADMIN',
        name: 'Synthetic',
        email: 'fixture@fixture.invalid',
        permissions: ['fleet.view'],
        mustChangePassword: false,
      },
      expiresAt: Date.now() + 60000,
    };
    const validate = jest.fn(() => Promise.resolve(session));
    const roomPolicy = jest.fn(() => Promise.resolve(['protected-room']));
    return { socket, session, validate, roomPolicy, events };
  }
  it('revokes A without disconnecting B of the same user', async () => {
    const a = fixture();
    const b = fixture('session-b');
    await registry.authorize(a.socket, a.validate, a.roomPolicy);
    await registry.authorize(b.socket, b.validate, b.roomPolicy);
    registry.notifySessions(['session-a']);
    expect(a.socket.disconnect).toHaveBeenCalled();
    expect(b.socket.disconnect).not.toHaveBeenCalled();
    expect(registry.connectionCount).toBe(1);
    registry.notify(['user']);
    expect(b.socket.disconnect).toHaveBeenCalled();
    expect(registry.connectionCount).toBe(0);
  });
  it('rejects a handshake racing revocation while authorization awaits rooms', async () => {
    const f = fixture();
    let release!: () => void;
    const paused = new Promise<void>((r) => {
      release = r;
    });
    const result = registry.authorize(f.socket, f.validate, async () => {
      await paused;
      return ['protected'];
    });
    await Promise.resolve();
    registry.notifySessions(['session-a']);
    release();
    await expect(result).rejects.toThrow('not active');
    expect(registry.connectionCount).toBe(0);
    expect(f.socket.join).not.toHaveBeenCalled();
  });
  it('does not close a shared Engine.IO transport when revoking one namespace session', async () => {
    const f = fixture();
    await registry.authorize(f.socket, f.validate, f.roomPolicy);
    registry.notifySessions(['session-a']);
    expect(f.socket.disconnect).toHaveBeenCalledWith(false);
  });
  it('prunes expiry synchronously even when its timer has not executed', async () => {
    const f = fixture();
    f.session.expiresAt = Date.now() + 500;
    await registry.authorize(f.socket, f.validate, f.roomPolicy);
    jest.setSystemTime(Date.now() + 501);
    registry.pruneExpired();
    expect(f.socket.disconnect).toHaveBeenCalled();
    expect(f.socket.rooms.size).toBe(0);
  });
  it.each(['permissions', 'rooms', 'invalid'])(
    'revalidates %s and fails closed without an emission query',
    async (cause) => {
      const f = fixture();
      await registry.authorize(f.socket, f.validate, f.roomPolicy);
      if (cause === 'permissions') f.session.principal.permissions = [];
      if (cause === 'rooms') f.roomPolicy.mockResolvedValue(['different-room']);
      if (cause === 'invalid')
        f.validate.mockRejectedValue(new Error('revoked'));
      for (let i = 0; i < 100; i++) registry.pruneExpired();
      expect(f.validate).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(30000);
      expect(f.socket.disconnect).toHaveBeenCalled();
      expect(registry.connectionCount).toBe(0);
    },
  );
  it('cleans timers and pending transport listeners on disconnect and shutdown', async () => {
    const f = fixture();
    await registry.authorize(f.socket, f.validate, f.roomPolicy);
    expect(f.socket.conn.listenerCount('close')).toBe(1);
    f.events.emit('disconnect');
    expect(registry.connectionCount).toBe(0);
    expect(f.socket.conn.listenerCount('close')).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('bounds pending tickets and does not reject B for an unrelated A notification', async () => {
    const f = fixture('B');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pending = registry.authorize(
      f.socket,
      async () => {
        await gate;
        return f.session;
      },
      f.roomPolicy,
    );
    expect(registry.pendingAuthorizationCount).toBe(1);
    registry.notifySessions(['A']);
    release();
    await pending;
    expect(registry.pendingAuthorizationCount).toBe(0);
    expect(registry.connectionCount).toBe(1);
    registry.notifySessions(['B']);
    expect(registry.connectionCount).toBe(0);
  });
  it('releases an unidentified pending ticket immediately when its transport closes', async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const pending = registry.authorize(
      f.socket,
      async () => {
        await gate;
        return f.session;
      },
      f.roomPolicy,
    );
    const denied = expect(pending).rejects.toThrow('not active');
    f.socket.conn.emit('close');
    expect(registry.pendingAuthorizationCount).toBe(0);
    release();
    await denied;
    expect(registry.connectionCount).toBe(0);
    expect(f.socket.join).not.toHaveBeenCalled();
  });
});
