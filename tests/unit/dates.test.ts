import { describe, it, expect } from 'vitest';
import { countLeaveDays, prorateAnnualLeave, monthlyELAccrual, displayDateRange } from '@/lib/dates';

describe('Date Utilities & Day Counting', () => {
  it('counts weekdays correctly and skips weekends (Sat & Sun)', () => {
    // 2026-10-12 (Mon) to 2026-10-16 (Fri) = 5 days
    const days = countLeaveDays('2026-10-12', '2026-10-16', false, false, [0, 6]);
    expect(days).toBe(5);
  });

  it('skips weekend when leave spans across Friday to Monday', () => {
    // 2026-10-16 (Fri) to 2026-10-19 (Mon) = 2 working days (Fri + Mon)
    const days = countLeaveDays('2026-10-16', '2026-10-19', false, false, [0, 6]);
    expect(days).toBe(2);
  });

  it('handles half-days on start and end dates', () => {
    // Mon to Fri with start half-day (0.5) and end half-day (0.5) -> 5 - 1 = 4 days
    const days = countLeaveDays('2026-10-12', '2026-10-16', true, true, [0, 6]);
    expect(days).toBe(4);
  });

  it('handles single-day half leave correctly', () => {
    // Single Mon with half-day flagged
    const days = countLeaveDays('2026-10-12', '2026-10-12', true, false, [0, 6]);
    expect(days).toBe(0.5);
  });

  it('returns 0 when end date precedes start date', () => {
    const days = countLeaveDays('2026-10-16', '2026-10-12', false, false, [0, 6]);
    expect(days).toBe(0);
  });

  it('prorates annual leave accurately for mid-year joiners rounded to 0.5', () => {
    // 12 days quota, joined 1 July (6 months remaining -> (12 / 12) * 6 = 6 days)
    const prorated = prorateAnnualLeave(12, '2026-07-01');
    expect(prorated).toBe(6);
  });

  it('calculates standard monthly EL accrual (1.25 days)', () => {
    const el = monthlyELAccrual();
    expect(el).toBe(1.25);
  });

  it('formats date ranges cleanly', () => {
    const rangeSameMonth = displayDateRange('2026-10-12', '2026-10-15');
    expect(rangeSameMonth).toContain('12');
    expect(rangeSameMonth).toContain('15');
  });
});
