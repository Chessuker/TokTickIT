/**
 * The single error envelope every non-2xx response uses (api-spec.md §1.2).
 *
 * Keeping the shape in one place means a route can never invent its own, and
 * §1.3 ("safe errors") is enforced by construction: `internalError` is the only
 * way to answer a 500 and it never accepts a message from the caller, so a
 * Prisma or file-system string cannot leak into a response body.
 */
import type { Response } from 'express';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'REQUESTER_REQUIRED'
  | 'ATTACHMENT_LIMIT_REACHED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL_ERROR';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    correlationId?: string;
  };
}

export const SAFE_INTERNAL_MESSAGE = 'Something went wrong. Please try again.';

export function errorBody(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>
): ErrorBody {
  const body: ErrorBody = { error: { code, message } };
  if (fields) {
    body.error.fields = fields;
  }
  return body;
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>
): Response {
  return res.status(status).json(errorBody(code, message, fields));
}

export function sendValidationFailed(res: Response, fields: Record<string, string>): Response {
  return sendError(res, 400, 'VALIDATION_FAILED', 'One or more fields are invalid.', fields);
}

/**
 * Answers a 500 with the generic message and logs the real cause server-side
 * against a correlation id, so a bug report can be traced without the client
 * ever seeing a stack trace (api-spec.md §1.3).
 */
export function sendInternalError(res: Response, context: string, cause: unknown): Response {
  const correlationId = randomCorrelationId();
  console.error(`[${correlationId}] ${context}:`, cause);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: SAFE_INTERNAL_MESSAGE,
      correlationId
    }
  });
}

function randomCorrelationId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
