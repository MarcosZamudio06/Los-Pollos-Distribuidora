import { join } from 'node:path';
import { assertNoFocusedTests } from '../src/testing/focused-test-guard';

assertNoFocusedTests({ rootDir: join(process.cwd(), 'src') });
assertNoFocusedTests({ rootDir: join(process.cwd(), 'test') });
