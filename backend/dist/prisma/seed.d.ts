import { PrismaClient } from '@prisma/client';
export declare const DEVELOPMENT_ADMIN_PASSWORD = "DevOnly-ChangeMe-2026!";
export declare const initialRoles: readonly [{
    readonly name: "ADMIN";
    readonly description: "System administrator with full access.";
}, {
    readonly name: "SELLER";
    readonly description: "Point-of-sale and sales operations user.";
}, {
    readonly name: "WAREHOUSE";
    readonly description: "Inventory and warehouse operations user.";
}, {
    readonly name: "DRIVER";
    readonly description: "Route delivery operations user.";
}, {
    readonly name: "COLLECTIONS";
    readonly description: "Accounts receivable and collections user.";
}];
export declare const initialAdminUser: {
    readonly name: "Development Admin";
    readonly email: "dev.admin@pollos.local";
    readonly isActive: true;
};
export declare const initialSeedLocation: {
    readonly name: "Development Main Location";
    readonly code: "DEV-MAIN";
    readonly type: "MIXED";
    readonly address: "Development-only operational location";
    readonly isActive: true;
};
export declare const initialCategories: readonly [{
    readonly name: "Base chicken products";
    readonly description: "Development/example seed data for base poultry catalog items.";
}, {
    readonly name: "Cuts";
    readonly description: "Development/example seed data for poultry cuts.";
}, {
    readonly name: "Prepared products";
    readonly description: "Development/example seed data for prepared poultry products.";
}];
export declare const initialProducts: readonly [{
    readonly name: "Whole chicken by kg";
    readonly sku: "DEV-WHOLE-CHICKEN-KG";
    readonly description: "Development/example seed data. Not a production price list.";
    readonly categoryName: "Base chicken products";
    readonly presentationType: "WHOLE";
    readonly unit: "KG";
    readonly salePrice: "58.00";
    readonly purchaseCost: "42.00";
    readonly minStock: "10.000";
}, {
    readonly name: "Chicken breast by kg";
    readonly sku: "DEV-BREAST-KG";
    readonly description: "Development/example seed data. Not a production price list.";
    readonly categoryName: "Cuts";
    readonly presentationType: "CUT";
    readonly unit: "KG";
    readonly salePrice: "95.00";
    readonly purchaseCost: "70.00";
    readonly minStock: "5.000";
}, {
    readonly name: "Chicken wings by piece";
    readonly sku: "DEV-WINGS-PIECE";
    readonly description: "Development/example seed data. Not a production price list.";
    readonly categoryName: "Cuts";
    readonly presentationType: "CUT";
    readonly unit: "PIECE";
    readonly salePrice: "12.00";
    readonly purchaseCost: "8.00";
    readonly minStock: "20.000";
}];
type PasswordResolutionInput = {
    env: {
        SEED_ADMIN_PASSWORD?: string;
    };
    nodeEnv?: string;
};
type PasswordResolution = {
    password: string;
    source: 'env' | 'development-only';
};
export declare function getInitialAdminPassword({ env, nodeEnv, }: PasswordResolutionInput): PasswordResolution;
export declare function seed(prisma: PrismaClient): Promise<void>;
export {};
