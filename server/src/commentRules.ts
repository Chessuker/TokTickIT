/**
 * Rules shared by Public Comments and Internal Notes (api-spec.md §2, §3.6,
 * §3.7; BR-22).
 *
 * The two tables have the same shape and the same body rule, so the
 * validation and the response `select` live here once. Internal Notes (Issue
 * #40) reuse both; only the table and the role gate differ.
 */

export const COMMENT_MIN_LENGTH = 1;
export const COMMENT_MAX_LENGTH = 2000;

/** The `select` behind a `Comment` / `InternalNote` response (api-spec.md §2). */
export const COMMENT_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  author: { select: { id: true, name: true, role: true } }
} as const;

/**
 * Trims the body and checks the length (BR-22). The body is stored exactly as
 * typed after trimming — never escaped or interpreted; the client renders it
 * as a text node (AD-09).
 */
export function validateCommentBody(raw: unknown): { body: string; error?: undefined } | { body?: undefined; error: string } {
  if (typeof raw !== 'string') {
    return { error: 'Comment cannot be empty.' };
  }

  const body = raw.trim();

  if (body.length < COMMENT_MIN_LENGTH) {
    return { error: 'Comment cannot be empty.' };
  }

  if (body.length > COMMENT_MAX_LENGTH) {
    return { error: `Comment must be at most ${COMMENT_MAX_LENGTH} characters.` };
  }

  return { body };
}
