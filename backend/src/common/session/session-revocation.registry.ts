import { Injectable } from '@nestjs/common';

type RevocationListener = (userIds: readonly string[]) => void;

@Injectable()
export class SessionRevocationRegistry {
  private readonly listeners = new Set<RevocationListener>();

  subscribe(listener: RevocationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(userIds: readonly string[]): void {
    if (userIds.length === 0) return;
    for (const listener of this.listeners) listener(userIds);
  }
}
