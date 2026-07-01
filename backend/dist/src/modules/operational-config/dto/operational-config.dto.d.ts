export declare const OPERATIONAL_CONFIG_VALUE_TYPES: readonly ["STRING", "NUMBER", "BOOLEAN", "JSON"];
export declare const OPERATIONAL_CONFIG_SCOPES: readonly ["GLOBAL", "LOCATION", "ROLE"];
export declare class ListOperationalConfigQueryDto {
    page?: number;
    limit?: number;
    key?: string;
    scope?: string;
    locationId?: string;
    isActive?: boolean;
}
export declare class CreateOperationalConfigDto {
    key: string;
    value: string;
    valueType: string;
    scope: string;
    locationId?: string | null;
    description?: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isActive?: boolean;
}
export declare class UpdateOperationalConfigDto {
    key?: string;
    value?: string;
    valueType?: string;
    scope?: string;
    locationId?: string | null;
    description?: string;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    isActive?: boolean;
}
