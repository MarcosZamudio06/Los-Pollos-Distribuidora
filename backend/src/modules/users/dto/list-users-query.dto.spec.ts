import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListUsersQueryDto } from './list-users-query.dto';

async function validateQuery(value: Record<string, unknown>) {
  const dto = plainToInstance(ListUsersQueryDto, value);
  const errors = await validate(dto);

  return { dto, errors };
}

describe('ListUsersQueryDto', () => {
  it('accepts includeInactive as boolean or true/false strings only', async () => {
    await expect(
      validateQuery({ includeInactive: true }),
    ).resolves.toMatchObject({
      dto: { includeInactive: true },
      errors: [],
    });
    await expect(
      validateQuery({ includeInactive: 'false' }),
    ).resolves.toMatchObject({
      dto: { includeInactive: false },
      errors: [],
    });

    const invalid = await validateQuery({ includeInactive: 'maybe' });
    expect(invalid.dto.includeInactive).toBe('maybe');
    expect(invalid.errors).toHaveLength(1);
  });
});
