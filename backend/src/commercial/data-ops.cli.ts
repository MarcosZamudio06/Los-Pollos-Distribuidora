import { parseArgs } from 'node:util';
import { copyCommercial, purgeCommercial } from './data-ops';

async function main() {
  process.umask(0o077);
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      destination: { type: 'string' },
      before: { type: 'string' },
      reference: { type: 'string' },
      apply: { type: 'boolean', default: false },
      'service-stopped': { type: 'boolean', default: false },
    },
  });
  if (positionals.length !== 1 || !values.source)
    throw new Error('Explicit operation and source required');
  const operation = positionals[0];
  if (operation === 'purge') {
    if (values.destination) throw new Error('Unexpected destination');
    console.info(
      JSON.stringify(
        purgeCommercial(
          values.source,
          { before: values.before, reference: values.reference },
          values.apply,
          values['service-stopped'],
        ),
      ),
    );
  } else if (operation === 'backup' || operation === 'restore') {
    if (
      !values.destination ||
      values.apply ||
      values.before ||
      values.reference
    )
      throw new Error('Explicit new destination required');
    if (operation === 'restore' && !values['service-stopped'])
      throw new Error('Explicit stopped-service acknowledgement required');
    console.info(
      JSON.stringify(
        await copyCommercial(
          values.source,
          values.destination,
          operation === 'restore',
        ),
      ),
    );
  } else throw new Error('Unknown data operation');
}
void main().catch(() => {
  // A failed purge may already have committed before VACUUM/checkpoint failed.
  console.error(
    'Commercial data operation incomplete. Keep services stopped after a mutation; inspect privately. No successful erasure or recovery is implied.',
  );
  process.exitCode = 1;
});
