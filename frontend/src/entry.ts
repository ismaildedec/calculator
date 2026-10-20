// The rules for the number being typed, kept pure so the keypad stays a thin wrapper.

export function appendDigit(entry: string, digit: string, replace: boolean): string {
  if (replace || entry === '0') {
    return digit
  }
  if (entry === '-0') {
    return `-${digit}`
  }
  return entry + digit
}

export function appendDot(entry: string, replace: boolean): string {
  if (replace) {
    return '0.'
  }
  return entry.includes('.') ? entry : `${entry}.`
}

export function toggleSign(entry: string): string {
  return entry.startsWith('-') ? entry.slice(1) : `-${entry}`
}

export function removeLast(entry: string): string {
  const shortened = entry.slice(0, -1)
  return shortened === '' || shortened === '-' ? '0' : shortened
}

// The keypad cannot produce a malformed number, but it can produce one too large for a
// float64: enough digits and Number returns Infinity, which JSON.stringify writes as null.
export function entryToOperand(entry: string): number | null {
  const value = Number(entry)
  return Number.isFinite(value) ? value : null
}
