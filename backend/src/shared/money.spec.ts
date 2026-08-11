import {
  hasSubCentPrecision,
  Money,
  isMoneyString,
  toMoneyString,
} from '../../../shared/money';

describe('Money', () => {
  it('does not use binary floating point for addition', () => {
    expect(Money.from('0.10').add('0.20').toString()).toBe('0.30');
  });

  it('rounds half up at the monetary boundary', () => {
    expect(Money.from('10.005').toString()).toBe('10.01');
    expect(Money.from('10.004').toString()).toBe('10.00');
  });

  it('multiplies decimal quantities without converting through number', () => {
    expect(Money.from('125.55').multiply('2.4').toString()).toBe('301.32');
  });

  it('allocates a discount while preserving the original cents', () => {
    const allocations = Money.from('0.01').allocate(['1.00', '1.00']);

    expect(allocations.map((value) => value.toString())).toEqual([
      '0.01',
      '0.00',
    ]);
    expect(Money.sum(allocations).toString()).toBe('0.01');
  });

  it('allocates a full 100 percent discount without exceeding item amounts', () => {
    const allocations = Money.from('100.00').allocate(['33.34', '66.66']);

    expect(allocations.map((value) => value.toString())).toEqual([
      '33.34',
      '66.66',
    ]);
    expect(Money.sum(allocations).toString()).toBe('100.00');
  });

  it('serializes canonical monetary strings', () => {
    expect(toMoneyString('12')).toBe('12.00');
    expect(isMoneyString('12.00')).toBe(true);
    expect(isMoneyString('12')).toBe(false);
  });

  it('detects values that cannot be represented exactly in cents', () => {
    expect(hasSubCentPrecision('10.004')).toBe(true);
    expect(hasSubCentPrecision('10.000')).toBe(false);
    expect(hasSubCentPrecision('10.00')).toBe(false);
  });
});
