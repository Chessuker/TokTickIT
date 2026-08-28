/**
 * Client-side attachment rules (BR-05, BR-06, BR-07).
 *
 * These mirror the server's upload validation so the user is told about an
 * oversized or unsupported file while picking it, instead of after a failed
 * request. The server repeats every check — this is a convenience, never the
 * enforcement point.
 */

export const MAX_ATTACHMENTS = 5
export const MAX_FILE_BYTES = 5 * 1024 * 1024

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const ALLOWED_TYPES_LABEL = 'JPG, PNG, WEBP, PDF'

export interface RejectedFile {
  name: string
  reason: string
}

export interface FileSelectionResult {
  accepted: File[]
  rejected: RejectedFile[]
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Merges newly picked files into the already staged ones, dropping and
 * explaining any that break a rule. Duplicates (same name and size) are
 * rejected too, so picking the same file twice cannot silently consume two of
 * the five slots.
 */
export function addFiles(staged: File[], picked: File[]): FileSelectionResult {
  const accepted = [...staged]
  const rejected: RejectedFile[] = []

  for (const file of picked) {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ name: file.name, reason: `Unsupported file type. Allowed: ${ALLOWED_TYPES_LABEL}.` })
      continue
    }

    if (file.size > MAX_FILE_BYTES) {
      rejected.push({
        name: file.name,
        reason: `File is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`,
      })
      continue
    }

    if (accepted.some((existing) => existing.name === file.name && existing.size === file.size)) {
      rejected.push({ name: file.name, reason: 'This file has already been added.' })
      continue
    }

    if (accepted.length >= MAX_ATTACHMENTS) {
      rejected.push({ name: file.name, reason: `At most ${MAX_ATTACHMENTS} files can be attached.` })
      continue
    }

    accepted.push(file)
  }

  return { accepted, rejected }
}
