import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListLocationsQueryDto } from './list-locations-query.dto';

async function validateQuery(value: Record<string, unknown>) {
  const dto = plainToInstance(ListLocationsQueryDto, value);
  const errors = await validate(dto);

  return { dto, errors };
}

describe('ListLocationsQueryDto', () => {
  it('accepts inventoryStorageOnly as a boolean or true/false string', async () => {
    await expect(
      validateQuery({ inventoryStorageOnly: true }),
    ).resolves.toMatchObject({
      dto: { inventoryStorageOnly: true },
      errors: [],
    });
    await expect(
      validateQuery({ inventoryStorageOnly: 'false' }),
    ).resolves.toMatchObject({
      dto: { inventoryStorageOnly: false },
      errors: [],
    });

    const invalid = await validateQuery({ inventoryStorageOnly: 'maybe' });
    expect(invalid.dto.inventoryStorageOnly).toBe('maybe');
    expect(invalid.errors).toHaveLength(1);
  });
});
