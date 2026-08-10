import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListProductsQueryDto } from './list-products-query.dto';

async function validateQuery(value: Record<string, unknown>) {
  const dto = plainToInstance(ListProductsQueryDto, value);
  const errors = await validate(dto);

  return { dto, errors };
}

describe('ListProductsQueryDto', () => {
  it('accepts requireInventoryBalance as a boolean or true/false string', async () => {
    await expect(
      validateQuery({ requireInventoryBalance: true }),
    ).resolves.toMatchObject({
      dto: { requireInventoryBalance: true },
      errors: [],
    });
    await expect(
      validateQuery({ requireInventoryBalance: 'false' }),
    ).resolves.toMatchObject({
      dto: { requireInventoryBalance: false },
      errors: [],
    });

    const invalid = await validateQuery({ requireInventoryBalance: 'maybe' });
    expect(invalid.dto.requireInventoryBalance).toBe('maybe');
    expect(invalid.errors).toHaveLength(1);
  });
});
