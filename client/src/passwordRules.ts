/**
 * Client-side copy of the password policy (BR-08, AD-08), used only to drive
 * the live rules panel on Change Password. The server repeats every check;
 * this is feedback, never the enforcement point.
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_BYTES = 72

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'digit' | 'special'
  label: string
  test: (password: string) => boolean
}

const byteLength = (value: string) => new TextEncoder().encode(value).length

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (password) => password.length >= PASSWORD_MIN_LENGTH && byteLength(password) <= PASSWORD_MAX_BYTES,
  },
  { id: 'upper', label: 'One upper-case letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'lower', label: 'One lower-case letter', test: (password) => /[a-z]/.test(password) },
  { id: 'digit', label: 'One digit', test: (password) => /[0-9]/.test(password) },
  { id: 'special', label: 'One special character', test: (password) => /[^A-Za-z0-9]/.test(password) },
]

export function passwordSatisfiesRules(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
