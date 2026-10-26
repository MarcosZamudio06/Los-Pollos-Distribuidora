// Test-process safety: never load workstation dotenv files, including Prisma CLI.
const fs = require('node:fs');
const read = fs.readFileSync;
const exists = fs.existsSync;
const isDotenv = (path) => /(^|[/\\])\.env(?:\.[^/\\]*)?$/.test(String(path));
fs.existsSync = (path) => !isDotenv(path) && exists.call(fs, path);
fs.readFileSync = function (path, ...args) {
  if (/(^|[/\\])\.env(?:\.[^/\\]*)?$/.test(String(path))) {
    const error = new Error(
      'Local dotenv files are disabled in isolated tests',
    );
    error.code = 'ENOENT';
    throw error;
  }
  return read.call(this, path, ...args);
};

// Keep named ESM filesystem imports subject to the same test-only restriction.
const readAsync = fs.readFile;
fs.readFile = function (path, ...args) {
  if (isDotenv(path)) {
    const error = Object.assign(
      new Error('Local dotenv files are disabled in isolated tests'),
      { code: 'ENOENT' },
    );
    const callback = args[args.length - 1];
    queueMicrotask(() => callback(error));
    return;
  }
  return readAsync.call(this, path, ...args);
};
const readPromise = fs.promises.readFile;
fs.promises.readFile = async function (path, ...args) {
  if (isDotenv(path))
    throw Object.assign(
      new Error('Local dotenv files are disabled in isolated tests'),
      { code: 'ENOENT' },
    );
  return readPromise.call(this, path, ...args);
};
require('node:module').syncBuiltinESMExports();
