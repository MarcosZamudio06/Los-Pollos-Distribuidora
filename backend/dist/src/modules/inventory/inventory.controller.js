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
exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const dto_1 = require("./dto");
const inventory_service_1 = require("./inventory.service");
let InventoryController = class InventoryController {
    inventoryService;
    constructor(inventoryService) {
        this.inventoryService = inventoryService;
    }
    async createAdjustment(body, user) {
        return {
            success: true,
            message: 'Inventory adjustment registered successfully',
            data: await this.inventoryService.createAdjustment(body, user.id),
        };
    }
    async findMovements(query) {
        return {
            success: true,
            message: 'Inventory movements retrieved successfully',
            data: await this.inventoryService.findMovements(query),
        };
    }
};
exports.InventoryController = InventoryController;
__decorate([
    (0, common_1.Post)('adjustments'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateInventoryAdjustmentDto, Object]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "createAdjustment", null);
__decorate([
    (0, common_1.Get)('movements'),
    (0, roles_decorator_1.Roles)('ADMIN', 'WAREHOUSE'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.ListInventoryMovementsQueryDto]),
    __metadata("design:returntype", Promise)
], InventoryController.prototype, "findMovements", null);
exports.InventoryController = InventoryController = __decorate([
    (0, common_1.Controller)('inventory'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __metadata("design:paramtypes", [inventory_service_1.InventoryService])
], InventoryController);
//# sourceMappingURL=inventory.controller.js.map