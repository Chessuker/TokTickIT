/**
 * Ticket Number generation (BR-01, AD-01).
 *
 * Format: TKT-YYYY-XXXXXX — the creation year plus a zero-padded sequence that
 * restarts each year. Human-readable, sortable, and unique. The client never
 * supplies or edits it.
 */

export const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;

const SEQUENCE_LENGTH = 6;
const MAX_SEQUENCE = 10 ** SEQUENCE_LENGTH - 1;

export function formatTicketNumber(year: number, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Ticket sequence must be a positive integer, received ${sequence}`);
  }
  if (sequence > MAX_SEQUENCE) {
    throw new Error(`Ticket sequence ${sequence} exceeds the ${SEQUENCE_LENGTH}-digit limit`);
  }

  return `TKT-${year}-${String(sequence).padStart(SEQUENCE_LENGTH, '0')}`;
}

export function parseTicketSequence(ticketNumber: string): number {
  if (!TICKET_NUMBER_PATTERN.test(ticketNumber)) {
    throw new Error(`Malformed ticket number: ${ticketNumber}`);
  }

  return Number(ticketNumber.slice(-SEQUENCE_LENGTH));
}

/** The slice of the Prisma client this generator needs, so it can be tested without a database. */
export interface TicketNumberSource {
  ticket: {
    findFirst(args: unknown): Promise<{ ticketNumber: string } | null>;
  };
}

/**
 * Returns the next unused Ticket Number for the given year by continuing from
 * the highest one already stored. Callers must run this inside the same
 * transaction as the ticket insert so concurrent creates cannot collide; the
 * unique constraint on `ticketNumber` is the final guard.
 */
export async function generateTicketNumber(
  client: TicketNumberSource,
  now: Date = new Date()
): Promise<string> {
  const year = now.getFullYear();

  const latest = await client.ticket.findFirst({
    where: { ticketNumber: { startsWith: `TKT-${year}-` } },
    orderBy: { ticketNumber: 'desc' },
    select: { ticketNumber: true },
  });

  const nextSequence = latest ? parseTicketSequence(latest.ticketNumber) + 1 : 1;

  return formatTicketNumber(year, nextSequence);
}
