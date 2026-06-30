import { CreateLocationDto } from './create-location.dto';
declare const UpdateLocationDto_base: import("@nestjs/common").Type<Partial<CreateLocationDto>>;
export declare class UpdateLocationDto extends UpdateLocationDto_base {
    isActive?: boolean;
}
export {};
