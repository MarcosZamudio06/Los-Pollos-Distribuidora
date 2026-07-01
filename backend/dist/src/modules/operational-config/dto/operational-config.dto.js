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
exports.UpdateOperationalConfigDto = exports.CreateOperationalConfigDto = exports.ListOperationalConfigQueryDto = exports.OPERATIONAL_CONFIG_SCOPES = exports.OPERATIONAL_CONFIG_VALUE_TYPES = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.OPERATIONAL_CONFIG_VALUE_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'JSON'];
exports.OPERATIONAL_CONFIG_SCOPES = ['GLOBAL', 'LOCATION', 'ROLE'];
function trimString({ value }) {
    return typeof value === 'string' ? value.trim() : value;
}
function parseBoolean({ value }) {
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return value;
}
class ListOperationalConfigQueryDto {
    page;
    limit;
    key;
    scope;
    locationId;
    isActive;
}
exports.ListOperationalConfigQueryDto = ListOperationalConfigQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListOperationalConfigQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListOperationalConfigQueryDto.prototype, "limit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListOperationalConfigQueryDto.prototype, "key", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsIn)(exports.OPERATIONAL_CONFIG_SCOPES),
    __metadata("design:type", String)
], ListOperationalConfigQueryDto.prototype, "scope", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListOperationalConfigQueryDto.prototype, "locationId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(parseBoolean),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ListOperationalConfigQueryDto.prototype, "isActive", void 0);
class CreateOperationalConfigDto {
    key;
    value;
    valueType;
    scope;
    locationId;
    description;
    effectiveFrom;
    effectiveTo;
    isActive;
}
exports.CreateOperationalConfigDto = CreateOperationalConfigDto;
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "key", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "value", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsIn)(exports.OPERATIONAL_CONFIG_VALUE_TYPES),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "valueType", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsIn)(exports.OPERATIONAL_CONFIG_SCOPES),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "scope", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateOperationalConfigDto.prototype, "locationId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "description", void 0);
__decorate([
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateOperationalConfigDto.prototype, "effectiveFrom", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], CreateOperationalConfigDto.prototype, "effectiveTo", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateOperationalConfigDto.prototype, "isActive", void 0);
class UpdateOperationalConfigDto {
    key;
    value;
    valueType;
    scope;
    locationId;
    description;
    effectiveFrom;
    effectiveTo;
    isActive;
}
exports.UpdateOperationalConfigDto = UpdateOperationalConfigDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "key", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "value", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsIn)(exports.OPERATIONAL_CONFIG_VALUE_TYPES),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "valueType", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsIn)(exports.OPERATIONAL_CONFIG_SCOPES),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "scope", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateOperationalConfigDto.prototype, "locationId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateOperationalConfigDto.prototype, "effectiveFrom", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(trimString),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", Object)
], UpdateOperationalConfigDto.prototype, "effectiveTo", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateOperationalConfigDto.prototype, "isActive", void 0);
//# sourceMappingURL=operational-config.dto.js.map