import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONTROLLER_FILE = /\.controller\.ts$/;
const ACCESS_CLASSIFICATION = /@(Public|Authenticated|RequirePermissions|Roles)\(/;

async function controllerFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return CONTROLLER_FILE.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

describe('controller access classification', () => {
  it('requires every HTTP controller to explicitly classify access', async () => {
    const moduleDirectory = join(process.cwd(), 'src/modules');
    const files = await controllerFiles(moduleDirectory);
    const unclassified = await Promise.all(files.map(async (file) => {
      const source = await readFile(file, 'utf8');
      return ACCESS_CLASSIFICATION.test(source) ? null : file;
    }));

    expect(unclassified.filter((file): file is string => file !== null)).toEqual([]);
  });
});
