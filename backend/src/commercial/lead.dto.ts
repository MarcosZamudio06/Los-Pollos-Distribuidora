import {
  Equals,
  IsEmail,
  IsIn,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class LeadDto {
  @IsString() @Matches(/\S/) @MaxLength(100) name!: string;
  @IsString() @Matches(/\S/) @MaxLength(160) company!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MaxLength(40) @Matches(/^[0-9+() .-]*$/) phone = '';
  @IsIn(['', 'ventas', 'inventario', 'logistica', 'cobranza', 'erp']) interest =
    '';
  @IsString() @MaxLength(2000) message = '';
  @Equals(true) consent!: boolean;
  @Equals('') website = '';
  @Equals('landing-demo') source!: string;
  @IsString() @MaxLength(80) consentVersion!: string;
}
