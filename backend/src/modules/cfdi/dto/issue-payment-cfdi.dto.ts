import { Type } from 'class-transformer';
import { IsEmpty, IsInt, Min } from 'class-validator';

export class IssuePaymentCfdiDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  uuid?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  seals?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  tfd?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  total?: never;
  @IsEmpty({ message: 'SERVER_OWNED_FISCAL_FIELD' })
  relatedDocuments?: never;
}
