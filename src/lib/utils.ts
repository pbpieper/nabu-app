/**
 * Generate a 6-character share code, excluding ambiguous characters (0, O, 1, I, l).
 */
const SHARE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateShareCode(length = 6): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += SHARE_CODE_CHARS[Math.floor(Math.random() * SHARE_CODE_CHARS.length)]
  }
  return code
}
