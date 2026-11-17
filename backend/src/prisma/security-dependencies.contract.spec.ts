import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const root =
  process.env.SECURITY_REPOSITORY_ROOT ?? resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('SEC-004 reproducible patched YAML dependency', () => {
  const yaml = createRequire(__filename)('js-yaml') as {
    load(source: string, options?: Record<string, unknown>): unknown;
    dump(value: unknown): string;
    YAML11_SCHEMA: unknown;
  };

  it('counts empty merge sources against a tiny explicit budget without a DoS payload', () => {
    const source = 'arr: &arr [{}, {}, {}]\ntarget:\n  <<: *arr\n';
    expect(() =>
      yaml.load(source, { schema: yaml.YAML11_SCHEMA, maxTotalMergeKeys: 1 }),
    ).toThrow(/merge/i);
  });

  it('keeps the Swagger dump API and ordinary YAML round trips compatible', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'ERP API', version: '1.0.0' },
      paths: {},
    };
    expect(yaml.load(yaml.dump(document))).toEqual(document);
  });

  it('pins the smallest reviewed fix across npm and pnpm', () => {
    const pkg = JSON.parse(read('backend/package.json')) as {
      overrides: Record<string, string>;
    };
    const lock = JSON.parse(read('backend/package-lock.json')) as {
      packages: Record<string, { version: string }>;
    };
    expect(pkg.overrides['js-yaml']).toBe('5.4.1');
    expect(lock.packages['node_modules/js-yaml'].version).toBe('5.4.1');
    expect(read('backend/pnpm-workspace.yaml')).toContain('js-yaml: 5.4.1');
    expect(read('backend/pnpm-lock.yaml')).toContain('js-yaml@5.4.1');
    expect(read('backend/pnpm-lock.yaml')).not.toContain('js-yaml@5.2.2');
  });
});
