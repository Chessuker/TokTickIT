/**
 * Actions Taken rules (Lab 4 specification.md §5 BR-03 … BR-11; api-spec.md
 * §2 "Action", §3.3, §3.4).
 *
 * Pure and database-free, like `ticketWorkflow.ts`: every field rule and every
 * follow-up state rule is decided here, so UNIT-01 / UNIT-02 can cover each
 * case without a route, and the routes only load rows, ask, and write.
 *
 * Two things stay with the routes because they need the database: whether a
 * follow-up assignee is an active IT Staff member (BR-06), and whether the
 * caller's `version` is still current (BR-19).
 */
import type { TicketStatusValue } from './ticketWorkflow.js';

export const DESCRIPTION_MAX = 2000;
export const RESULT_MAX = 1000;
export const FOLLOW_UP_NOTE_MAX = 1000;
export const ATTACHMENT_NOTES_MAX = 500;

/** BR-05: Action Date/Time may run ahead of the server clock by this much. */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;

export type FollowUpStatusValue = 'Open' | 'Completed' | 'Cancelled';

/** The two moves a follow-up can make, both out of `Open` (BR-07). */
export const FOLLOW_UP_CLOSING_STATUSES = ['Completed', 'Cancelled'] as const;
export type FollowUpClosingStatus = (typeof FOLLOW_UP_CLOSING_STATUSES)[number];

/**
 * BR-09: no Action is written while the ticket is Resolved, Closed or
 * Cancelled. To record more work, IT Staff reopen it first (AD-06).
 */
export const ACTION_LOCKED_STATUSES: readonly TicketStatusValue[] = ['Resolved', 'Closed', 'Cancelled'];

export function isActionLocked(status: TicketStatusValue): boolean {
  return ACTION_LOCKED_STATUSES.includes(status);
}

/** BR-11: newest work first, then newest entry, then id — the same on every load. */
export const ACTION_ORDER_BY = [
  { actionAt: 'desc' as const },
  { createdAt: 'desc' as const },
  { id: 'asc' as const }
];

const USER_REF = { select: { id: true, name: true, role: true } } as const;

/** The `select` behind an `Action` response (api-spec.md §2). */
export const ACTION_SELECT = {
  id: true,
  ticketId: true,
  actionAt: true,
  description: true,
  result: true,
  attachmentNotes: true,
  followUpRequired: true,
  followUpNote: true,
  followUpStatus: true,
  followUpClosedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  performedBy: USER_REF,
  followUpAssignee: { select: { id: true, name: true, role: true, isActive: true } },
  followUpClosedBy: USER_REF,
  updatedBy: USER_REF
} as const;

interface UserRef {
  id: string;
  name: string;
  role: string;
}

export interface ActionRow {
  id: string;
  ticketId: string;
  actionAt: Date;
  description: string;
  result: string;
  attachmentNotes: string | null;
  followUpRequired: boolean;
  followUpNote: string | null;
  followUpStatus: FollowUpStatusValue | null;
  followUpClosedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  performedBy: UserRef;
  followUpAssignee: (UserRef & { isActive: boolean }) | null;
  followUpClosedBy: UserRef | null;
  updatedBy: UserRef | null;
}

/**
 * Shapes one `Action` (api-spec.md §2). The follow-up columns are folded into
 * one `followUp` block that has the same keys whether or not a follow-up
 * exists, so a client never has to test for missing properties.
 */
export function toActionResponse(row: ActionRow) {
  return {
    id: row.id,
    ticketId: row.ticketId,
    actionAt: row.actionAt,
    description: row.description,
    result: row.result,
    attachmentNotes: row.attachmentNotes,
    performedBy: row.performedBy,
    followUp: {
      required: row.followUpRequired,
      note: row.followUpNote,
      assignee: row.followUpAssignee,
      status: row.followUpStatus,
      closedAt: row.followUpClosedAt,
      closedBy: row.followUpClosedBy
    },
    version: row.version,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

// ---------------------------------------------------------------------------
// Field rules (BR-05, BR-06)
// ---------------------------------------------------------------------------

export interface ActionContext {
  /** When the ticket was created; Action Date/Time may not precede it (BR-05). */
  ticketCreatedAt: Date;
  now: Date;
}

type Fields = Record<string, string>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Absent, null, or only whitespace: the user left the field empty. */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

/** A required, trimmed, length-limited text field. */
function requiredText(raw: unknown, label: string, max: number): { value?: string; error?: string } {
  if (raw !== undefined && raw !== null && typeof raw !== 'string') return { error: `${label} must be text.` };
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length === 0) return { error: `${label} is required.` };
  if (value.length > max) return { error: `${label} must be at most ${max} characters.` };
  return { value };
}

/**
 * BR-05: Action Date/Time is required, at most 5 minutes in the future, and
 * not earlier than the ticket.
 *
 * The lower bound is the ticket's creation time rounded *down* to the minute:
 * the UI's `datetime-local` input has minute precision, so a user who records
 * work in the same minute the ticket was raised must not be refused because
 * the ticket was stamped a few seconds into that minute.
 */
function parseActionAt(raw: unknown, context: ActionContext): { value?: Date; error?: string } {
  if (isBlank(raw)) return { error: 'Action date/time is required.' };
  if (typeof raw !== 'string') return { error: 'Action date/time must be a valid date and time.' };

  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return { error: 'Action date/time must be a valid date and time.' };

  if (value.getTime() > context.now.getTime() + FUTURE_TOLERANCE_MS) {
    return { error: 'Action date/time cannot be in the future.' };
  }

  const earliest = Math.floor(context.ticketCreatedAt.getTime() / 60_000) * 60_000;
  if (value.getTime() < earliest) {
    return { error: 'Action date/time cannot be before the ticket was created.' };
  }

  return { value };
}

/** Optional Attachment Notes; empty is stored as `null` (BR-05). */
function parseAttachmentNotes(raw: unknown): { value?: string | null; error?: string } {
  if (isBlank(raw)) return { value: null };
  if (typeof raw !== 'string') return { error: 'Attachment notes must be text.' };
  const value = raw.trim();
  if (value.length > ATTACHMENT_NOTES_MAX) {
    return { error: `Attachment notes must be at most ${ATTACHMENT_NOTES_MAX} characters.` };
  }
  return { value };
}

/** A follow-up that is being opened: the note and who is to do it (BR-06). */
export interface FollowUpInput {
  note: string;
  assigneeId: string;
}

/**
 * Reads the note and assignee of a follow-up that the request is opening.
 * Writes a message into `fields` for each one missing or malformed.
 */
function parseFollowUp(body: Record<string, unknown>, fields: Fields): FollowUpInput | null {
  const note = requiredText(body.followUpNote, 'Follow-up note', FOLLOW_UP_NOTE_MAX);
  if (note.error) {
    fields.followUpNote = note.error === 'Follow-up note is required.'
      ? 'A follow-up note is required when follow-up is needed.'
      : note.error;
  }

  const assignee = body.followUpAssigneeId;
  if (isBlank(assignee)) {
    fields.followUpAssigneeId = 'Choose who will do the follow-up.';
  } else if (typeof assignee !== 'string') {
    fields.followUpAssigneeId = 'The follow-up assignee must be a user id.';
  }

  if (note.value === undefined || fields.followUpAssigneeId) return null;
  return { note: note.value, assigneeId: (assignee as string).trim() };
}

function asBody(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Create (api-spec.md §3.3)
// ---------------------------------------------------------------------------

export interface ActionCreateValue {
  actionAt: Date;
  description: string;
  result: string;
  attachmentNotes: string | null;
  /** `null` when no follow-up is needed. */
  followUp: FollowUpInput | null;
  clientRequestId: string | null;
}

export type ActionCreateCheck = { ok: true; value: ActionCreateValue } | { ok: false; fields: Fields };

/**
 * `clientRequestId` on its own, because the route checks for a replay before
 * the lock and the body (api-spec.md §3.3 order of checks) and needs to know
 * whether the id is usable first. `null` = absent; `undefined` = malformed.
 */
export function readClientRequestId(raw: unknown): string | null | undefined {
  const value = asBody(raw).clientRequestId;
  if (value === undefined || value === null) return null;
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : undefined;
}

/**
 * Validates a create body (BR-05, BR-06). Every problem is reported at once,
 * each under its own field, so the form can show them all together (AC-04).
 *
 * `performedById`, `ticketId`, `followUpStatus` and `version` are never read:
 * the server decides all four (BR-03).
 */
export function validateActionCreate(raw: unknown, context: ActionContext): ActionCreateCheck {
  const body = asBody(raw);
  const fields: Fields = {};

  const actionAt = parseActionAt(body.actionAt, context);
  if (actionAt.error) fields.actionAt = actionAt.error;

  const description = requiredText(body.description, 'Action description', DESCRIPTION_MAX);
  if (description.error) fields.description = description.error;

  const result = requiredText(body.result, 'Result', RESULT_MAX);
  if (result.error) fields.result = result.error;

  const attachmentNotes = parseAttachmentNotes(body.attachmentNotes);
  if (attachmentNotes.error) fields.attachmentNotes = attachmentNotes.error;

  let followUp: FollowUpInput | null = null;
  const required = body.followUpRequired;

  if (required !== undefined && required !== null && typeof required !== 'boolean') {
    fields.followUpRequired = 'Follow-up required must be true or false.';
  } else if (required === true) {
    followUp = parseFollowUp(body, fields);
  } else {
    // Not required: a note or assignee the user filled in means they believed
    // a follow-up was set. Refuse rather than silently drop it (api-spec §3.3).
    if (!isBlank(body.followUpNote)) {
      fields.followUpNote = 'Turn on "Follow-up required" to add a follow-up note.';
    }
    if (!isBlank(body.followUpAssigneeId)) {
      fields.followUpAssigneeId = 'Turn on "Follow-up required" to assign a follow-up.';
    }
  }

  const clientRequestId = readClientRequestId(body);
  if (clientRequestId === undefined) fields.clientRequestId = 'clientRequestId must be a UUID.';

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    value: {
      actionAt: actionAt.value as Date,
      description: description.value as string,
      result: result.value as string,
      attachmentNotes: attachmentNotes.value ?? null,
      followUp,
      clientRequestId: clientRequestId ?? null
    }
  };
}

// ---------------------------------------------------------------------------
// Edit (api-spec.md §3.4)
// ---------------------------------------------------------------------------

/** What the edit needs to know about the Action as it is now. */
export interface ExistingFollowUp {
  followUpRequired: boolean;
  followUpStatus: FollowUpStatusValue | null;
}

export interface ActionPatchValue {
  version: number;
  /** Plain fields to overwrite; only the ones the request carried. */
  changes: {
    actionAt?: Date;
    description?: string;
    result?: string;
    attachmentNotes?: string | null;
    followUpNote?: string;
    followUpAssigneeId?: string;
  };
  /** Set when the request opens a follow-up on an Action that had none. */
  openFollowUp: FollowUpInput | null;
  /** Set when the request completes or cancels the open follow-up. */
  closeFollowUp: FollowUpClosingStatus | null;
  /** The assignee the route must check is an active IT Staff member, if any. */
  assigneeToCheck: string | null;
}

export type ActionPatchCheck =
  | { ok: true; value: ActionPatchValue }
  | { ok: false; kind: 'invalid'; fields: Fields }
  | { ok: false; kind: 'empty' }
  | { ok: false; kind: 'conflict'; message: string };

const EDITABLE_TEXT = ['actionAt', 'description', 'result', 'attachmentNotes'] as const;

/**
 * Validates an edit body against the Action's current follow-up (BR-05 …
 * BR-08). Field problems are `invalid` (400); a request that is well-formed
 * but impossible for the follow-up's current state is `conflict` (409).
 *
 * `version` is required here, unlike the Lab 3 ticket endpoints (AD-07): Action
 * edits are new, so they can insist on it from the start. Whether it is still
 * current is the route's question.
 */
export function validateActionPatch(
  raw: unknown,
  existing: ExistingFollowUp,
  context: ActionContext
): ActionPatchCheck {
  const body = asBody(raw);
  const fields: Fields = {};
  const changes: ActionPatchValue['changes'] = {};

  const version = body.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    fields.version = 'version is required and must be a whole number of 0 or more.';
  }

  if ('actionAt' in body) {
    const actionAt = parseActionAt(body.actionAt, context);
    if (actionAt.error) fields.actionAt = actionAt.error;
    else changes.actionAt = actionAt.value;
  }
  if ('description' in body) {
    const description = requiredText(body.description, 'Action description', DESCRIPTION_MAX);
    if (description.error) fields.description = description.error;
    else changes.description = description.value;
  }
  if ('result' in body) {
    const result = requiredText(body.result, 'Result', RESULT_MAX);
    if (result.error) fields.result = result.error;
    else changes.result = result.value;
  }
  if ('attachmentNotes' in body) {
    const attachmentNotes = parseAttachmentNotes(body.attachmentNotes);
    if (attachmentNotes.error) fields.attachmentNotes = attachmentNotes.error;
    else changes.attachmentNotes = attachmentNotes.value ?? null;
  }

  // --- follow-up (BR-06, BR-07) ---
  let openFollowUp: FollowUpInput | null = null;
  let closeFollowUp: FollowUpClosingStatus | null = null;
  let conflict: string | null = null;

  const required = body.followUpRequired;
  const opening = required === true && !existing.followUpRequired;

  if ('followUpRequired' in body) {
    if (typeof required !== 'boolean') {
      fields.followUpRequired = 'Follow-up required must be true or false.';
    } else if (required === false && existing.followUpRequired) {
      // BR-07: yes → no would erase the record that follow-up was needed.
      fields.followUpRequired = 'A follow-up cannot be removed. Cancel the follow-up instead.';
    }
  }

  const touchesNote = 'followUpNote' in body;
  const touchesAssignee = 'followUpAssigneeId' in body;

  if (opening) {
    openFollowUp = parseFollowUp(body, fields);
  } else if (touchesNote || touchesAssignee) {
    if (!existing.followUpRequired) {
      const message = 'Turn on "Follow-up required" first.';
      if (touchesNote) fields.followUpNote = message;
      if (touchesAssignee) fields.followUpAssigneeId = message;
    } else {
      if (touchesNote) {
        const note = requiredText(body.followUpNote, 'Follow-up note', FOLLOW_UP_NOTE_MAX);
        if (note.error) fields.followUpNote = note.error;
        else changes.followUpNote = note.value;
      }
      if (touchesAssignee) {
        const assignee = body.followUpAssigneeId;
        if (isBlank(assignee)) fields.followUpAssigneeId = 'Choose who will do the follow-up.';
        else if (typeof assignee !== 'string') fields.followUpAssigneeId = 'The follow-up assignee must be a user id.';
        else changes.followUpAssigneeId = assignee.trim();
      }
      // A closed follow-up is final (BR-07): its note and assignee are history.
      if (existing.followUpStatus !== 'Open') conflict = 'This follow-up is already closed and can no longer be changed.';
    }
  }

  if ('followUpStatus' in body) {
    const status = body.followUpStatus;
    if (!(FOLLOW_UP_CLOSING_STATUSES as readonly unknown[]).includes(status)) {
      fields.followUpStatus = 'followUpStatus must be Completed or Cancelled.';
    } else if (existing.followUpStatus === null) {
      conflict ??= 'This action has no follow-up to complete or cancel.';
    } else if (existing.followUpStatus !== 'Open') {
      conflict ??= 'This follow-up is already closed and can no longer be changed.';
    } else {
      closeFollowUp = status as FollowUpClosingStatus;
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, kind: 'invalid', fields };
  if (conflict) return { ok: false, kind: 'conflict', message: conflict };

  const hasChange =
    EDITABLE_TEXT.some((key) => key in changes) ||
    changes.followUpNote !== undefined ||
    changes.followUpAssigneeId !== undefined ||
    openFollowUp !== null ||
    closeFollowUp !== null;

  if (!hasChange) return { ok: false, kind: 'empty' };

  return {
    ok: true,
    value: {
      version: version as number,
      changes,
      openFollowUp,
      closeFollowUp,
      assigneeToCheck: openFollowUp?.assigneeId ?? changes.followUpAssigneeId ?? null
    }
  };
}
