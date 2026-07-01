"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OperationalConfigController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const dto_1 = require("./dto");
const operational_config_service_1 = require("./operational-config.service");
let OperationalConfigController = class OperationalConfigController {
    service;
    constructor(service) {
        this.service = service;
    }
    async findAll(query) {
        return { success: true, message: 'Operational config retrieved successfully', data: await this.service.findAll(query) };
    }
    async create(body, currentUser) {
        return { success: true, message: 'Operational config created successfully', data: await this.service.create(body, currentUser) };
    }
    async update(id, body, currentUser) {
        return { success: true, message: 'Operational config updated successfully', data: await this.service.update(id, body, currentUser) };
    }
    async deactivate(id, currentUser) {
        return { success: true, message: 'Operational config deactivated successfully', data: await this.service.deactivate(id, currentUser) };
    }
};
exports.OperationalConfigController = OperationalConfigController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.ListOperationalConfigQueryDto]),
    __metadata("design:returntype", Promise)
], OperationalConfigController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateOperationalConfigDto, Object]),
    __metadata("design:returntype", Promise)
], OperationalConfigController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateOperationalConfigDto, Object]),
    __metadata("design:returntype", Promise)
], OperationalConfigController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OperationalConfigController.prototype, "deactivate", null);
exports.OperationalConfigController = OperationalConfigController = __decorate([
    (0, common_1.Controller)('operational-config'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [operational_config_service_1.OperationalConfigService])
], OperationalConfigController);
//# sourceMappingURL=operational-config.controller.js.map