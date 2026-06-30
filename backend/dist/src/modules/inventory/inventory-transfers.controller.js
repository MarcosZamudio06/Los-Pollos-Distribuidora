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
exports.InventoryTransfersController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const dto_1 = require("./dto");
const inventory_transfers_service_1 = require("./inventory-transfers.service");
let InventoryTransfersController = class InventoryTransfersController {
    inventoryTransfersService;
    constructor(inventoryTransfersService) {
        this.inventoryTransfersService = inventoryTransfersService;
    }
    async findAll(query) {
        return {
            success: true,
            message: 'Inventory transfers retrieved successfully',
            data: await this.inventoryTransfersService.findAll(query),
        };
    }
    async findOne(id) {
        return {
            success: true,
            message: 'Inventory transfer retrieved successfully',
            data: await this.inventoryTransfersService.findOne(id),
        };
    }
    async create(body, user, idempotencyKey) {
        return {
            success: true,
            message: 'Inventory transfer created successfully',
            data: await (idempotencyKey
                ? this.inventoryTransfersService.create(body, user.id, idempotencyKey)
                : this.inventoryTransfersService.create(body, user.id)),
        };
    }
    async confirm(id, user, idempotencyKey) {
        return {
            success: true,
            message: 'Inventory transfer confirmed successfully',
            data: await (idempotencyKey
                ? this.inventoryTransfersService.confirm(id, user.id, idempotencyKey)
                : this.inventoryTransfersService.confirm(id, user.id)),
        };
    }
    async cancel(id, body, user, idempotencyKey) {
        return {
            success: true,
            message: 'Inventory transfer cancelled successfully',
            data: await (idempotencyKey
                ? this.inventoryTransfersService.cancel(id, body, user.id, idempotencyKey)
                : this.inventoryTransfersService.cancel(id, body, user.id)),
        };
    }
};
exports.InventoryTransfersController = InventoryTransfersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.ListInventoryTransfersQueryDto]),
    __metadata("design:returntype", Promise)
], InventoryTransfersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InventoryTransfersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('Idempotency-Key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateInventoryTransferDto, Object, String]),
    __metadata("design:returntype", Promise)
], InventoryTransfersController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('Idempotency-Key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], InventoryTransfersController.prototype, "confirm", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Headers)('Idempotency-Key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, dto_1.CancelInventoryTransferDto, Object, String]),
    __metadata("design:returntype", Promise)
], InventoryTransfersController.prototype, "cancel", null);
exports.InventoryTransfersController = InventoryTransfersController = __decorate([
    (0, common_1.Controller)('inventory-transfers'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inventory_transfers_service_1.InventoryTransfersService])
], InventoryTransfersController);
//# sourceMappingURL=inventory-transfers.controller.js.map