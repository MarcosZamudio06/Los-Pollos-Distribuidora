import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Build the same Nest application in a fresh output tree without deleting or
// changing permissions on an existing dist. Never use this output as release proof.
const backend = resolve(__dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'pollos-nest-build-'));
const output = join(scratch, 'output');
const tsconfig = join(scratch, 'tsconfig.json');
const nestconfig = join(scratch, 'nest-cli.json');
const parsed = ts.getParsedCommandLineOfConfigFile(
  join(backend, 'tsconfig.build.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {
      throw new Error('Invalid backend compiler configuration');
    },
  },
);
if (!parsed || parsed.errors.length)
  throw new Error('Cannot resolve backend source program');
writeFileSync(
  tsconfig,
  JSON.stringify({
    extends: join(backend, 'tsconfig.build.json'),
    compilerOptions: {
      outDir: output,
      incremental: false,
      typeRoots: [
        join(backend, 'node_modules/@types'),
        join(backend, '../node_modules/@types'),
      ],
    },
    files: parsed.fileNames,
    include: [],
    exclude: [],
  }),
);
writeFileSync(
  nestconfig,
  JSON.stringify({
    sourceRoot: join(backend, 'src'),
    entryFile: 'backend/src/main',
    compilerOptions: { deleteOutDir: false, tsConfigPath: tsconfig },
  }),
);
const result = spawnSync(
  'npm',
  [
    'exec',
    '--',
    'nest',
    'build',
    '--config',
    relative(backend, nestconfig),
    '--path',
    relative(backend, tsconfig),
  ],
  { cwd: backend, stdio: 'inherit', env: process.env },
);
if (result.error || result.status !== 0) process.exitCode = result.status || 1;
else console.info(`Isolated Nest build output: ${output}`);
