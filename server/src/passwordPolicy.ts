/**
 * Password policy (BR-08, AD-08): 8–72 characters with at least one upper-case
 * letter, one lower-case letter, one digit and one non-alphanumeric character.
 *
 * The ceiling is bcrypt's 72-byte input limit — anything longer would be
 * silently truncated by the hash, so it is refused up front instead. Length is
 * measured in bytes for the same reason, while the character-class checks look
 * at the string itself.
 */

/** bcrypt work factor for every stored hash (BR-09). */
export const BCRYPT_COST = 10;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'digit' | 'special';
  label: string;
  test: (password: string) => boolean;
}

/** The rules in the order the UI lists them; each names exactly one failure. */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'length',
    label: `At least ${PASSWORD_MIN_LENGTH} characters (at most ${PASSWORD_MAX_BYTES})`,
    test: (password) =>
      password.length >= PASSWORD_MIN_LENGTH && Buffer.byteLength(password, 'utf8') <= PASSWORD_MAX_BYTES
  },
  { id: 'upper', label: 'One upper-case letter', test: (password) => /[A-Z]/.test(password) },
  { id: 'lower', label: 'One lower-case letter', test: (password) => /[a-z]/.test(password) },
  { id: 'digit', label: 'One digit', test: (password) => /[0-9]/.test(password) },
  {
    id: 'special',
    label: 'One special character',
    test: (password) => /[^A-Za-z0-9]/.test(password)
  }
];

/**
 * Returns the first rule the password breaks as a message, or `null` when it
 * satisfies all of them. One message rather than a list keeps the field error
 * short; the live rules panel on the client shows the full picture.
 */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'A password is required.';
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return `Password must be at most ${PASSWORD_MAX_BYTES} characters.`;
  }

  for (const rule of PASSWORD_RULES) {
    if (rule.id === 'length') continue;
    if (!rule.test(password)) {
      return `Password must contain ${rule.label.toLowerCase()}.`;
    }
  }

  return null;
}
