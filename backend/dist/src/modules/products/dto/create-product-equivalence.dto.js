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
exports.CreateProductEquivalenceDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const PRODUCT_EQUIVALENCE_UNITS = {
    KG: 'KG',
    PIECE: 'PIECE',
};
const EQUIVALENT_STATUSES = {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
};
class CreateProductEquivalenceDto {
    unitFrom;
    unitTo;
    factor;
    roundingMode;
    effectiveFrom;
    effectiveTo;
    status;
}
exports.CreateProductEquivalenceDto = CreateProductEquivalenceDto;
__decorate([
    (0, class_validator_1.IsEnum)(PRODUCT_EQUIVALENCE_UNITS),
    __metadata("design:type", String)
], CreateProductEquivalenceDto.prototype, "unitFrom", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(PRODUCT_EQUIVALENCE_UNITS),
    __metadata("design:type", String)
], CreateProductEquivalenceDto.prototype, "unitTo", void 0);
__decorate([
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.IsPositive)(),
    __metadata("design:type", Number)
], CreateProductEquivalenceDto.prototype, "factor", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateProductEquivalenceDto.prototype, "roundingMode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], CreateProductEquivalenceDto.prototype, "effectiveFrom", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], CreateProductEquivalenceDto.prototype, "effectiveTo", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(EQUIVALENT_STATUSES),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateProductEquivalenceDto.prototype, "status", void 0);
//# sourceMappingURL=create-product-equivalence.dto.js.map