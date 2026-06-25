import { Dirent } from 'node:fs';
type FileSystemEntry = Pick<Dirent, 'isDirectory' | 'isFile' | 'name'>;
type FocusedTestGuardOptions = {
    rootDir: string;
    readFile?: (path: string) => string;
    readdir?: (path: string) => FileSystemEntry[];
};
export declare function assertNoFocusedTests({ rootDir, readFile, readdir, }: FocusedTestGuardOptions): void;
export {};
