import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangeOwnPasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  newPassword!: string;
}
