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
exports.ProductEquivalencesController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const dto_1 = require("./dto");
const product_equivalences_service_1 = require("./product-equivalences.service");
let ProductEquivalencesController = class ProductEquivalencesController {
    productEquivalencesService;
    constructor(productEquivalencesService) {
        this.productEquivalencesService = productEquivalencesService;
    }
    async findAll(productId, query) {
        return { success: true, message: 'Product equivalences retrieved successfully', data: await this.productEquivalencesService.findAll(productId, query) };
    }
    async create(productId, user, body) {
        return { success: true, message: 'Product equivalence created successfully', data: await this.productEquivalencesService.create(productId, user.id, body) };
    }
    async update(id, user, body) {
        return { success: true, message: 'Product equivalence updated successfully', data: await this.productEquivalencesService.update(id, user.id, body) };
    }
    async activate(id, user) {
        return { success: true, message: 'Product equivalence activated successfully', data: await this.productEquivalencesService.activate(id, user.id) };
    }
    async deactivate(id) {
        return { success: true, message: 'Product equivalence deactivated successfully', data: await this.productEquivalencesService.deactivate(id) };
    }
};
exports.ProductEquivalencesController = ProductEquivalencesController;
__decorate([
    (0, common_1.Get)('products/:productId/equivalences'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE', 'SELLER'),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.ListProductEquivalencesQueryDto]),
    __metadata("design:returntype", Promise)
], ProductEquivalencesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('products/:productId/equivalences'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, dto_1.CreateProductEquivalenceDto]),
    __metadata("design:returntype", Promise)
], ProductEquivalencesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('product-equivalences/:id'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, dto_1.UpdateProductEquivalenceDto]),
    __metadata("design:returntype", Promise)
], ProductEquivalencesController.prototype, "update", null);
__decorate([
    (0, common_1.Post)('product-equivalences/:id/activate'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ProductEquivalencesController.prototype, "activate", null);
__decorate([
    (0, common_1.Post)('product-equivalences/:id/deactivate'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ProductEquivalencesController.prototype, "deactivate", null);
exports.ProductEquivalencesController = ProductEquivalencesController = __decorate([
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [product_equivalences_service_1.ProductEquivalencesService])
], ProductEquivalencesController);
//# sourceMappingURL=product-equivalences.controller.js.map