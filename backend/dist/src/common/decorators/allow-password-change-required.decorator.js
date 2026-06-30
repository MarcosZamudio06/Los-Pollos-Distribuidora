"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AllowPasswordChangeRequired = exports.ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = 'allowPasswordChangeRequired';
const AllowPasswordChangeRequired = () => (0, common_1.SetMetadata)(exports.ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
exports.AllowPasswordChangeRequired = AllowPasswordChangeRequired;
//# sourceMappingURL=allow-password-change-required.decorator.js.map