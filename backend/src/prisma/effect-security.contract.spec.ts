import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root =
  process.env.SECURITY_REPOSITORY_ROOT ?? resolve(__dirname, '../../..');
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8')) as {
    dependencies: Record<string, string>;
    overrides: Record<string, { effect?: string }>;
    packages: Record<
      string,
      { version: string; dev?: boolean; integrity?: string }
    >;
  };

describe('CI-005 production Effect security boundary', () => {
  it('scopes the patched Effect override to Prisma config without changing Prisma versions', () => {
    const pkg = read('backend/package.json');
    expect(pkg.dependencies.prisma).toBe('6.19.3');
    expect(pkg.dependencies['@prisma/client']).toBe('6.19.3');
    expect(pkg.overrides['@prisma/config']?.effect).toBe('3.22.1');
    expect(pkg.overrides.effect).toBeUndefined();
  });

  it('locks every production Effect copy to the reviewed registry artifact', () => {
    const lock = read('backend/package-lock.json');
    const effects = Object.entries(lock.packages).filter(
      ([path, entry]) =>
        /(?:^|\/)node_modules\/effect$/.test(path) && !entry.dev,
    );
    expect(effects.length).toBeGreaterThan(0);
    for (const [, entry] of effects) {
      expect(entry.version).toBe('3.22.1');
      expect(entry.integrity).toBe(
        'sha512-TNoXushmPOBAjJlthF5d2QwnX2xBPEtcNJr5XKNKbRLbDvBcOYkXlYDfvGfSA0zriwLFuCll5MDtNMAdZL17PQ==',
      );
    }
  });

  it('preserves template semantics and rejects adversarial input in a bounded subprocess', () => {
    // Resolve the public API through the actual Prisma-config dependency scope.
    // A timeout kills only this test child, never blocks the ERP event loop.
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `const { createRequire } = require('node:module');
const scoped = createRequire(require.resolve('@prisma/config'));
const S = scoped('effect/Schema');
const accepts = S.is(S.TemplateLiteral(S.String, ':', S.String, ':', S.String, 'X'));
console.log(JSON.stringify(['a:b:cX', '::X', 'a::X', 'a:b:c', ':'.repeat(100000)].map(accepts)));`,
      ],
      { cwd: resolve(root, 'backend'), encoding: 'utf8', timeout: 5000 },
    );
    expect({ status: result.status, error: result.error?.message }).toEqual({
      status: 0,
      error: undefined,
    });
    expect(JSON.parse(result.stdout)).toEqual([true, true, true, false, false]);
  });
});
