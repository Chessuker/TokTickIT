/**
 * Multipart reception for `POST /api/tickets/:id/attachments` (api-spec.md §3.7).
 *
 * Multer is invoked from inside the route rather than mounted as middleware so
 * the ticket lookup and the ownership check run *first*. A requester poking at
 * someone else's ticket is refused with `403` before a single byte of their
 * body is accepted, and the documented "most specific error wins" ordering
 * holds even when a request breaks two rules at once.
 *
 * The file is held in memory: the size cap is small, and the content has to be
 * sniffed (BR-05) before it earns a place on disk. `limits.fileSize` still
 * aborts an oversized upload while it streams, so a 100 MB body is refused
 * rather than buffered.
 */
import multer from 'multer';
import type { Request, Response } from 'express';
import { MAX_FILE_BYTES } from './attachmentRules.js';

const receive = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
}).single('file');

export type UploadOutcome =
  | { status: 'ok'; file: Express.Multer.File | undefined }
  | { status: 'too_large' }
  | { status: 'invalid'; message: string }
  | { status: 'failed'; cause: unknown };

export function receiveUpload(req: Request, res: Response): Promise<UploadOutcome> {
  return new Promise((resolve) => {
    receive(req, res, (error: unknown) => {
      if (!error) {
        resolve({ status: 'ok', file: req.file });
        return;
      }

      const code = (error as { code?: string }).code;

      if (code === 'LIMIT_FILE_SIZE') {
        resolve({ status: 'too_large' });
        return;
      }

      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        resolve({ status: 'invalid', message: 'Upload exactly one file in the "file" field.' });
        return;
      }

      resolve({ status: 'failed', cause: error });
    });
  });
}
