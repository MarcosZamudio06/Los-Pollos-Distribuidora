"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNoFocusedTests = assertNoFocusedTests;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const IGNORED_DIRECTORIES = new Set(['coverage', 'dist', 'node_modules']);
const TEST_FILE_PATTERN = /\.(spec|e2e-spec)\.ts$/;
const FOCUSED_JEST_PATTERN = /\b(?:describe|it|test)\.only\s*\(/;
function assertNoFocusedTests({ rootDir, readFile = (path) => (0, node_fs_1.readFileSync)(path, 'utf8'), readdir = (path) => (0, node_fs_1.readdirSync)(path, { withFileTypes: true }), }) {
    const focusedTestFiles = collectTestFiles(rootDir, readdir).filter((file) => FOCUSED_JEST_PATTERN.test(readFile(file)));
    if (focusedTestFiles.length > 0) {
        throw new Error([
            'Focused Jest tests are not allowed. Remove .only from:',
            ...focusedTestFiles.map((file) => `- ${file}`),
        ].join('\n'));
    }
}
function collectTestFiles(currentPath, readdir) {
    const entries = readdir(currentPath);
    return entries.flatMap((entry) => {
        const entryPath = (0, node_path_1.join)(currentPath, entry.name);
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
//# sourceMappingURL=focused-test-guard.js.map