import { IsOptional, IsString } from 'class-validator';

export class DeactivateUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
