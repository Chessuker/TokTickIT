/**
 * Multipart reception for `POST /api/tickets/:id/attachments` (api-spec.md §3.7).
 *
 * Multer is invoked from inside the route rather than mounted as middleware so
 * the ticket lookup and the ownership check run *first*. A requester poking at
 * someone else's ticket is refused with `403` before a single byte of their
 * body is accepted, and the documented "most specific error wins" ordering
 * holds even when a request breaks two rules at once.
 *
 * That ordering is also why `limits.fileSize` is *not* used. Multer aborts the
 * request the moment the cap is passed, which happens before the route can look
 * at the content: a 6 MB `.exe` would come back as `413` when the spec says the
 * more specific `415` wins. The storage engine below keeps the type check
 * possible by retaining the head of the stream and counting the rest, so the
 * route always knows both what the file is and how big it is.
 *
 * Memory stays bounded either way: at most `MAX_FILE_BYTES + 1` bytes are ever
 * held, however large the body is. Anything past that is counted and dropped
 * rather than buffered.
 */
import multer from 'multer';
import type { Request, Response } from 'express';
import { MAX_FILE_BYTES } from './attachmentRules.js';

/**
 * One byte past the limit is enough to prove a file is too large, and the first
 * twelve are enough to identify it, so nothing beyond this is worth keeping.
 */
const RETAIN_BYTES = MAX_FILE_BYTES + 1;

/**
 * A memory storage engine that truncates instead of failing.
 *
 * `size` is the real byte count of the upload, not the size of the buffer:
 * `buffer` stops growing at `RETAIN_BYTES` while `size` keeps counting, so an
 * oversized file is still recognisable by its signature and still reported at
 * its true size.
 */
const truncatingMemoryStorage: multer.StorageEngine = {
  _handleFile(_req, file, callback) {
    const chunks: Buffer[] = [];
    let retained = 0;
    let size = 0;

    file.stream.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (retained < RETAIN_BYTES) {
        const room = RETAIN_BYTES - retained;
        const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
        chunks.push(slice);
        retained += slice.length;
      }
    });

    file.stream.on('error', callback);
    file.stream.on('end', () => callback(null, { buffer: Buffer.concat(chunks), size }));
  },

  // Nothing was written anywhere, so cleanup after a failed request is a no-op.
  _removeFile(_req, _file, callback) {
    callback(null);
  }
};

const receive = multer({ storage: truncatingMemoryStorage, limits: { files: 1 } }).single('file');

export type UploadOutcome =
  | { status: 'ok'; file: Express.Multer.File | undefined }
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

      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') {
        resolve({ status: 'invalid', message: 'Upload exactly one file in the "file" field.' });
        return;
      }

      resolve({ status: 'failed', cause: error });
    });
  });
}
