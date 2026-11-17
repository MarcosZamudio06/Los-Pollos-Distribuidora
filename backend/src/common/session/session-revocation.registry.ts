import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type {
  AuthenticatedPrincipal,
  RealtimeSession,
} from '../../modules/auth/auth.types';

type Listener = (userIds: readonly string[]) => void;
type LiveSocket = {
  join(rooms: string[]): unknown;
  leave?(room: string): unknown;
  rooms?: Set<string>;
  disconnect(close: boolean): unknown;
  once(event: string, listener: () => void): unknown;
  off?(event: string, listener: () => void): unknown;
  conn?: {
    once(event: string, listener: () => void): unknown;
    off(event: string, listener: () => void): unknown;
  };
};
type Binding = {
  socket: LiveSocket;
  session: RealtimeSession;
  fingerprint: string;
  rooms: string[];
  validate: () => Promise<RealtimeSession>;
  roomsFor: (principal: AuthenticatedPrincipal) => Promise<string[]>;
  cleanup: () => void;
  timer?: ReturnType<typeof setTimeout>;
};

/** Single active backend per company. No distributed propagation is claimed. */
@Injectable()
export class SessionRevocationRegistry implements OnModuleDestroy {
  private readonly listeners = new Set<Listener>();
  private readonly bindings = new Map<LiveSocket, Binding>();
  // Only live authorization attempts are retained; no revoked-session tombstones.
  private readonly pending = new Set<{
    principal?: AuthenticatedPrincipal;
    dirty: boolean;
    cancelled: boolean;
  }>();
  private destroyed = false;
  readonly revalidationIntervalMs = 30_000;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  notify(userIds: readonly string[]): void {
    if (!userIds.length) return;
    const ids = new Set(userIds);
    for (const ticket of this.pending) {
      if (!ticket.principal) ticket.dirty = true;
      else if (ids.has(ticket.principal.id)) ticket.cancelled = true;
    }
    for (const binding of [...this.bindings.values()])
      if (ids.has(binding.session.principal.id)) this.disconnect(binding);
    for (const listener of this.listeners) listener(userIds);
  }
  notifySessions(sessionIds: readonly string[]): void {
    if (!sessionIds.length) return;
    const ids = new Set(sessionIds);
    for (const ticket of this.pending) {
      if (!ticket.principal) ticket.dirty = true;
      else if (ids.has(ticket.principal.authSessionId)) ticket.cancelled = true;
    }
    for (const binding of [...this.bindings.values()])
      if (ids.has(binding.session.principal.authSessionId))
        this.disconnect(binding);
  }
  isTracked(socket: LiveSocket): boolean {
    return this.bindings.has(socket);
  }
  get connectionCount(): number {
    return this.bindings.size;
  }

  async authorize(
    socket: LiveSocket,
    validate: Binding['validate'],
    roomsFor: Binding['roomsFor'],
  ): Promise<void> {
    const ticket: {
      principal?: AuthenticatedPrincipal;
      dirty: boolean;
      cancelled: boolean;
    } = { dirty: false, cancelled: false };
    this.pending.add(ticket);
    const abort = () => {
      ticket.cancelled = true;
      this.pending.delete(ticket);
    };
    socket.conn?.once('close', abort);
    try {
      let session = await validate();
      ticket.principal = session.principal;
      // A notification before identity was known needs one fresh read, not rejection
      // of unrelated sessions. Once identified, only matching notifications cancel.
      if (ticket.dirty) session = await validate();
      const rooms = [...new Set(await roomsFor(session.principal))].sort();
      if (
        this.destroyed ||
        ticket.cancelled ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= Date.now()
      )
        throw new Error('Socket session is not active');
      const binding: Binding = {
        socket,
        session,
        rooms,
        validate,
        roomsFor,
        fingerprint: this.fingerprint(session.principal),
        cleanup: () => this.release(binding),
      };
      this.bindings.set(socket, binding);
      socket.once('disconnect', binding.cleanup);
      // Namespace middleware failures do not emit disconnect; cover transport aborts.
      socket.conn?.once('close', binding.cleanup);
      try {
        await socket.join(rooms);
        if (
          ticket.cancelled ||
          !this.isTracked(socket) ||
          session.expiresAt <= Date.now()
        )
          throw new Error('Socket authorization changed');
        this.schedule(binding);
      } catch (error) {
        this.disconnect(binding);
        throw error;
      }
    } finally {
      this.pending.delete(ticket);
      socket.conn?.off('close', abort);
    }
  }
  get pendingAuthorizationCount(): number {
    return this.pending.size;
  }
  /** Protected emissions prune synchronously, even if the event loop delayed timers. */
  pruneExpired(): void {
    const now = Date.now();
    for (const binding of [...this.bindings.values()])
      if (binding.session.expiresAt <= now) this.disconnect(binding);
  }
  private fingerprint(p: AuthenticatedPrincipal): string {
    return JSON.stringify([
      p.id,
      p.authSessionId,
      p.role,
      [...(p.permissions ?? [])].sort(),
      p.operationalLocationId,
      p.mustChangePassword,
    ]);
  }
  private schedule(binding: Binding): void {
    binding.timer = setTimeout(
      () => {
        void this.revalidate(binding);
      },
      Math.max(
        0,
        Math.min(
          this.revalidationIntervalMs,
          binding.session.expiresAt - Date.now(),
        ),
      ),
    );
    binding.timer.unref?.();
  }
  private async revalidate(binding: Binding): Promise<void> {
    if (!this.isTracked(binding.socket)) return;
    if (binding.session.expiresAt <= Date.now()) {
      this.disconnect(binding);
      return;
    }
    try {
      const session = await binding.validate();
      const rooms = [
        ...new Set(await binding.roomsFor(session.principal)),
      ].sort();
      if (!this.isTracked(binding.socket)) return;
      if (
        this.fingerprint(session.principal) !== binding.fingerprint ||
        JSON.stringify(rooms) !== JSON.stringify(binding.rooms) ||
        !Number.isFinite(session.expiresAt) ||
        session.expiresAt <= Date.now()
      ) {
        this.disconnect(binding);
        return;
      }
      binding.session = session;
      this.schedule(binding);
    } catch {
      this.disconnect(binding);
    }
  }
  private release(binding: Binding): void {
    if (this.bindings.get(binding.socket) !== binding) return;
    this.bindings.delete(binding.socket);
    clearTimeout(binding.timer);
    binding.socket.off?.('disconnect', binding.cleanup);
    binding.socket.conn?.off('close', binding.cleanup);
  }
  private disconnect(binding: Binding): void {
    this.release(binding);
    for (const room of binding.socket.rooms ?? []) binding.socket.leave?.(room);
    // Namespace-only disconnect: another session may share the Engine.IO transport.
    binding.socket.disconnect(false);
  }
  onModuleDestroy(): void {
    this.destroyed = true;
    for (const ticket of this.pending) ticket.cancelled = true;
    for (const binding of [...this.bindings.values()]) this.disconnect(binding);
    this.listeners.clear();
  }
}
