import {
  addDays,
  changeEatenDate,
  changeEatenTime,
  formatDayTitle,
  formatLocalDate,
  formatLocalDateTime,
  formatTimeOfDay,
  formatTimestamp,
  getEatenLocalDate,
  getEatenTime,
  isLocalDate,
  nextUpdatedAt
} from './time';

describe('getEatenLocalDate', () => {
  it('extracts local date from ISO string', () => {
    expect(getEatenLocalDate('2026-11-03T12:30:00+01:00')).toBe('2026-11-03');
    expect(getEatenLocalDate('2026-11-03T23:59:00+01:00')).toBe('2026-11-03');
    expect(getEatenLocalDate('2026-11-03T00:00:00+01:00')).toBe('2026-11-03');
  });

  it('handles different offsets around midnight correctly', () => {
    // These should all be the same local date despite different UTC times
    expect(getEatenLocalDate('2026-11-03T01:00:00+02:00')).toBe('2026-11-03');
    expect(getEatenLocalDate('2026-11-02T23:00:00+00:00')).toBe('2026-11-02');
  });
});

describe('changeEatenDate', () => {
  it('changes date while keeping time of day', () => {
    const original = '2026-11-03T21:10:00+01:00';
    const result = changeEatenDate(original, '2026-11-02');

    // Should be same time (21:10), different date
    expect(result).toMatch(/^2026-11-02T21:10:00/);
  });

  it('handles midnight correctly', () => {
    const original = '2026-11-03T00:00:00+01:00';
    const result = changeEatenDate(original, '2026-11-05');

    expect(result).toMatch(/^2026-11-05T00:00:00/);
  });

  it('keeps time of day across DST boundary', () => {
    // Test with TZ=Europe/Zurich (DST ends on last Sunday of October at 03:00)
    // 2026-10-26 is after DST ends (UTC+1)
    // 2026-10-24 is before DST ends (UTC+2)
    // When we move an entry from Oct 26 to Oct 24, the time of day should be preserved
    // but the offset should change from +01:00 to +02:00
    const original = '2026-10-26T21:10:00+01:00';
    const result = changeEatenDate(original, '2026-10-24');

    // Should preserve the wall-clock time 21:10
    expect(result).toMatch(/^2026-10-24T21:10:00/);

    // Extract and verify the time of day is preserved
    const timeMatch = result.match(/T(\d{2}):(\d{2}):(\d{2})/);
    expect(timeMatch).not.toBeNull();
    expect(timeMatch![1]).toBe('21');
    expect(timeMatch![2]).toBe('10');

    // In Europe/Zurich, Oct 24 2026 is during DST (UTC+2), Oct 26 is after (UTC+1)
    // The offset should be recomputed for the new date
    // With TZ=Europe/Zurich, this should give +02:00 for Oct 24
    expect(result).toMatch(/\+02:00$/);
  });
});

describe('formatLocalDateTime', () => {
  it('formats date with correct offset', () => {
    const date = new Date('2026-11-03T12:30:00Z');
    const result = formatLocalDateTime(date);

    // Result should be ISO 8601 with offset
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });
});

describe('changeEatenTime', () => {
  it('changes the time while keeping the date', () => {
    expect(changeEatenTime('2026-11-03T21:10:42+01:00', 8, 5)).toBe('2026-11-03T08:05:00+01:00');
  });

  it('recomputes the offset on the DST change day', () => {
    // DST ends in Europe/Zurich on 2026-10-25 at 03:00
    expect(changeEatenTime('2026-10-25T01:00:00+02:00', 12, 0)).toBe('2026-10-25T12:00:00+01:00');
  });

  it('accepts server timestamps with milliseconds', () => {
    expect(changeEatenTime('2026-11-03T12:30:00.000+01:00', 13, 15)).toBe('2026-11-03T13:15:00+01:00');
  });
});

describe('getEatenTime', () => {
  it('returns the local time of day', () => {
    expect(getEatenTime('2026-11-03T07:45:00.000-04:00')).toEqual({ hours: 7, minutes: 45 });
  });
});

describe('formatTimeOfDay', () => {
  it('pads hours and minutes', () => {
    expect(formatTimeOfDay(7, 5)).toBe('07:05');
  });
});

describe('local dates', () => {
  it('formats a Date as its local date', () => {
    expect(formatLocalDate(new Date(2026, 10, 3, 23, 59))).toBe('2026-11-03');
  });

  it('adds days across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-26', -2)).toBe('2026-10-24');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('validates local dates', () => {
    expect(isLocalDate('2026-11-03')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-11-3')).toBe(false);
    expect(isLocalDate('today')).toBe(false);
  });
});

describe('formatDayTitle', () => {
  const today = '2026-11-03';

  it('names today, yesterday and tomorrow', () => {
    expect(formatDayTitle('2026-11-03', today)).toBe('Today');
    expect(formatDayTitle('2026-11-02', today)).toBe('Yesterday');
    expect(formatDayTitle('2026-11-04', today)).toBe('Tomorrow');
  });

  it('shows the weekday and date for other days', () => {
    expect(formatDayTitle('2026-10-30', today)).toBe('Friday, 30 October');
  });

  it('adds the year for other years', () => {
    expect(formatDayTitle('2025-12-31', today)).toBe('Wednesday, 31 December 2025');
  });
});

describe('formatTimestamp', () => {
  it('formats a UTC timestamp in local time', () => {
    expect(formatTimestamp('2026-11-03T11:30:55.004Z')).toBe('3 Nov 2026, 12:30');
  });
});

describe('nextUpdatedAt', () => {
  it('uses the current time when it is later than the previous value', () => {
    expect(nextUpdatedAt('2026-11-03T10:00:00.000Z', new Date('2026-11-03T11:00:00.000Z'))).toBe('2026-11-03T11:00:00.000Z');
    expect(nextUpdatedAt(null, new Date('2026-11-03T11:00:00.000Z'))).toBe('2026-11-03T11:00:00.000Z');
  });

  it('is always later than the previous value', () => {
    expect(nextUpdatedAt('2026-11-03T11:00:00.000Z', new Date('2026-11-03T11:00:00.000Z'))).toBe('2026-11-03T11:00:00.001Z');
    expect(nextUpdatedAt('2026-11-03T12:00:00.000Z', new Date('2026-11-03T11:00:00.000Z'))).toBe('2026-11-03T12:00:00.001Z');
  });
});
