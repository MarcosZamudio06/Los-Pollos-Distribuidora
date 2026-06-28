import { Transform, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export type UserStatusFilter = 'active' | 'inactive' | 'all';

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: UserStatusFilter;

  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    const rawValue = value as unknown;

    if (rawValue === true || rawValue === false) {
      return rawValue;
    }

    if (rawValue === 'true') {
      return true;
    }

    if (rawValue === 'false') {
      return false;
    }

    return rawValue;
  })
  @IsBoolean()
  includeInactive?: boolean;
}
