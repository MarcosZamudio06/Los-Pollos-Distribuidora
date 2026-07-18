import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateCommercialPolicyDto, OverdueBlockingMode } from './commercial-policy.dto';

describe('CreateCommercialPolicyDto', () => {
  it('accepts canonical overdue blocking modes and rejects arbitrary strings', async () => {
    const valid = Object.assign(new CreateCommercialPolicyDto(), { overdueBlockingMode: OverdueBlockingMode.BLOCK_NEW_CREDIT });
    const invalid = Object.assign(new CreateCommercialPolicyDto(), { overdueBlockingMode: 'BLOCK' });

    expect((await validate(valid)).filter((error) => error.property === 'overdueBlockingMode')).toHaveLength(0);
    expect((await validate(invalid)).find((error) => error.property === 'overdueBlockingMode')?.constraints).toHaveProperty('isEnum');
  });
});
