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
exports.CreateInventoryTransferDto = exports.CreateInventoryTransferItemDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const PRODUCT_UNITS = {
    KG: 'KG',
    PIECE: 'PIECE',
    KG_AND_PIECE: 'KG_AND_PIECE',
};
let TransferItemQuantityConstraint = class TransferItemQuantityConstraint {
    validate(_value, args) {
        const item = args.object;
        const quantityKg = item.quantityKg ?? 0;
        const quantityPieces = item.quantityPieces ?? 0;
        if (item.unit === PRODUCT_UNITS.KG) {
            return quantityKg > 0 && quantityPieces === 0;
        }
        if (item.unit === PRODUCT_UNITS.PIECE) {
            return quantityPieces > 0 && quantityKg === 0;
        }
        if (item.unit === PRODUCT_UNITS.KG_AND_PIECE) {
            return quantityKg > 0 || quantityPieces > 0;
        }
        return false;
    }
    defaultMessage() {
        return 'Each transfer item requires quantityKg, quantityPieces, or both according to unit';
    }
};
TransferItemQuantityConstraint = __decorate([
    (0, class_validator_1.ValidatorConstraint)({ name: 'transferItemQuantity', async: false })
], TransferItemQuantityConstraint);
class CreateInventoryTransferItemDto {
    productId;
    unit;
    quantityKg;
    quantityPieces;
}
exports.CreateInventoryTransferItemDto = CreateInventoryTransferItemDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    (0, class_validator_1.Validate)(TransferItemQuantityConstraint),
    __metadata("design:type", String)
], CreateInventoryTransferItemDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PRODUCT_UNITS),
    __metadata("design:type", String)
], CreateInventoryTransferItemDto.prototype, "unit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateInventoryTransferItemDto.prototype, "quantityKg", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], CreateInventoryTransferItemDto.prototype, "quantityPieces", void 0);
class CreateInventoryTransferDto {
    originLocationId;
    destinationLocationId;
    notes;
    items;
}
exports.CreateInventoryTransferDto = CreateInventoryTransferDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateInventoryTransferDto.prototype, "originLocationId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateInventoryTransferDto.prototype, "destinationLocationId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateInventoryTransferDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateInventoryTransferItemDto),
    __metadata("design:type", Array)
], CreateInventoryTransferDto.prototype, "items", void 0);
//# sourceMappingURL=create-inventory-transfer.dto.js.map