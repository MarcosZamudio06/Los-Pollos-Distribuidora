import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
type Manifest = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  overrides?: Record<string, unknown>;
};
type Lock = { packages: Record<string, { version?: string; dev?: boolean }> };

describe('candidate hardening supply-chain contracts', () => {
  it('declares the imported ms type instead of relying on npm transitive hoisting', () => {
    const pkg = JSON.parse(read('backend/package.json')) as Manifest;
    expect(pkg.devDependencies['@types/ms']).toBe('2.1.0');
  });

  it('keeps Vitest and its coverage provider on the same pinned version for both managers', () => {
    const pkg = JSON.parse(read('frontend/package.json')) as Manifest;
    expect(pkg.devDependencies.vitest).toBe('4.1.9');
    expect(pkg.devDependencies.vitest).toBe(
      pkg.devDependencies['@vitest/coverage-v8'],
    );
  });

  it('retains operational CLIs through the same locked npm graph, not an unlocked overlay', () => {
    const pkg = JSON.parse(read('backend/package.json')) as Manifest;
    const lock = JSON.parse(read('backend/package-lock.json')) as Lock;
    for (const [name, version] of Object.entries({
      prisma: '6.19.3',
      'ts-node': '10.9.2',
      typescript: '5.9.3',
    })) {
      expect(pkg.dependencies[name]).toBe(version);
      expect(pkg.devDependencies[name]).toBeUndefined();
      expect(lock.packages[`node_modules/${name}`].version).toBe(version);
      expect(lock.packages[`node_modules/${name}`].dev).not.toBe(true);
    }
    const docker = read('docker/backend/Dockerfile');
    expect(docker).toContain('npm ci --no-audit --no-fund');
    expect(docker).toContain('RUN npm prune --omit=dev');
    expect(docker).not.toContain('npm install --prefix');
    expect(docker).not.toContain('/tmp/production-tools');
  });

  it.each(['backend', 'frontend'])(
    'pins the %s npm tool to a reviewed integrity-verified artifact',
    (image) => {
      const docker = read(`docker/${image}/Dockerfile`);
      expect(docker).toContain(
        'https://registry.npmjs.org/npm/-/npm-11.21.1.tgz',
      );
      expect(docker).toContain(
        'ADD --checksum=sha256:dd77c48eb845f4856c2cdba347cfb52bd877a2655a1ea48ff0c4796e3df9dd7b',
      );
    },
  );

  it.each(['backend', 'frontend'])(
    'installs only bundled %s npm with network and lifecycle scripts disabled',
    (image) => {
      const docker = read(`docker/${image}/Dockerfile`);
      expect(docker).toContain(
        'RUN --network=none npm install --global --offline --ignore-scripts',
      );
      expect(docker).toContain('/tmp/npm-cli.tgz');
    },
  );

  it.each(['backend', 'frontend'])(
    'pins the compatible %s bundled Undici security patch',
    (image) => {
      const docker = read(`docker/${image}/Dockerfile`);
      expect(docker).toContain(
        'https://registry.npmjs.org/undici/-/undici-6.29.1.tgz',
      );
      expect(docker).toContain(
        'ADD --checksum=sha256:29c4b8e0b2d86cb8795571c1959012ce057a14ecfd34858335f47c31e770a04f',
      );
      expect(docker).toContain('tar -xzf /tmp/npm-undici.tgz');
    },
  );

  it.each(['backend', 'frontend'])(
    'pins the %s Node LTS security release including embedded Undici',
    (image) => {
      expect(read(`docker/${image}/Dockerfile`)).toContain(
        'node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53',
      );
    },
  );

  it('pins the root-only developer CLI proxy parser to the compatible critical fix', () => {
    const pkg = JSON.parse(read('package.json')) as Manifest;
    const lock = JSON.parse(read('package-lock.json')) as Lock;
    expect(pkg.overrides?.['proxy-addr']).toBe('2.0.8');
    expect(lock.packages['node_modules/proxy-addr'].version).toBe('2.0.8');
  });

  it.each([
    ['backend', 'handlebars', '4.7.10'],
    ['backend', 'browserslist', '4.28.7'],
    ['backend', 'fast-uri', '3.1.7'],
    ['frontend', 'brace-expansion', '5.0.11'],
    ['frontend', 'browserslist', '4.28.7'],
    ['frontend', 'source-map-js', '1.2.2'],
    ['frontend', 'undici', '7.30.1'],
    ['frontend', 'vite', '8.1.6'],
    ['frontend', 'zod', '4.6.6'],
  ])('pins reviewed compatible %s/%s fixes', (project, name, version) => {
    const lock = JSON.parse(read(`${project}/package-lock.json`)) as Lock;
    expect(lock.packages[`node_modules/${name}`].version).toBe(version);
  });
});
