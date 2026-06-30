"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const list_users_query_dto_1 = require("./list-users-query.dto");
async function validateQuery(value) {
    const dto = (0, class_transformer_1.plainToInstance)(list_users_query_dto_1.ListUsersQueryDto, value);
    const errors = await (0, class_validator_1.validate)(dto);
    return { dto, errors };
}
describe('ListUsersQueryDto', () => {
    it('accepts includeInactive as boolean or true/false strings only', async () => {
        await expect(validateQuery({ includeInactive: true })).resolves.toMatchObject({
            dto: { includeInactive: true },
            errors: [],
        });
        await expect(validateQuery({ includeInactive: 'false' })).resolves.toMatchObject({
            dto: { includeInactive: false },
            errors: [],
        });
        const invalid = await validateQuery({ includeInactive: 'maybe' });
        expect(invalid.dto.includeInactive).toBe('maybe');
        expect(invalid.errors).toHaveLength(1);
    });
});
//# sourceMappingURL=list-users-query.dto.spec.js.map