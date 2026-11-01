import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * UNIT-09 — BR-08, BR-18, AC-16: Actions Taken and status history are
 * append-only by construction. No application module may update or delete a
 * history row or delete an Action, so the only way to change the record is
 * the PATCH that BR-08 allows (which keeps id, ticket and performer).
 *
 * The seed is excluded: it upserts its own fixed fixture rows (BR-30), which
 * are fixtures, not history anyone recorded (specification.md §7).
 */

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const EXCLUDED = new Set(['seed.ts', 'seedData.ts']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !EXCLUDED.has(entry.name) ? [path] : [];
  });
}

const FORBIDDEN = [
  /ticketStatusChange\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/,
  /ticketAction\s*\.\s*(delete|deleteMany)\b/
];

describe('append-only Actions and history (UNIT-09)', () => {
  const files = sourceFiles(SRC);

  it('scans the application sources', () => {
    expect(files.some((file) => file.endsWith('actionRoutes.ts'))).toBe(true);
  });

  it.each(FORBIDDEN.map((pattern) => [pattern.source, pattern] as const))('no module calls %s', (_label, pattern) => {
    const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
