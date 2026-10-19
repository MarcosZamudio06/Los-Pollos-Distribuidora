import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';

it('keeps the runtime import closure commercial-only with no tenant bootstrap or datastore client', () => {
  const visited = new Set<string>();
  const inspect = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    const imports = ts
      .preProcessFile(source)
      .importedFiles.map((item) => item.fileName);
    for (const target of imports) {
      expect(target).not.toMatch(/prisma|app\.module|database|modules\//i);
      if (target.startsWith('.')) {
        const dependency = resolve(dirname(file), `${target}.ts`);
        expect(dependency.startsWith(resolve(__dirname) + '/')).toBe(true);
        inspect(dependency);
      }
    }
  };
  inspect(resolve(__dirname, 'main.ts'));
  expect(visited.size).toBeGreaterThan(4);
});
