"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Roles = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
const authenticated_decorator_1 = require("./authenticated.decorator");
exports.ROLES_KEY = 'roles';
const Roles = (...roles) => (0, common_1.applyDecorators)((0, authenticated_decorator_1.Authenticated)(), (0, common_1.SetMetadata)(exports.ROLES_KEY, roles));
exports.Roles = Roles;
//# sourceMappingURL=roles.decorator.js.map