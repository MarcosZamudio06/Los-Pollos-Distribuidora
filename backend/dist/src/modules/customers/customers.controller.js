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
exports.CustomersController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const dto_1 = require("./dto");
const customers_service_1 = require("./customers.service");
let CustomersController = class CustomersController {
    customersService;
    constructor(customersService) {
        this.customersService = customersService;
    }
    async findAll(query) {
        return {
            success: true,
            message: 'Customers retrieved successfully',
            data: await this.customersService.findAll(query),
        };
    }
    async getCreditSummary(id) {
        return {
            success: true,
            message: 'Customer credit summary retrieved successfully',
            data: await this.customersService.getCreditSummary(id),
        };
    }
    async findSales(id, query) {
        return {
            success: true,
            message: 'Customer sales retrieved successfully',
            data: await this.customersService.findSales(id, query),
        };
    }
    async findPayments(id, query) {
        return {
            success: true,
            message: 'Customer payments retrieved successfully',
            data: await this.customersService.findPayments(id, query),
        };
    }
    async findOne(id) {
        return {
            success: true,
            message: 'Customer retrieved successfully',
            data: await this.customersService.findOne(id),
        };
    }
    async create(body, currentUser) {
        return {
            success: true,
            message: 'Customer created successfully',
            data: await this.customersService.create(body, currentUser),
        };
    }
    async update(id, body, currentUser) {
        return {
            success: true,
            message: 'Customer updated successfully',
            data: await this.customersService.update(id, body, currentUser),
        };
    }
    async deactivate(id) {
        return {
            success: true,
            message: 'Customer deactivated successfully',
            data: await this.customersService.deactivate(id),
        };
    }
};
exports.CustomersController = CustomersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER', 'COLLECTIONS'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.ListCustomersQueryDto]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id/credit-summary'),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER', 'COLLECTIONS'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "getCreditSummary", null);
__decorate([
    (0, common_1.Get)(':id/sales'),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER', 'COLLECTIONS'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ListCustomerSalesQueryDto]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "findSales", null);
__decorate([
    (0, common_1.Get)(':id/payments'),
    (0, roles_decorator_1.Roles)('ADMIN', 'COLLECTIONS'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ListCustomerPaymentsQueryDto]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "findPayments", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER', 'COLLECTIONS'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateCustomerDto, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN', 'SELLER'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.UpdateCustomerDto, Object]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CustomersController.prototype, "deactivate", null);
exports.CustomersController = CustomersController = __decorate([
    (0, common_1.Controller)('customers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [customers_service_1.CustomersService])
], CustomersController);
//# sourceMappingURL=customers.controller.js.map