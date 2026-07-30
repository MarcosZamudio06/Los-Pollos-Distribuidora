import { ArrayUnique, IsArray, IsInt, IsString, Min, MinLength } from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys!: string[];

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(3)
  reason!: string;
}
