import { IsString, MinLength } from 'class-validator';

export class UpdateUserAccessProfileDto {
  @IsString()
  roleId!: string;

  @IsString()
  expectedRoleId!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
