import { type TransformFnParams } from 'class-transformer';
import type { OperationalLocationType } from '@prisma/client';
export declare const OPERATIONAL_LOCATION_TYPES: {
    readonly BRANCH: "BRANCH";
    readonly WAREHOUSE: "WAREHOUSE";
    readonly MIXED: "MIXED";
    readonly EXTERNAL_POINT_OF_SALE: "EXTERNAL_POINT_OF_SALE";
    readonly ROUTE_STOCK: "ROUTE_STOCK";
};
export declare function trimString({ value }: TransformFnParams): unknown;
export declare class CreateLocationDto {
    name: string;
    code?: string;
    type: OperationalLocationType;
    parentId?: string;
    address?: string;
}
