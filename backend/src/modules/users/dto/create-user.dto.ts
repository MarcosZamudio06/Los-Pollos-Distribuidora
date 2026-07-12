import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  roleId!: string;

  @IsString()
  @IsNotEmpty()
  operationalLocationId!: string;

  @IsString()
  @Matches(/^\+?[0-9][0-9\s-]{6,19}$/)
  phone!: string;
}
