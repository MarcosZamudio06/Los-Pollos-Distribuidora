import type { EquivalentStatus, ProductUnit } from '@prisma/client';
export declare class ListProductEquivalencesQueryDto {
    status?: EquivalentStatus;
    unitFrom?: ProductUnit;
    unitTo?: ProductUnit;
    date?: string;
}
