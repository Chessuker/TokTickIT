import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Uploads land in a throwaway directory instead of `server/uploads/`, so the
// suite exercises the real write path without leaving files in the repo.
const UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'toktickit-uploads-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;

vi.mock('../src/db.js', () => ({
  prisma: {
    requesterUser: { findFirst: vi.fn() },
    ticket: { findFirst: vi.fn() },
    attachment: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/db.js';
import { MAX_FILE_BYTES } from '../src/attachmentRules.js';

/**
 * API-07 … API-11 and API-14 — the attachment lifecycle (FR-05, AC-06 … AC-09,
 * BR-05 … BR-10).
 *
 * Like the ticket suite, this one runs without PostgreSQL: `src/db.js` is
 * mocked. The file system is *not* mocked — uploads are written to a temporary
 * directory and read back — because "the bytes reach disk and come back" is
 * precisely what the download and soft-removal rules are about.
 */

const REQUESTER_ID = '6f1b7c58-6c2a-4f5f-9b31-2c1f0a9d77e2';
const OTHER_REQUESTER_ID = '11111111-2222-4333-8444-555555555555';
const TICKET_ID = 'c3d4e5f6-1111-4222-8333-444455556666';
const ATTACHMENT_ID = 'd4e5f6a7-1111-4222-8333-444455556666';

const REQUESTER = {
  id: REQUESTER_ID,
  name: 'Jennifer Anderson',
  email: 'jennifer.anderson@kmutt.ac.th',
  department: 'Registrar'
};

/** A minimal but genuinely valid PNG header, so the sniffer accepts it. */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('screenshot pixels')
]);

const PDF_BYTES = Buffer.from('%PDF-1.7\nbattery report\n');

function ticketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TICKET_ID,
    ticketNumber: 'TKT-2026-000001',
    summary: 'Laptop battery drains quickly',
    description: 'The battery drops from 100% to 20% within an hour.',
    status: 'New',
    priority: 'Medium',
    createdAt: new Date('2026-08-23T04:15:00.000Z'),
    updatedAt: new Date('2026-08-23T04:15:00.000Z'),
    category: { id: 'a1b2c3d4-1111-4222-8333-444455556666', name: 'Hardware' },
    relatedSystem: { id: 'b2c3d4e5-1111-4222-8333-444455556666', name: 'Corporate Laptop' },
    requester: REQUESTER,
    requesterId: REQUESTER_ID,
    attachments: [],
    ...overrides
  };
}

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    fileName: 'battery-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: PDF_BYTES.length,
    uploadedAt: new Date('2026-08-23T04:20:00.000Z'),
    isRemoved: false,
    removedReason: null,
    removedAt: null,
    storagePath: 'stored-file.pdf',
    ticket: { requesterId: REQUESTER_ID },
    ...overrides
  };
}

function upload(bytes: Buffer, fileName: string, contentType: string, requesterId = REQUESTER_ID) {
  return request(app)
    .post(`/api/tickets/${TICKET_ID}/attachments`)
    .set('X-Requester-Id', requesterId)
    .attach('file', bytes, { filename: fileName, contentType });
}

function removal(body: unknown, requesterId = REQUESTER_ID) {
  return request(app)
    .patch(`/api/attachments/${ATTACHMENT_ID}/remove`)
    .set('X-Requester-Id', requesterId)
    .send(body as object);
}

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(prisma.requesterUser.findFirst).mockResolvedValue(REQUESTER);
  vi.mocked(prisma.ticket.findFirst).mockResolvedValue(ticketRow());
  vi.mocked(prisma.attachment.count).mockResolvedValue(0);
  vi.mocked(prisma.attachment.findFirst).mockResolvedValue(attachmentRow());
  vi.mocked(prisma.attachment.create).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      id: ATTACHMENT_ID,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      uploadedAt: new Date('2026-08-23T04:20:00.000Z'),
      isRemoved: false,
      removedReason: null,
      removedAt: null
    })
  );
  vi.mocked(prisma.attachment.update).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({
      ...attachmentRow(),
      storagePath: undefined,
      ticket: undefined,
      ...data
    })
  );
});

afterAll(() => {
  rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('POST /api/tickets/:id/attachments — accepted upload (FR-05)', () => {
  it('returns 201 with the stored attachment and a download url', async () => {
    const res = await upload(PNG_BYTES, 'screenshot.png', 'image/png');

    expect(res.status).toBe(201);
    expect(res.body.fileName).toBe('screenshot.png');
    expect(res.body.mimeType).toBe('image/png');
    expect(res.body.sizeBytes).toBe(PNG_BYTES.length);
    expect(res.body.isRemoved).toBe(false);
    expect(res.body.downloadUrl).toBe(`/api/attachments/${ATTACHMENT_ID}/download`);
  });

  it('writes the file under a generated name and never exposes the storage path', async () => {
    const before = readdirSync(UPLOAD_DIR).length;
    const res = await upload(PNG_BYTES, '../../etc/passwd.png', 'image/png');

    expect(res.status).toBe(201);
    expect(res.body.storagePath).toBeUndefined();

    const files = readdirSync(UPLOAD_DIR);
    expect(files.length).toBe(before + 1);
    // The requester's path-like name never reaches the file system.
    expect(files.some((name) => name.includes('passwd'))).toBe(false);

    const stored = vi.mocked(prisma.attachment.create).mock.calls[0][0].data.storagePath as string;
    expect(stored).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it('accepts a file whose type is sniffed despite a misleading Content-Type', async () => {
    const res = await upload(PDF_BYTES, 'report.bin', 'application/octet-stream');

    expect(res.status).toBe(201);
    expect(res.body.mimeType).toBe('application/pdf');
  });

  it('refuses to upload into another requester\'s ticket (BR-04)', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterId: OTHER_REQUESTER_ID })
    );

    const res = await upload(PNG_BYTES, 'screenshot.png', 'image/png');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('answers 404 when the ticket does not exist', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null);

    const res = await upload(PNG_BYTES, 'screenshot.png', 'image/png');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/tickets/:id/attachments — oversized file (API-07, AC-06, BR-06)', () => {
  it('rejects a file larger than 5 MB with 413', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_FILE_BYTES, 0x41)]);

    const res = await upload(oversized, 'huge.png', 'image/png');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('stores nothing when the file is refused for size', async () => {
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_FILE_BYTES, 0x41)]);
    const before = readdirSync(UPLOAD_DIR).length;

    await upload(oversized, 'huge.png', 'image/png');

    expect(prisma.attachment.create).not.toHaveBeenCalled();
    expect(readdirSync(UPLOAD_DIR).length).toBe(before);
  });

  it('accepts a file that sits exactly on the limit', async () => {
    const exact = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_FILE_BYTES - PNG_BYTES.length, 0x41)]);

    const res = await upload(exact, 'exactly-five-mb.png', 'image/png');

    expect(res.status).toBe(201);
    expect(res.body.sizeBytes).toBe(MAX_FILE_BYTES);
  });
});

describe('POST /api/tickets/:id/attachments — disallowed type (API-08, AC-07, BR-05)', () => {
  it('rejects a .txt upload with 415', async () => {
    const res = await upload(Buffer.from('just some notes'), 'notes.txt', 'text/plain');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('rejects an executable renamed to .pdf — the bytes decide, not the name', async () => {
    const executable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    const res = await upload(executable, 'invoice.pdf', 'application/pdf');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a request that carries no file at all', async () => {
    const res = await request(app)
      .post(`/api/tickets/${TICKET_ID}/attachments`)
      .set('X-Requester-Id', REQUESTER_ID)
      .field('note', 'no file here');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.file).toBeTruthy();
  });
});

describe('POST /api/tickets/:id/attachments — the sixth file (API-09, AC-08, BR-07)', () => {
  it('rejects the upload once five active attachments exist', async () => {
    vi.mocked(prisma.attachment.count).mockResolvedValue(5);

    const res = await upload(PNG_BYTES, 'sixth.png', 'image/png');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ATTACHMENT_LIMIT_REACHED');
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('counts active attachments only, so a removed one frees its slot', async () => {
    vi.mocked(prisma.attachment.count).mockResolvedValue(4);

    const res = await upload(PNG_BYTES, 'fifth.png', 'image/png');

    expect(res.status).toBe(201);
    expect(vi.mocked(prisma.attachment.count).mock.calls[0][0].where).toEqual({
      ticketId: TICKET_ID,
      isRemoved: false
    });
  });
});

describe('PATCH /api/attachments/:id/remove — with a reason (API-10, AC-09, BR-08)', () => {
  it('returns 200 with isRemoved true, the reason and a removal timestamp', async () => {
    const res = await removal({ reason: 'Uploaded the wrong screenshot' });

    expect(res.status).toBe(200);
    expect(res.body.isRemoved).toBe(true);
    expect(res.body.removedReason).toBe('Uploaded the wrong screenshot');
    expect(res.body.removedAt).toBeTruthy();
    expect(res.body.downloadUrl).toBeNull();
  });

  it('updates the row instead of deleting it — the file and the record survive', async () => {
    await removal({ reason: 'Uploaded the wrong screenshot' });

    const call = vi.mocked(prisma.attachment.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: ATTACHMENT_ID });
    expect(call.data.isRemoved).toBe(true);
    expect(call.data.removedReason).toBe('Uploaded the wrong screenshot');
    expect(call.data.removedAt).toBeInstanceOf(Date);
    // Nothing on the mocked client can delete; a delete call would be a
    // TypeError here, which is the point of not providing one.
    expect(prisma.attachment).not.toHaveProperty('delete');
  });

  it('trims the stored reason', async () => {
    await removal({ reason: '   Wrong file   ' });

    expect(vi.mocked(prisma.attachment.update).mock.calls[0][0].data.removedReason).toBe('Wrong file');
  });

  it("refuses to remove another requester's attachment (BR-04)", async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({ ticket: { requesterId: OTHER_REQUESTER_ID } })
    );

    const res = await removal({ reason: 'Not mine but trying anyway' });

    expect(res.status).toBe(403);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('refuses to remove an attachment twice, preserving the first reason', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({
        isRemoved: true,
        removedReason: 'The original reason',
        removedAt: new Date('2026-08-24T09:00:00.000Z')
      })
    );

    const res = await removal({ reason: 'A second reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/attachments/:id/remove — without a reason (API-14, AC-09, BR-09)', () => {
  it('rejects a missing reason with 400 and leaves the attachment untouched', async () => {
    const res = await removal({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.reason).toBeTruthy();
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('rejects a whitespace-only reason', async () => {
    const res = await removal({ reason: '     ' });

    expect(res.status).toBe(400);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('rejects a reason shorter than three characters', async () => {
    const res = await removal({ reason: 'no' });

    expect(res.status).toBe(400);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });

  it('rejects a reason longer than 500 characters', async () => {
    const res = await removal({ reason: 'x'.repeat(501) });

    expect(res.status).toBe(400);
    expect(prisma.attachment.update).not.toHaveBeenCalled();
  });
});

describe('GET /api/attachments/:id/download (API-11, AC-09, BR-09, BR-10)', () => {
  it('streams an active attachment with its original file name', async () => {
    const created = await upload(PDF_BYTES, 'battery report.pdf', 'application/pdf');
    const storagePath = vi.mocked(prisma.attachment.create).mock.calls[0][0].data.storagePath as string;

    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({ storagePath, fileName: 'battery report.pdf', sizeBytes: PDF_BYTES.length })
    );

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}/download`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(created.status).toBe(201);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('battery report.pdf');
    expect(Buffer.from(res.body).equals(PDF_BYTES)).toBe(true);
  });

  it('refuses to serve a removed attachment and streams nothing', async () => {
    const created = await upload(PDF_BYTES, 'battery-report.pdf', 'application/pdf');
    const storagePath = vi.mocked(prisma.attachment.create).mock.calls[0][0].data.storagePath as string;

    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({
        storagePath,
        isRemoved: true,
        removedReason: 'Uploaded the wrong screenshot',
        removedAt: new Date('2026-08-24T09:00:00.000Z')
      })
    );

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}/download`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(created.status).toBe(201);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.headers['content-disposition']).toBeUndefined();
    // The file is still on disk — the refusal is about state, not deletion.
    expect(readdirSync(UPLOAD_DIR)).toContain(storagePath);
  });

  it("refuses to serve another requester's attachment", async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({ ticket: { requesterId: OTHER_REQUESTER_ID } })
    );

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}/download`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(res.status).toBe(403);
  });

  it('answers 404 when the row exists but the stored file is gone', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({ storagePath: 'never-written.pdf' })
    );

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}/download`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('answers 404 for an attachment that does not exist', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}/download`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(res.status).toBe(404);
  });

  it('requires a selected requester', async () => {
    const res = await request(app).get(`/api/attachments/${ATTACHMENT_ID}/download`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('REQUESTER_REQUIRED');
  });
});

describe('GET /api/attachments/:id — metadata (BR-10)', () => {
  it('returns metadata for a removed attachment with a null download url', async () => {
    vi.mocked(prisma.attachment.findFirst).mockResolvedValue(
      attachmentRow({
        isRemoved: true,
        removedReason: 'Contained personal data',
        removedAt: new Date('2026-08-24T09:00:00.000Z')
      })
    );

    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(res.status).toBe(200);
    expect(res.body.isRemoved).toBe(true);
    expect(res.body.removedReason).toBe('Contained personal data');
    expect(res.body.removedAt).toBeTruthy();
    expect(res.body.downloadUrl).toBeNull();
  });

  it('never leaks the storage path', async () => {
    const res = await request(app)
      .get(`/api/attachments/${ATTACHMENT_ID}`)
      .set('X-Requester-Id', REQUESTER_ID);

    expect(res.body.storagePath).toBeUndefined();
  });
});

/**
 * The check order of api-spec.md §3.7, exercised where it actually matters:
 * requests that break more than one rule at once. Reported in peer review on
 * Issue #6, where an oversized file of a disallowed type answered `413` because
 * the upload middleware aborted the stream before anything could look at the
 * content.
 */
describe('POST /api/tickets/:id/attachments — check order (AC-06, AC-07)', () => {
  const oversized = (head: Buffer) =>
    Buffer.concat([head, Buffer.alloc(MAX_FILE_BYTES, 0x41)]);

  it('answers 415, not 413, for a file that is both oversized and the wrong type', async () => {
    const res = await upload(oversized(Buffer.from('plain text, no signature')), 'huge.txt', 'text/plain');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('answers 415 for an oversized executable renamed to .pdf', async () => {
    const executable = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

    const res = await upload(oversized(executable), 'invoice.pdf', 'application/pdf');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('still answers 413 when the only broken rule is the size', async () => {
    const res = await upload(oversized(PNG_BYTES), 'huge.png', 'image/png');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('reports the real size of a body far past the limit without buffering it', async () => {
    // Ten times the limit. The storage engine retains only MAX_FILE_BYTES + 1
    // bytes, so the assertion below proves `size` is counted, not measured off
    // the buffer.
    const enormous = Buffer.concat([PNG_BYTES, Buffer.alloc(MAX_FILE_BYTES * 10, 0x41)]);

    const res = await upload(enormous, 'enormous.png', 'image/png');

    expect(res.status).toBe(413);
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });

  it('checks ownership before it accepts any of the body', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(
      ticketRow({ requesterId: OTHER_REQUESTER_ID })
    );

    const res = await upload(oversized(PNG_BYTES), 'huge.png', 'image/png');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('checks the type before the attachment limit', async () => {
    vi.mocked(prisma.attachment.count).mockResolvedValue(5);

    const res = await upload(Buffer.from('just some notes'), 'notes.txt', 'text/plain');

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
