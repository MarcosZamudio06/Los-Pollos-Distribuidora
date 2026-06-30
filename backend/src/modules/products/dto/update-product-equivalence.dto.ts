import { PartialType } from '@nestjs/swagger';
import { CreateProductEquivalenceDto } from './create-product-equivalence.dto';

export class UpdateProductEquivalenceDto extends PartialType(CreateProductEquivalenceDto) {}
