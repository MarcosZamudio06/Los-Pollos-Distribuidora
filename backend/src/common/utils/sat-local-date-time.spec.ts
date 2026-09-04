import { formatSatLocalDateTime } from './sat-local-date-time';

describe('formatSatLocalDateTime', () => {
  it('converts an unambiguous UTC instant to SAT local wall-clock seconds', () => {
    expect(
      formatSatLocalDateTime('2026-09-03T02:55:00.000Z', 'America/Mexico_City'),
    ).toBe('2026-09-02T20:55:00');
  });

  it('crosses the fiscal-local calendar day deterministically', () => {
    expect(
      formatSatLocalDateTime('2026-01-01T01:30:45.999Z', 'America/Mexico_City'),
    ).toBe('2025-12-31T19:30:45');
  });

  it('accepts a valid Date as the unambiguous internal instant', () => {
    expect(
      formatSatLocalDateTime(
        new Date('2026-09-03T02:55:00.000Z'),
        'America/Mexico_City',
      ),
    ).toBe('2026-09-02T20:55:00');
  });

  it.each(['UTC', 'America/Mexico_City'] as const)(
    'does not depend on host timezone %s',
    (hostTimeZone) => {
      const previousTimeZone = process.env.TZ;
      process.env.TZ = hostTimeZone;
      try {
        expect(
          formatSatLocalDateTime(
            '2026-09-03T02:55:00.000Z',
            'America/Mexico_City',
          ),
        ).toBe('2026-09-02T20:55:00');
      } finally {
        if (previousTimeZone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimeZone;
      }
    },
  );

  it('rejects a wall-clock string without an explicit offset', () => {
    expect(() =>
      formatSatLocalDateTime('2026-09-02T20:55:00', 'America/Mexico_City'),
    ).toThrow('SAT_LOCAL_DATE_TIME_INVALID_INSTANT');
  });

  it('rejects an unknown IANA timezone', () => {
    expect(() =>
      formatSatLocalDateTime('2026-09-03T02:55:00.000Z', 'Invalid/Timezone'),
    ).toThrow('SAT_LOCAL_DATE_TIME_INVALID_TIME_ZONE');
  });
});
