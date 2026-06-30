"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const focused_test_guard_1 = require("./focused-test-guard");
describe('assertNoFocusedTests', () => {
    it('rejects focused Jest tests before the suite runs', () => {
        const readFile = jest
            .fn()
            .mockReturnValue(`describe.${'only'}("auth", () => {});`);
        const readdir = jest
            .fn()
            .mockReturnValue([
            { name: 'auth.spec.ts', isDirectory: () => false, isFile: () => true },
        ]);
        expect(() => (0, focused_test_guard_1.assertNoFocusedTests)({
            rootDir: 'src',
            readFile,
            readdir,
        })).toThrow('Focused Jest tests are not allowed');
    });
    it('allows normal Jest tests', () => {
        const readFile = jest.fn().mockReturnValue('it("runs", () => {});');
        const readdir = jest
            .fn()
            .mockReturnValue([
            { name: 'auth.spec.ts', isDirectory: () => false, isFile: () => true },
        ]);
        expect(() => (0, focused_test_guard_1.assertNoFocusedTests)({
            rootDir: 'src',
            readFile,
            readdir,
        })).not.toThrow();
    });
});
//# sourceMappingURL=focused-test-guard.spec.js.map