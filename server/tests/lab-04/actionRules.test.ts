import { describe, it, expect } from 'vitest';
import {
  ACTION_LOCKED_STATUSES,
  isActionLocked,
  readClientRequestId,
  toActionResponse,
  validateActionCreate,
  validateActionPatch
} from '../../src/actionRules.js';
import type { ActionRow, ExistingFollowUp } from '../../src/actionRules.js';

/**
 * UNIT-01 (BR-05, AC-04) and UNIT-02 (BR-06, BR-07, AC-07): the Actions Taken
 * field and follow-up rules, without a route.
 */

const NOW = new Date('2026-10-03T07:00:00.000Z');
const CONTEXT = { ticketCreatedAt: new Date('2026-09-30T03:20:45.000Z'), now: NOW };
const ASSIGNEE = '44444444-2222-4333-8444-555555555555';
const REQUEST_ID = '9b2f4c1e-8d3a-4f6b-9c2d-1e5f7a8b9c0d';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    actionAt: '2026-10-03T06:30:00.000Z',
    description: 'Re-created the Outlook profile.',
    result: 'Prompt stopped.',
    ...overrides
  };
}

const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000).toISOString();

describe('validateActionCreate — fields (UNIT-01, BR-05)', () => {
  it('accepts a minimal valid body and trims text', () => {
    const check = validateActionCreate(
      validBody({ description: '  Did the thing  ', result: '\tWorked\n', attachmentNotes: '  see a.png ' }),
      CONTEXT
    );

    expect(check).toEqual({
      ok: true,
      value: {
        actionAt: new Date('2026-10-03T06:30:00.000Z'),
        description: 'Did the thing',
        result: 'Worked',
        attachmentNotes: 'see a.png',
        followUp: null,
        clientRequestId: null
      }
    });
  });

  it.each([
    ['missing', undefined, 'Action description is required.'],
    ['empty', '', 'Action description is required.'],
    ['whitespace', '   ', 'Action description is required.'],
    ['not text', 42, 'Action description must be text.'],
    ['2001 characters', 'x'.repeat(2001), 'Action description must be at most 2000 characters.']
  ])('refuses a description that is %s', (_label, description, message) => {
    const check = validateActionCreate(validBody({ description }), CONTEXT);
    expect(check).toEqual({ ok: false, fields: { description: message } });
  });

  it('accepts a description of exactly 1 and 2000 characters', () => {
    expect(validateActionCreate(validBody({ description: 'x' }), CONTEXT).ok).toBe(true);
    expect(validateActionCreate(validBody({ description: 'x'.repeat(2000) }), CONTEXT).ok).toBe(true);
  });

  it.each([
    ['missing', undefined, 'Result is required.'],
    ['whitespace', '  ', 'Result is required.'],
    ['1001 characters', 'x'.repeat(1001), 'Result must be at most 1000 characters.']
  ])('refuses a result that is %s', (_label, result, message) => {
    const check = validateActionCreate(validBody({ result }), CONTEXT);
    expect(check).toEqual({ ok: false, fields: { result: message } });
  });

  it('accepts a result of exactly 1000 characters', () => {
    expect(validateActionCreate(validBody({ result: 'x'.repeat(1000) }), CONTEXT).ok).toBe(true);
  });

  it.each([
    ['missing', undefined, 'Action date/time is required.'],
    ['empty', '', 'Action date/time is required.'],
    ['unparsable', 'yesterday-ish', 'Action date/time must be a valid date and time.'],
    ['not a string', 1696300000000, 'Action date/time must be a valid date and time.'],
    ['6 minutes ahead', minutes(6), 'Action date/time cannot be in the future.'],
    ['a minute before the ticket existed', '2026-09-30T03:19:59.000Z', 'Action date/time cannot be before the ticket was created.']
  ])('refuses an actionAt that is %s', (_label, actionAt, message) => {
    const check = validateActionCreate(validBody({ actionAt }), CONTEXT);
    expect(check).toEqual({ ok: false, fields: { actionAt: message } });
  });

  it('allows up to 5 minutes of clock skew into the future', () => {
    expect(validateActionCreate(validBody({ actionAt: minutes(4) }), CONTEXT).ok).toBe(true);
    expect(validateActionCreate(validBody({ actionAt: minutes(5) }), CONTEXT).ok).toBe(true);
  });

  it('accepts the minute the ticket was created, even before its seconds (datetime-local precision)', () => {
    // Ticket stamped 03:20:45; the form can only say 03:20.
    expect(validateActionCreate(validBody({ actionAt: '2026-09-30T03:20:00.000Z' }), CONTEXT).ok).toBe(true);
  });

  it('stores empty attachment notes as null and refuses 501 characters', () => {
    const blank = validateActionCreate(validBody({ attachmentNotes: '   ' }), CONTEXT);
    expect(blank.ok && blank.value.attachmentNotes).toBeNull();

    expect(validateActionCreate(validBody({ attachmentNotes: 'x'.repeat(500) }), CONTEXT).ok).toBe(true);
    expect(validateActionCreate(validBody({ attachmentNotes: 'x'.repeat(501) }), CONTEXT)).toEqual({
      ok: false,
      fields: { attachmentNotes: 'Attachment notes must be at most 500 characters.' }
    });
  });

  it('reports every bad field at once, each under its own key (AC-04)', () => {
    const check = validateActionCreate({ actionAt: 'nope', description: '', result: '' }, CONTEXT);
    expect(check.ok).toBe(false);
    expect(Object.keys((check as { fields: object }).fields).sort()).toEqual(['actionAt', 'description', 'result']);
  });

  it('treats a non-object body as an empty one', () => {
    for (const body of [null, 'text', [1, 2]]) {
      const check = validateActionCreate(body, CONTEXT);
      expect(check.ok).toBe(false);
    }
  });

  it('never reads performedById, ticketId, followUpStatus or version from the body (BR-03)', () => {
    const check = validateActionCreate(
      validBody({ performedById: 'someone-else', ticketId: 'other', followUpStatus: 'Completed', version: 9 }),
      CONTEXT
    );
    expect(check.ok).toBe(true);
    expect(Object.keys((check as { value: object }).value).sort()).toEqual(
      ['actionAt', 'attachmentNotes', 'clientRequestId', 'description', 'followUp', 'result']
    );
  });

  it('accepts a UUID clientRequestId and refuses anything else (BR-10)', () => {
    const check = validateActionCreate(validBody({ clientRequestId: REQUEST_ID }), CONTEXT);
    expect(check.ok && check.value.clientRequestId).toBe(REQUEST_ID);

    expect(validateActionCreate(validBody({ clientRequestId: 'abc' }), CONTEXT)).toEqual({
      ok: false,
      fields: { clientRequestId: 'clientRequestId must be a UUID.' }
    });
    expect(readClientRequestId({ clientRequestId: REQUEST_ID })).toBe(REQUEST_ID);
    expect(readClientRequestId({})).toBeNull();
    expect(readClientRequestId({ clientRequestId: 'abc' })).toBeUndefined();
  });
});

describe('validateActionCreate — follow-up (UNIT-02, BR-06)', () => {
  it('opens a follow-up with a trimmed note and the assignee', () => {
    const check = validateActionCreate(
      validBody({ followUpRequired: true, followUpNote: '  Call the vendor  ', followUpAssigneeId: ASSIGNEE }),
      CONTEXT
    );
    expect(check.ok && check.value.followUp).toEqual({ note: 'Call the vendor', assigneeId: ASSIGNEE });
  });

  it('requires both the note and the assignee when follow-up is needed', () => {
    expect(validateActionCreate(validBody({ followUpRequired: true }), CONTEXT)).toEqual({
      ok: false,
      fields: {
        followUpNote: 'A follow-up note is required when follow-up is needed.',
        followUpAssigneeId: 'Choose who will do the follow-up.'
      }
    });
  });

  it('limits the follow-up note to 1000 characters', () => {
    const body = validBody({ followUpRequired: true, followUpAssigneeId: ASSIGNEE });
    expect(validateActionCreate({ ...body, followUpNote: 'x'.repeat(1000) }, CONTEXT).ok).toBe(true);
    expect(validateActionCreate({ ...body, followUpNote: 'x'.repeat(1001) }, CONTEXT)).toEqual({
      ok: false,
      fields: { followUpNote: 'Follow-up note must be at most 1000 characters.' }
    });
  });

  it('refuses a note or assignee sent without follow-up rather than dropping it', () => {
    expect(validateActionCreate(validBody({ followUpNote: 'Call back', followUpAssigneeId: ASSIGNEE }), CONTEXT)).toEqual({
      ok: false,
      fields: {
        followUpNote: 'Turn on "Follow-up required" to add a follow-up note.',
        followUpAssigneeId: 'Turn on "Follow-up required" to assign a follow-up.'
      }
    });
  });

  it('accepts empty follow-up fields when follow-up is off (what a form sends for hidden inputs)', () => {
    const check = validateActionCreate(
      validBody({ followUpRequired: false, followUpNote: '', followUpAssigneeId: null }),
      CONTEXT
    );
    expect(check.ok && check.value.followUp).toBeNull();
  });

  it('refuses a followUpRequired that is not a boolean', () => {
    expect(validateActionCreate(validBody({ followUpRequired: 'yes' }), CONTEXT)).toEqual({
      ok: false,
      fields: { followUpRequired: 'Follow-up required must be true or false.' }
    });
  });
});

describe('validateActionPatch (UNIT-01, UNIT-02 — BR-05, BR-07)', () => {
  const NONE: ExistingFollowUp = { followUpRequired: false, followUpStatus: null };
  const OPEN: ExistingFollowUp = { followUpRequired: true, followUpStatus: 'Open' };
  const COMPLETED: ExistingFollowUp = { followUpRequired: true, followUpStatus: 'Completed' };
  const CANCELLED: ExistingFollowUp = { followUpRequired: true, followUpStatus: 'Cancelled' };

  it('requires a whole, non-negative version', () => {
    for (const version of [undefined, -1, 1.5, '2', null]) {
      const check = validateActionPatch({ version, result: 'x' }, NONE, CONTEXT);
      expect(check).toMatchObject({ ok: false, kind: 'invalid', fields: { version: expect.any(String) } });
    }
  });

  it('collects only the fields the request carried', () => {
    const check = validateActionPatch({ version: 2, result: ' Better ', attachmentNotes: '' }, NONE, CONTEXT);
    expect(check).toEqual({
      ok: true,
      value: {
        version: 2,
        changes: { result: 'Better', attachmentNotes: null },
        openFollowUp: null,
        closeFollowUp: null,
        assigneeToCheck: null
      }
    });
  });

  it('applies the BR-05 rules to edited fields', () => {
    const check = validateActionPatch(
      { version: 0, description: '', actionAt: minutes(10), result: 'x'.repeat(1001) },
      NONE,
      CONTEXT
    );
    expect(check).toEqual({
      ok: false,
      kind: 'invalid',
      fields: {
        description: 'Action description is required.',
        actionAt: 'Action date/time cannot be in the future.',
        result: 'Result must be at most 1000 characters.'
      }
    });
  });

  it('answers empty when nothing would change', () => {
    expect(validateActionPatch({ version: 0 }, NONE, CONTEXT)).toEqual({ ok: false, kind: 'empty' });
    // Re-stating a follow-up that is already on changes nothing either.
    expect(validateActionPatch({ version: 0, followUpRequired: true }, OPEN, CONTEXT)).toEqual({ ok: false, kind: 'empty' });
  });

  it('opens a follow-up on an Action that had none, requiring note and assignee', () => {
    expect(
      validateActionPatch({ version: 1, followUpRequired: true, followUpNote: 'Ring back', followUpAssigneeId: ASSIGNEE }, NONE, CONTEXT)
    ).toMatchObject({ ok: true, value: { openFollowUp: { note: 'Ring back', assigneeId: ASSIGNEE }, assigneeToCheck: ASSIGNEE } });

    expect(validateActionPatch({ version: 1, followUpRequired: true }, NONE, CONTEXT)).toMatchObject({
      ok: false,
      kind: 'invalid',
      fields: { followUpNote: expect.any(String), followUpAssigneeId: expect.any(String) }
    });
  });

  it('never turns a follow-up off: cancel it instead (BR-07)', () => {
    for (const existing of [OPEN, COMPLETED, CANCELLED]) {
      expect(validateActionPatch({ version: 0, followUpRequired: false }, existing, CONTEXT)).toEqual({
        ok: false,
        kind: 'invalid',
        fields: { followUpRequired: 'A follow-up cannot be removed. Cancel the follow-up instead.' }
      });
    }
  });

  it('edits the note and reassigns while the follow-up is Open', () => {
    const check = validateActionPatch(
      { version: 3, followUpNote: ' New plan ', followUpAssigneeId: ASSIGNEE },
      OPEN,
      CONTEXT
    );
    expect(check).toMatchObject({
      ok: true,
      value: { changes: { followUpNote: 'New plan', followUpAssigneeId: ASSIGNEE }, assigneeToCheck: ASSIGNEE }
    });
  });

  it('refuses note or assignee changes on a closed follow-up as a conflict', () => {
    for (const existing of [COMPLETED, CANCELLED]) {
      expect(validateActionPatch({ version: 0, followUpNote: 'Late edit' }, existing, CONTEXT)).toEqual({
        ok: false,
        kind: 'conflict',
        message: 'This follow-up is already closed and can no longer be changed.'
      });
    }
  });

  it('refuses note or assignee on an Action with no follow-up as invalid', () => {
    expect(validateActionPatch({ version: 0, followUpAssigneeId: ASSIGNEE }, NONE, CONTEXT)).toEqual({
      ok: false,
      kind: 'invalid',
      fields: { followUpAssigneeId: 'Turn on "Follow-up required" first.' }
    });
  });

  it('completes or cancels an Open follow-up', () => {
    for (const status of ['Completed', 'Cancelled']) {
      expect(validateActionPatch({ version: 0, followUpStatus: status }, OPEN, CONTEXT)).toMatchObject({
        ok: true,
        value: { closeFollowUp: status }
      });
    }
  });

  it('refuses any other target status as invalid, and any non-Open source as a conflict', () => {
    for (const status of ['Open', 'Done', null]) {
      expect(validateActionPatch({ version: 0, followUpStatus: status }, OPEN, CONTEXT)).toMatchObject({
        ok: false,
        kind: 'invalid',
        fields: { followUpStatus: 'followUpStatus must be Completed or Cancelled.' }
      });
    }
    expect(validateActionPatch({ version: 0, followUpStatus: 'Completed' }, COMPLETED, CONTEXT)).toMatchObject({
      ok: false,
      kind: 'conflict'
    });
    expect(validateActionPatch({ version: 0, followUpStatus: 'Cancelled' }, NONE, CONTEXT)).toEqual({
      ok: false,
      kind: 'conflict',
      message: 'This action has no follow-up to complete or cancel.'
    });
  });

  it('reports field errors before state conflicts', () => {
    expect(validateActionPatch({ version: 0, description: '', followUpNote: 'x' }, COMPLETED, CONTEXT)).toMatchObject({
      ok: false,
      kind: 'invalid',
      fields: { description: expect.any(String) }
    });
  });
});

describe('locking and response shape', () => {
  it('locks exactly Resolved, Closed and Cancelled (BR-09)', () => {
    expect([...ACTION_LOCKED_STATUSES].sort()).toEqual(['Cancelled', 'Closed', 'Resolved']);
    for (const status of ['New', 'Open', 'InProgress', 'WaitingForRequester', 'Reopened'] as const) {
      expect(isActionLocked(status)).toBe(false);
    }
  });

  it('folds the follow-up columns into one block with the same keys either way', () => {
    const base: ActionRow = {
      id: 'a1',
      ticketId: 't1',
      actionAt: NOW,
      description: 'd',
      result: 'r',
      attachmentNotes: null,
      followUpRequired: false,
      followUpNote: null,
      followUpStatus: null,
      followUpClosedAt: null,
      version: 0,
      createdAt: NOW,
      updatedAt: NOW,
      performedBy: { id: 'u1', name: 'Priya Raman', role: 'ITStaff' },
      followUpAssignee: null,
      followUpClosedBy: null,
      updatedBy: null
    };

    const without = toActionResponse(base);
    const withFollowUp = toActionResponse({
      ...base,
      followUpRequired: true,
      followUpNote: 'n',
      followUpStatus: 'Open',
      followUpAssignee: { id: 'u2', name: 'Chen Wei', role: 'ITStaff', isActive: false }
    });

    expect(without.followUp).toEqual({ required: false, note: null, assignee: null, status: null, closedAt: null, closedBy: null });
    expect(Object.keys(withFollowUp.followUp)).toEqual(Object.keys(without.followUp));
    expect(withFollowUp.followUp.assignee).toEqual({ id: 'u2', name: 'Chen Wei', role: 'ITStaff', isActive: false });
    expect(without).not.toHaveProperty('followUpRequired');
  });
});
