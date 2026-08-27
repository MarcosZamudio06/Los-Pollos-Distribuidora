import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE_ROOT = join(__dirname, '..');
const ALLOWED_PROVIDER_SPECIFIC_PATHS = [
  'cfdi/adapters/',
  'cfdi/cfdi.module.ts',
  'config/',
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('CFDI provider dependency boundary', () => {
  it('keeps provider names and adapter imports out of fiscal application modules', () => {
    const violations = sourceFiles(SOURCE_ROOT)
      .filter((path) => !path.endsWith('.spec.ts'))
      .filter((path) => !path.includes('/testing/'))
      .map((path) => ({
        path,
        relativePath: relative(SOURCE_ROOT, path),
        content: readFileSync(path, 'utf8'),
      }))
      .filter(
        ({ relativePath }) =>
          !ALLOWED_PROVIDER_SPECIFIC_PATHS.some((allowed) =>
            relativePath.startsWith(allowed),
          ),
      )
      .filter(({ content }) =>
        /Facturama|FACTURAMA|FINKOK|facturama/i.test(content),
      )
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });
});
