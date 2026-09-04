/**
 * Attachment rules and storage helpers (BR-05, BR-06, BR-07, BR-08 … BR-10).
 *
 * Everything here is deliberately free of Express and Prisma so the rules can
 * be read — and tested — on their own. The route in `app.ts` decides *when* to
 * apply them; this module decides *what* they are.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** BR-06 — 5 MB, expressed the same way the client states it. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** BR-07 — at most five *active* attachments per ticket. */
export const MAX_ACTIVE_ATTACHMENTS = 5;

/** BR-05 — the only content types a requester may attach. */
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export const ALLOWED_TYPES_LABEL = 'JPG, PNG, WEBP, PDF';

export const FILE_TOO_LARGE_MESSAGE = `The file is larger than the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`;

/** Removal reasons are trimmed and bounded (api-spec.md §3.10). */
export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 500;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

/**
 * Identifies a buffer by its leading bytes rather than by the name or the
 * `Content-Type` the client supplied, so renaming `payload.exe` to `notes.pdf`
 * does not get it past BR-05. Returns `null` when the content is not one of the
 * four allowed formats.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'image/png';
  }

  // WEBP is a RIFF container: "RIFF" then a four-byte length then "WEBP".
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }

  return null;
}

export function isAllowedMimeType(mimeType: string | null): mimeType is string {
  return mimeType !== null && (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export interface ReasonValidation {
  reason?: string;
  error?: string;
}

/** BR-09 — a removal without a stated reason is not a removal. */
export function validateRemovalReason(raw: unknown): ReasonValidation {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { error: 'A reason is required to remove an attachment.' };
  }

  const reason = raw.trim();

  if (reason.length < REASON_MIN_LENGTH) {
    return { error: `Reason must be at least ${REASON_MIN_LENGTH} characters.` };
  }

  if (reason.length > REASON_MAX_LENGTH) {
    return { error: `Reason must be at most ${REASON_MAX_LENGTH} characters.` };
  }

  return { reason };
}

/**
 * Where uploaded files live. Read per call rather than captured at import time
 * so a test can point `UPLOAD_DIR` at a temporary folder.
 */
export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? path.resolve(process.cwd(), 'uploads');
}

/**
 * Resolves a stored file to an absolute path. Only the base name of the stored
 * value is used, so even a tampered `storagePath` cannot climb out of the
 * upload directory.
 */
export function resolveStoredFile(storagePath: string): string {
  return path.join(uploadDir(), path.basename(storagePath));
}

/**
 * Writes the upload under a generated uuid name and returns that name for
 * `storagePath`. The requester's original file name is kept in the database for
 * display only — it never touches the file system, so `../` and reserved
 * Windows names are harmless.
 */
export async function storeAttachmentFile(buffer: Buffer, mimeType: string): Promise<string> {
  const directory = uploadDir();
  await mkdir(directory, { recursive: true });

  const storagePath = `${randomUUID()}${EXTENSION_BY_MIME[mimeType] ?? ''}`;
  await writeFile(path.join(directory, storagePath), buffer);

  return storagePath;
}

export async function readAttachmentFile(storagePath: string): Promise<Buffer> {
  return readFile(resolveStoredFile(storagePath));
}

/**
 * Builds the download header from the requester's original file name. Quotes,
 * backslashes and control characters are replaced rather than escaped: a header
 * value is not a place to be clever about user-supplied text.
 */
export function contentDisposition(fileName: string): string {
  const safe = fileName.replace(/[\r\n"\\]/g, '_').trim() || 'attachment';
  return `attachment; filename="${safe}"`;
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  isRemoved: boolean;
  removedReason: string | null;
  removedAt: Date | null;
}

/**
 * The wire shape of an Attachment (api-spec.md §2). `downloadUrl` is `null` for
 * a removed attachment: the metadata stays visible while the file becomes
 * unreachable (BR-10), and the UI needs no rule of its own to hide the button.
 */
export function toAttachmentResponse(row: AttachmentRow) {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt,
    isRemoved: row.isRemoved,
    removedReason: row.removedReason,
    removedAt: row.removedAt,
    downloadUrl: row.isRemoved ? null : `/api/attachments/${row.id}/download`
  };
}

/** The `select` behind every Attachment response; `storagePath` stays private. */
export const ATTACHMENT_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
  isRemoved: true,
  removedReason: true,
  removedAt: true
} as const;
