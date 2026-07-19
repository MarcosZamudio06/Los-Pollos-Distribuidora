import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Billing audit contract', () => {
  const schema = readFileSync(resolve(__dirname, '../../../prisma/schema.prisma'), 'utf8');

  it('persists the bounded billing audit context and immutable evidence', () => {
    expect(schema).toContain('model BillingAuditLog');
    for (const field of ['actorUserId', 'action', 'entityType', 'entityId', 'before', 'after', 'reason', 'ipAddress', 'correlationId', 'context', 'createdAt']) {
      expect(schema).toMatch(new RegExp(`\\b${field}\\s+`));
    }
  });
});
