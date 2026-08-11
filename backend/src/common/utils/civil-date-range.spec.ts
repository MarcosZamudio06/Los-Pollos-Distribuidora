import { BadRequestException } from '@nestjs/common';
import {
  buildCivilDateRangeFilter,
  DEFAULT_APP_TIMEZONE,
} from './civil-date-range';

describe('buildCivilDateRangeFilter', () => {
  it('covers the complete civil day for a same-day query in the configured timezone', () => {
    const filter = buildCivilDateRangeFilter(
      '2026-06-30',
      '2026-06-30',
      DEFAULT_APP_TIMEZONE,
    );

    expect(filter).toEqual({
      gte: new Date('2026-06-30T06:00:00.000Z'),
      lt: new Date('2026-07-01T06:00:00.000Z'),
    });
    expect(
      new Date('2026-07-01T05:59:59.999Z').getTime() < filter!.lt!.getTime(),
    ).toBe(true);
  });

  it('handles the end of a calendar year without using a fixed 24-hour offset', () => {
    const filter = buildCivilDateRangeFilter(
      '2026-12-31',
      '2026-12-31',
      DEFAULT_APP_TIMEZONE,
    );

    expect(filter).toEqual({
      gte: new Date('2026-12-31T06:00:00.000Z'),
      lt: new Date('2027-01-01T06:00:00.000Z'),
    });
  });

  it('preserves exact timestamp boundaries and does not turn dateTo into an exclusive next day', () => {
    const filter = buildCivilDateRangeFilter(
      '2026-06-30T12:34:56.789Z',
      '2026-06-30T23:59:59.999Z',
      DEFAULT_APP_TIMEZONE,
    );

    expect(filter).toEqual({
      gte: new Date('2026-06-30T12:34:56.789Z'),
      lte: new Date('2026-06-30T23:59:59.999Z'),
    });
    expect(filter!.lt).toBeUndefined();
  });

  it('rejects reversed civil-date bounds before a query can silently return no rows', () => {
    expect(() =>
      buildCivilDateRangeFilter(
        '2026-06-02',
        '2026-06-01',
        DEFAULT_APP_TIMEZONE,
      ),
    ).toThrow(
      new BadRequestException('dateFrom must be less than or equal to dateTo'),
    );
  });

  it('rejects invalid calendar dates, timestamps, and timezones with readable 400 errors', () => {
    expect(() =>
      buildCivilDateRangeFilter('2026-02-29', undefined, DEFAULT_APP_TIMEZONE),
    ).toThrow(BadRequestException);
    expect(() =>
      buildCivilDateRangeFilter(
        '2026-02-30T12:00:00.000Z',
        undefined,
        DEFAULT_APP_TIMEZONE,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      buildCivilDateRangeFilter('2026-06-01', undefined, 'Invalid/Timezone'),
    ).toThrow(BadRequestException);
  });

  it('uses the DST transition when converting a civil day in an IANA timezone', () => {
    const filter = buildCivilDateRangeFilter(
      '2026-03-08',
      '2026-03-08',
      'America/New_York',
    );

    expect(filter).toEqual({
      gte: new Date('2026-03-08T05:00:00.000Z'),
      lt: new Date('2026-03-09T04:00:00.000Z'),
    });
  });
});
