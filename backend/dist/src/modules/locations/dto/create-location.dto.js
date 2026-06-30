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
exports.CreateLocationDto = exports.OPERATIONAL_LOCATION_TYPES = void 0;
exports.trimString = trimString;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.OPERATIONAL_LOCATION_TYPES = {
    BRANCH: 'BRANCH',
    WAREHOUSE: 'WAREHOUSE',
    MIXED: 'MIXED',
    EXTERNAL_POINT_OF_SALE: 'EXTERNAL_POINT_OF_SALE',
    ROUTE_STOCK: 'ROUTE_STOCK',
};
function trimString({ value }) {
    return typeof value === 'string' ? value.trim() : value;
}
class CreateLocationDto {
    name;
    code;
    type;
    parentId;
    address;
}
exports.CreateLocationDto = CreateLocationDto;
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "code", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(exports.OPERATIONAL_LOCATION_TYPES),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "type", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "parentId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateLocationDto.prototype, "address", void 0);
//# sourceMappingURL=create-location.dto.js.map