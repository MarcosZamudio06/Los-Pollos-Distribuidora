"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const product_equivalences_controller_1 = require("./product-equivalences.controller");
const products_controller_1 = require("./products.controller");
const product_equivalences_service_1 = require("./product-equivalences.service");
const products_service_1 = require("./products.service");
let ProductsModule = class ProductsModule {
};
exports.ProductsModule = ProductsModule;
exports.ProductsModule = ProductsModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [products_controller_1.ProductsController, product_equivalences_controller_1.ProductEquivalencesController],
        providers: [products_service_1.ProductsService, product_equivalences_service_1.ProductEquivalencesService],
        exports: [products_service_1.ProductsService, product_equivalences_service_1.ProductEquivalencesService],
    })
], ProductsModule);
//# sourceMappingURL=products.module.js.map