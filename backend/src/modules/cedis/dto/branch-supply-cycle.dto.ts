import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmpty,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateInventoryTransferItemDto } from '../../inventory/dto/create-inventory-transfer.dto';

export class OpenBranchSupplyCycleDto {
  @IsString()
  @IsNotEmpty()
  distributionCenterLocationId!: string;

  @IsString()
  @IsNotEmpty()
  branchLocationId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  businessDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BranchSupplyCycleItemDto extends CreateInventoryTransferItemDto {}

export class BranchSupplyCycleCommandDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  assignedDriverId!: string;

  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  /** Coordinates belong to the canonical OperationalLocation records. */
  @IsEmpty({ message: 'latitude is server-controlled' })
  latitude?: never;

  @IsEmpty({ message: 'longitude is server-controlled' })
  longitude?: never;

  @IsOptional()
  @IsString()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => BranchSupplyCycleItemDto)
  @ArrayMinSize(1)
  items!: BranchSupplyCycleItemDto[];
}

export class RefreshBranchSupplyCycleDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CloseBranchSupplyCycleDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ReopenBranchSupplyCycleDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}

export class CancelBranchSupplyCycleDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason!: string;
}
