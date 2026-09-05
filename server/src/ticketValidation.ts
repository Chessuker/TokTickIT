/**
 * Create-Ticket request validation (api-spec.md §3.4).
 *
 * Pure and database-free so the rules can be unit-tested on their own. The two
 * checks that genuinely need the database — does this category / related system
 * exist and is it active — are applied by the route afterwards and merged into
 * the same `fields` map, so the client receives one complete error response
 * rather than discovering one problem per round trip.
 */

export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SUMMARY_MIN = 5;
export const SUMMARY_MAX = 150;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 5000;

/** Server-owned fields a client may never set (BR-01, BR-02). */
const SERVER_OWNED_FIELDS = ['status', 'ticketNumber'] as const;

export interface CreateTicketValues {
  summary: string;
  description: string;
  categoryId: string;
  relatedSystemId: string;
  priority: Priority;
}

export interface CreateTicketValidation {
  fieldErrors: Record<string, string>;
  /** Populated only when `fieldErrors` is empty. */
  values: CreateTicketValues | null;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateCreateTicketInput(body: unknown): CreateTicketValidation {
  const fieldErrors: Record<string, string> = {};
  const input = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  for (const field of SERVER_OWNED_FIELDS) {
    if (input[field] !== undefined) {
      fieldErrors[field] = `${field} is assigned by the server and cannot be supplied.`;
    }
  }

  // `summary` is the API name; the UI labels the same field "Summary / Title".
  const summary = asTrimmedString(input.summary);
  if (!summary) {
    fieldErrors.summary = 'Summary is required.';
  } else if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    fieldErrors.summary = `Summary must be between ${SUMMARY_MIN} and ${SUMMARY_MAX} characters.`;
  }

  const description = asTrimmedString(input.description);
  if (!description) {
    fieldErrors.description = 'Description is required.';
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    fieldErrors.description = `Description must be between ${DESCRIPTION_MIN} and ${DESCRIPTION_MAX} characters.`;
  }

  const categoryId = asTrimmedString(input.categoryId);
  if (!categoryId) {
    fieldErrors.categoryId = 'Category is required.';
  }

  const relatedSystemId = asTrimmedString(input.relatedSystemId);
  if (!relatedSystemId) {
    fieldErrors.relatedSystemId = 'Related System is required.';
  }

  const priority = asTrimmedString(input.priority);
  if (!priority) {
    fieldErrors.priority = 'Requested Priority is required.';
  } else if (!(PRIORITIES as readonly string[]).includes(priority)) {
    fieldErrors.priority = `Requested Priority must be one of ${PRIORITIES.join(', ')}.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values: null };
  }

  return {
    fieldErrors,
    values: {
      summary,
      description,
      categoryId,
      relatedSystemId,
      priority: priority as Priority
    }
  };
}
