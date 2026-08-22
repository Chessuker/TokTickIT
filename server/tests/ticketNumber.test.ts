import { describe, it, expect, vi } from 'vitest';
import {
  TICKET_NUMBER_PATTERN,
  formatTicketNumber,
  generateTicketNumber,
  parseTicketSequence,
} from '../src/ticketNumber.js';

/** UNIT-01 — BR-01, AD-01: auto-generated Ticket Number format and uniqueness. */
describe('ticket number generation', () => {
  it('formats a sequence as TKT-YYYY-XXXXXX', () => {
    expect(formatTicketNumber(2026, 1)).toBe('TKT-2026-000001');
    expect(formatTicketNumber(2026, 42)).toBe('TKT-2026-000042');
    expect(formatTicketNumber(2026, 999999)).toBe('TKT-2026-999999');
  });

  it('always matches the documented pattern', () => {
    for (const sequence of [1, 9, 10, 999, 123456]) {
      expect(formatTicketNumber(2026, sequence)).toMatch(TICKET_NUMBER_PATTERN);
    }
  });

  it('rejects sequences outside the supported range', () => {
    expect(() => formatTicketNumber(2026, 0)).toThrow();
    expect(() => formatTicketNumber(2026, -1)).toThrow();
    expect(() => formatTicketNumber(2026, 1_000_000)).toThrow();
  });

  it('parses the sequence back out of a ticket number', () => {
    expect(parseTicketSequence('TKT-2026-000042')).toBe(42);
    expect(() => parseTicketSequence('TKT-2026-42')).toThrow();
  });

  it('starts at 000001 for the first ticket of a year', async () => {
    const client = { ticket: { findFirst: vi.fn().mockResolvedValue(null) } };

    await expect(generateTicketNumber(client, new Date('2026-01-01T00:00:00Z'))).resolves.toBe(
      'TKT-2026-000001'
    );
  });

  it('continues from the highest ticket number already stored', async () => {
    const client = {
      ticket: { findFirst: vi.fn().mockResolvedValue({ ticketNumber: 'TKT-2026-000007' }) },
    };

    await expect(generateTicketNumber(client, new Date('2026-08-22T00:00:00Z'))).resolves.toBe(
      'TKT-2026-000008'
    );
  });

  it('scopes the lookup to the current year', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);

    await generateTicketNumber({ ticket: { findFirst } }, new Date('2027-03-04T00:00:00Z'));

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ticketNumber: { startsWith: 'TKT-2027-' } },
        orderBy: { ticketNumber: 'desc' },
      })
    );
  });

  it('never produces the same number twice for consecutive tickets', async () => {
    let latest: { ticketNumber: string } | null = null;
    const client = {
      ticket: { findFirst: vi.fn().mockImplementation(async () => latest) },
    };

    const issued: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const ticketNumber = await generateTicketNumber(client, new Date('2026-08-22T00:00:00Z'));
      issued.push(ticketNumber);
      latest = { ticketNumber };
    }

    expect(new Set(issued).size).toBe(issued.length);
    expect(issued.at(-1)).toBe('TKT-2026-000025');
  });
});
