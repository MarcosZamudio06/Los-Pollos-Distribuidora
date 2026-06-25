"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = require("node:path");
const focused_test_guard_1 = require("../src/testing/focused-test-guard");
(0, focused_test_guard_1.assertNoFocusedTests)({ rootDir: (0, node_path_1.join)(process.cwd(), 'src') });
(0, focused_test_guard_1.assertNoFocusedTests)({ rootDir: (0, node_path_1.join)(process.cwd(), 'test') });
//# sourceMappingURL=forbid-focused-tests.js.map