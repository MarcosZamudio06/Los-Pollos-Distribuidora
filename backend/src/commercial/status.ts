import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

// Private operator command only: aggregate counts, no lead payload or public endpoint.
const path = process.env.LEAD_DB_PATH;
if (!path || !existsSync(path))
  throw new Error('Existing commercial database required');
const db = new DatabaseSync(path, { readOnly: true });
try {
  console.info(
    JSON.stringify(
      db
        .prepare('SELECT state,count(*) AS count FROM leads GROUP BY state')
        .all(),
    ),
  );
} finally {
  db.close();
}
