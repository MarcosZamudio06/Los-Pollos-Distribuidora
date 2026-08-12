import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('backend start entrypoint contract', () => {
  it('uses the compiled entrypoint emitted by the backend build', () => {
    const packageManifest = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const nestCliConfig = JSON.parse(
      readFileSync(resolve(__dirname, '..', 'nest-cli.json'), 'utf8'),
    ) as { entryFile: string };

    expect(nestCliConfig.entryFile).toBe('backend/src/main');
    expect(packageManifest.scripts.start).toContain(
      `--entryFile ${nestCliConfig.entryFile}`,
    );
    expect(packageManifest.scripts['start:prod']).toBe(
      `node dist/${nestCliConfig.entryFile}`,
    );
  });
});
