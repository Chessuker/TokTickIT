import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUSES,
  openFollowUpCount,
  permittedTransitions,
  resolutionBlockedMessage,
  resolutionGate
} from '../../src/ticketWorkflow.js';
import type { GateCondition, GateInput } from '../../src/ticketWorkflow.js';

/**
 * UNIT-03 (BR-14, BR-17, AC-12, AC-13) and UNIT-04 (BR-13, BR-14, AC-14) —
 * the resolution gate, and `permittedTransitions` with the gate closed.
 */

const REOPENED_AT = new Date('2026-10-05T03:00:00.000Z');
const BEFORE = new Date('2026-10-04T03:00:00.000Z');
const AFTER = new Date('2026-10-06T03:00:00.000Z');

const done = (createdAt: Date) => ({ createdAt, followUpStatus: null });
const open = (createdAt: Date) => ({ createdAt, followUpStatus: 'Open' });

describe('resolutionGate (UNIT-03)', () => {
  // Every combination of the three conditions, never reopened.
  const cases: [boolean, GateInput['actions'], GateCondition[]][] = [
    [true, [done(BEFORE)], []],
    [false, [done(BEFORE)], ['OWNER']],
    [true, [], ['ACTION_SINCE_REOPEN']],
    [true, [open(BEFORE)], ['OPEN_FOLLOW_UPS']],
    [false, [], ['OWNER', 'ACTION_SINCE_REOPEN']],
    [false, [open(BEFORE)], ['OWNER', 'OPEN_FOLLOW_UPS']],
    [true, [done(BEFORE), open(BEFORE)], ['OPEN_FOLLOW_UPS']],
    [false, [open(BEFORE), open(AFTER)], ['OWNER', 'OPEN_FOLLOW_UPS']]
  ];

  it.each(cases)('owner %s, actions %j → unmet %j', (hasOwner, actions, unmet) => {
    expect(resolutionGate({ hasOwner, actions, lastReopenedAt: null })).toEqual({ ok: unmet.length === 0, unmet });
  });

  it('counts any Action when the ticket was never reopened', () => {
    expect(resolutionGate({ hasOwner: true, actions: [done(BEFORE)], lastReopenedAt: null }).ok).toBe(true);
  });

  it('after a reopen, counts only Actions created strictly later (BR-17)', () => {
    const at = (actions: GateInput['actions']) =>
      resolutionGate({ hasOwner: true, actions, lastReopenedAt: REOPENED_AT });

    expect(at([done(BEFORE)]).unmet).toEqual(['ACTION_SINCE_REOPEN']);
    expect(at([done(REOPENED_AT)]).unmet).toEqual(['ACTION_SINCE_REOPEN']);
    expect(at([done(new Date(REOPENED_AT.getTime() + 1))]).ok).toBe(true);
    expect(at([done(BEFORE), done(AFTER)]).ok).toBe(true);
  });

  it('an open follow-up blocks wherever it is, even on an Action from before the reopen', () => {
    const gate = resolutionGate({ hasOwner: true, actions: [open(BEFORE), done(AFTER)], lastReopenedAt: REOPENED_AT });
    expect(gate.unmet).toEqual(['OPEN_FOLLOW_UPS']);
  });

  it('treats Completed and Cancelled follow-ups as closed', () => {
    const actions = [
      { createdAt: BEFORE, followUpStatus: 'Completed' },
      { createdAt: BEFORE, followUpStatus: 'Cancelled' }
    ];
    expect(resolutionGate({ hasOwner: true, actions, lastReopenedAt: null }).ok).toBe(true);
    expect(openFollowUpCount(actions)).toBe(0);
    expect(openFollowUpCount([...actions, open(AFTER), open(AFTER)])).toBe(2);
  });
});

describe('resolutionBlockedMessage', () => {
  it('names every unmet condition in order, as what to do next', () => {
    const gate = { ok: false, unmet: ['ACTION_SINCE_REOPEN', 'OPEN_FOLLOW_UPS'] as GateCondition[] };
    expect(resolutionBlockedMessage(gate, 1, false)).toBe(
      'This ticket cannot be resolved yet: record at least one action taken; complete or cancel 1 open follow-up.'
    );
    expect(resolutionBlockedMessage(gate, 2, true)).toBe(
      'This ticket cannot be resolved yet: record at least one action taken since the ticket was reopened; complete or cancel 2 open follow-ups.'
    );
    expect(resolutionBlockedMessage({ ok: false, unmet: ['OWNER'] }, 0, false)).toBe(
      'This ticket cannot be resolved yet: assign an owner.'
    );
  });
});

describe('permittedTransitions with the gate (UNIT-04)', () => {
  it('leaves out Resolved, and only Resolved, while the gate is closed', () => {
    for (const status of TICKET_STATUSES) {
      const open = permittedTransitions(status, true, true);
      const closed = permittedTransitions(status, true, false);
      expect(closed).toEqual(open.filter((target) => target !== 'Resolved'));
    }
    expect(permittedTransitions('InProgress', true, false)).toEqual(['WaitingForRequester', 'Cancelled']);
  });

  it('defaults to the Lab 3 answer when no gate is given', () => {
    expect(permittedTransitions('Open', true)).toEqual(permittedTransitions('Open', true, true));
    expect(permittedTransitions('Open', true)).toContain('Resolved');
  });
});
