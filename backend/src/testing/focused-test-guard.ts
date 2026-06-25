import { Dirent } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type FileSystemEntry = Pick<Dirent, 'isDirectory' | 'isFile' | 'name'>;

type FocusedTestGuardOptions = {
  rootDir: string;
  readFile?: (path: string) => string;
  readdir?: (path: string) => FileSystemEntry[];
};

const IGNORED_DIRECTORIES = new Set(['coverage', 'dist', 'node_modules']);
const TEST_FILE_PATTERN = /\.(spec|e2e-spec)\.ts$/;
const FOCUSED_JEST_PATTERN = /\b(?:describe|it|test)\.only\s*\(/;

export function assertNoFocusedTests({
  rootDir,
  readFile = (path) => readFileSync(path, 'utf8'),
  readdir = (path) => readdirSync(path, { withFileTypes: true }),
}: FocusedTestGuardOptions): void {
  const focusedTestFiles = collectTestFiles(rootDir, readdir).filter((file) =>
    FOCUSED_JEST_PATTERN.test(readFile(file)),
  );

  if (focusedTestFiles.length > 0) {
    throw new Error(
      [
        'Focused Jest tests are not allowed. Remove .only from:',
        ...focusedTestFiles.map((file) => `- ${file}`),
      ].join('\n'),
    );
  }
}

function collectTestFiles(
  currentPath: string,
  readdir: (path: string) => FileSystemEntry[],
): string[] {
  const entries = readdir(currentPath);

  return entries.flatMap((entry) => {
    const entryPath = join(currentPath, entry.name);

    if (entry.isDirectory()) {
      return IGNORED_DIRECTORIES.has(entry.name)
        ? []
        : collectTestFiles(entryPath, readdir);
    }

    if (entry.isFile() && TEST_FILE_PATTERN.test(entry.name)) {
      return [entryPath];
    }

    return [];
  });
}
