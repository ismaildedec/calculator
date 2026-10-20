// Runs before a request is sent, so an empty or unparseable operand never reaches the
// backend. The backend validates the same things again; neither layer trusts the other.
export function validateOperand(raw: string): string | undefined {
  if (raw.trim().length === 0) {
    return 'Enter a number.'
  }

  const value = Number(raw)
  if (Number.isNaN(value)) {
    return 'Enter a valid number.'
  }
  if (!Number.isFinite(value)) {
    return 'This number is too large.'
  }
  return undefined
}
