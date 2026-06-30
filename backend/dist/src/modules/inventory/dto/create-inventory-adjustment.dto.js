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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateInventoryAdjustmentDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const INVENTORY_ADJUSTMENT_TYPES = {
    IN: 'IN',
    OUT: 'OUT',
    ADJUSTMENT: 'ADJUSTMENT',
    SHRINKAGE: 'SHRINKAGE',
    RETURN: 'RETURN',
};
const PRODUCT_UNITS = {
    KG: 'KG',
    PIECE: 'PIECE',
    KG_AND_PIECE: 'KG_AND_PIECE',
};
class CreateInventoryAdjustmentDto {
    productId;
    locationId;
    type;
    unit;
    quantityKg;
    quantityPieces;
    reason;
    referenceType;
    referenceId;
    routeSettlementId;
    pointOfSaleDailyCloseId;
}
exports.CreateInventoryAdjustmentDto = CreateInventoryAdjustmentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "locationId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(INVENTORY_ADJUSTMENT_TYPES),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PRODUCT_UNITS),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "unit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateInventoryAdjustmentDto.prototype, "quantityKg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateInventoryAdjustmentDto.prototype, "quantityPieces", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "referenceType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "referenceId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "routeSettlementId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInventoryAdjustmentDto.prototype, "pointOfSaleDailyCloseId", void 0);
//# sourceMappingURL=create-inventory-adjustment.dto.js.map