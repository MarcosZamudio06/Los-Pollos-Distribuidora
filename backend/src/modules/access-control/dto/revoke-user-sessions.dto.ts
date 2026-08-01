import { IsString, MinLength } from 'class-validator';

export class RevokeUserSessionsDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
