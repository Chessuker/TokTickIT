import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUSES,
  TRANSITIONS,
  checkTransition,
  isTerminal,
  isTicketStatus,
  needsConfirmation,
  permittedTransitions,
  statusLabel,
  timestampsFor
} from '../../src/ticketWorkflow.js';
import type { TicketStatusValue } from '../../src/ticketWorkflow.js';

/**
 * UNIT-02 (BR-18, AC-21) and UNIT-03 (BR-19, BR-20, AC-22) — the transition
 * matrix, the owner rule and the timestamp rule, checked pair by pair against
 * specification.md §5 rather than against the implementation.
 */

/**
 * The matrix as the specification draws it, transcribed independently: each
 * row lists the targets permitted from that status, and `owner` marks the ones
 * that also require one. If the table in `ticketWorkflow.ts` is edited, this
 * copy has to be edited too — which is the point.
 */
const SPEC: Record<TicketStatusValue, { to: TicketStatusValue; owner?: true; confirm?: true }[]> = {
  New: [{ to: 'Open' }, { to: 'InProgress', owner: true }, { to: 'Cancelled', confirm: true }],
  Open: [
    { to: 'InProgress', owner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', owner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  InProgress: [
    { to: 'WaitingForRequester' },
    { to: 'Resolved', owner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  WaitingForRequester: [
    { to: 'InProgress', owner: true },
    { to: 'Resolved', owner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  Resolved: [{ to: 'Closed', confirm: true }, { to: 'Reopened' }],
  Closed: [{ to: 'Reopened' }],
  Reopened: [
    { to: 'InProgress', owner: true },
    { to: 'WaitingForRequester' },
    { to: 'Resolved', owner: true, confirm: true },
    { to: 'Cancelled', confirm: true }
  ],
  Cancelled: []
};

/** Every (from, to) pair, including the self-transitions the matrix omits. */
const ALL_PAIRS = TICKET_STATUSES.flatMap((from) => TICKET_STATUSES.map((to) => [from, to] as const));

function specEntry(from: TicketStatusValue, to: TicketStatusValue) {
  return SPEC[from].find((entry) => entry.to === to);
}

describe('the matrix matches specification.md §5 (UNIT-02, BR-18)', () => {
  it('declares a row for every status and an empty one for Cancelled', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...TICKET_STATUSES].sort());
    expect(TRANSITIONS.Cancelled).toEqual([]);
  });

  it('never permits a transition back to New, and never a self-transition', () => {
    for (const from of TICKET_STATUSES) {
      expect(TRANSITIONS[from].map((entry) => entry.to)).not.toContain('New');
      expect(TRANSITIONS[from].map((entry) => entry.to)).not.toContain(from);
    }
  });

  it.each(ALL_PAIRS)('%s → %s matches the specification', (from, to) => {
    const expected = specEntry(from, to);
    const actual = TRANSITIONS[from].find((entry) => entry.to === to);

    if (!expected) {
      expect(actual).toBeUndefined();
      return;
    }

    expect(actual).toBeDefined();
    expect(Boolean(actual?.requiresOwner)).toBe(Boolean(expected.owner));
    expect(Boolean(actual?.confirm)).toBe(Boolean(expected.confirm));
  });
});

describe('checkTransition (UNIT-02, AC-21)', () => {
  it.each(ALL_PAIRS)('%s → %s: permitted only where the matrix says so (owned ticket)', (from, to) => {
    const result = checkTransition(from, to, true);
    expect(result.ok).toBe(specEntry(from, to) !== undefined);
  });

  it('names the current status and the permitted targets when refusing', () => {
    const result = checkTransition('New', 'Closed', true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.reason).toBe('NOT_IN_MATRIX');
    expect(result.refusal.message).toContain('New');
    expect(result.refusal.message).toContain('Closed');
    expect(result.refusal.message).toContain('Open');
  });

  it('refuses every transition out of Cancelled — it is terminal (BR-20)', () => {
    for (const to of TICKET_STATUSES) {
      expect(checkTransition('Cancelled', to, true).ok).toBe(false);
    }
  });

  it('allows a Closed ticket only to be Reopened', () => {
    expect(checkTransition('Closed', 'Reopened', true).ok).toBe(true);
    for (const to of TICKET_STATUSES.filter((status) => status !== 'Reopened')) {
      expect(checkTransition('Closed', to, true).ok).toBe(false);
    }
  });
});

describe('the owner rule (UNIT-03, BR-19, AC-22)', () => {
  const OWNED_ONLY: [TicketStatusValue, TicketStatusValue][] = [
    ['New', 'InProgress'],
    ['Open', 'InProgress'],
    ['Open', 'Resolved'],
    ['InProgress', 'Resolved'],
    ['WaitingForRequester', 'InProgress'],
    ['WaitingForRequester', 'Resolved'],
    ['Reopened', 'InProgress'],
    ['Reopened', 'Resolved']
  ];

  it.each(OWNED_ONLY)('%s → %s is refused without an owner and allowed with one', (from, to) => {
    const without = checkTransition(from, to, false);
    expect(without.ok).toBe(false);
    if (!without.ok) {
      expect(without.refusal.reason).toBe('OWNER_REQUIRED');
      expect(without.refusal.message).toMatch(/owner/i);
    }

    expect(checkTransition(from, to, true).ok).toBe(true);
  });

  it('only InProgress and Resolved ever require an owner', () => {
    for (const from of TICKET_STATUSES) {
      for (const entry of TRANSITIONS[from]) {
        if (entry.requiresOwner) expect(['InProgress', 'Resolved']).toContain(entry.to);
      }
    }
  });

  it.each([
    ['Open', 'WaitingForRequester'],
    ['Open', 'Cancelled'],
    ['New', 'Open'],
    ['Resolved', 'Reopened'],
    ['Closed', 'Reopened']
  ] as [TicketStatusValue, TicketStatusValue][])(
    '%s → %s needs no owner',
    (from, to) => {
      expect(checkTransition(from, to, false).ok).toBe(true);
    }
  );
});

describe('permittedTransitions (BR-18, BR-19)', () => {
  it('advertises the matrix row for an owned ticket', () => {
    expect(permittedTransitions('Open', true)).toEqual([
      'InProgress',
      'WaitingForRequester',
      'Resolved',
      'Cancelled'
    ]);
  });

  it('hides the owner-only targets on an unassigned ticket, so the UI cannot offer them', () => {
    expect(permittedTransitions('Open', false)).toEqual(['WaitingForRequester', 'Cancelled']);
    expect(permittedTransitions('New', false)).toEqual(['Open', 'Cancelled']);
  });

  it('is empty for a Cancelled ticket at any ownership', () => {
    expect(permittedTransitions('Cancelled', true)).toEqual([]);
    expect(permittedTransitions('Cancelled', false)).toEqual([]);
  });

  it('agrees with checkTransition for every pair and both ownership states', () => {
    for (const hasOwner of [true, false]) {
      for (const [from, to] of ALL_PAIRS) {
        expect(permittedTransitions(from, hasOwner).includes(to)).toBe(
          checkTransition(from, to, hasOwner).ok
        );
      }
    }
  });
});

describe('needsConfirmation (BR-18 ⚠)', () => {
  it.each([
    ['Open', 'Resolved'],
    ['InProgress', 'Resolved'],
    ['Resolved', 'Closed'],
    ['New', 'Cancelled'],
    ['Reopened', 'Cancelled']
  ] as [TicketStatusValue, TicketStatusValue][])('%s → %s is confirmed', (from, to) => {
    expect(needsConfirmation(from, to)).toBe(true);
  });

  it.each([
    ['New', 'Open'],
    ['Open', 'InProgress'],
    ['Open', 'WaitingForRequester'],
    ['Closed', 'Reopened']
  ] as [TicketStatusValue, TicketStatusValue][])('%s → %s is not', (from, to) => {
    expect(needsConfirmation(from, to)).toBe(false);
  });

  it('marks exactly the Resolved, Closed and Cancelled targets', () => {
    for (const from of TICKET_STATUSES) {
      for (const entry of TRANSITIONS[from]) {
        expect(Boolean(entry.confirm)).toBe(['Resolved', 'Closed', 'Cancelled'].includes(entry.to));
      }
    }
  });
});

describe('timestampsFor (UNIT-03, BR-20)', () => {
  const NOW = new Date('2026-09-20T10:00:00.000Z');
  const EARLIER = new Date('2026-09-18T08:00:00.000Z');

  it('Resolved stamps resolvedAt', () => {
    expect(timestampsFor('Resolved', NOW, { resolvedAt: null, closedAt: null })).toEqual({
      resolvedAt: NOW,
      closedAt: null
    });
  });

  it('Closed stamps closedAt and keeps an existing resolvedAt', () => {
    expect(timestampsFor('Closed', NOW, { resolvedAt: EARLIER, closedAt: null })).toEqual({
      closedAt: NOW,
      resolvedAt: EARLIER
    });
  });

  it('Closed straight from Resolved-less states stamps both', () => {
    expect(timestampsFor('Closed', NOW, { resolvedAt: null, closedAt: null })).toEqual({
      closedAt: NOW,
      resolvedAt: NOW
    });
  });

  it('Reopened clears all three, including the requester indication', () => {
    expect(timestampsFor('Reopened', NOW, { resolvedAt: EARLIER, closedAt: EARLIER })).toEqual({
      resolvedAt: null,
      closedAt: null,
      requesterResolvedAt: null
    });
  });

  it.each(['Open', 'InProgress', 'WaitingForRequester', 'Cancelled'] as TicketStatusValue[])(
    '%s leaves the timestamps alone',
    (status) => {
      expect(timestampsFor(status, NOW, { resolvedAt: EARLIER, closedAt: null })).toEqual({});
    }
  );
});

describe('helpers', () => {
  it('isTicketStatus accepts the eight values and nothing else', () => {
    for (const status of TICKET_STATUSES) expect(isTicketStatus(status)).toBe(true);
    for (const value of ['', 'open', 'Done', 42, null, undefined, {}]) {
      expect(isTicketStatus(value)).toBe(false);
    }
  });

  it('isTerminal is true only for Closed and Cancelled (BR-31)', () => {
    for (const status of TICKET_STATUSES) {
      expect(isTerminal(status)).toBe(status === 'Closed' || status === 'Cancelled');
    }
  });

  it('statusLabel spaces the camel-case values', () => {
    expect(statusLabel('WaitingForRequester')).toBe('Waiting For Requester');
    expect(statusLabel('InProgress')).toBe('In Progress');
    expect(statusLabel('Open')).toBe('Open');
  });
});
