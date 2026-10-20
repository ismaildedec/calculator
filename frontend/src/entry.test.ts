import { describe, expect, it } from 'vitest'
import { appendDigit, appendDot, entryToOperand, removeLast, toggleSign } from './entry'

describe('appendDigit', () => {
  it('replaces the entry when a new number is starting', () => {
    expect(appendDigit('42', '7', true)).toBe('7')
  })

  it('replaces a lone zero rather than growing it', () => {
    expect(appendDigit('0', '7', false)).toBe('7')
  })

  it('keeps the sign when replacing a negative zero', () => {
    expect(appendDigit('-0', '7', false)).toBe('-7')
  })

  it('appends to an existing number', () => {
    expect(appendDigit('42', '7', false)).toBe('427')
  })

  it('appends after a decimal point', () => {
    expect(appendDigit('0.', '5', false)).toBe('0.5')
  })
})

describe('appendDot', () => {
  it('starts a decimal when a new number is starting', () => {
    expect(appendDot('42', true)).toBe('0.')
  })

  it('adds a point to a whole number', () => {
    expect(appendDot('42', false)).toBe('42.')
  })

  it('refuses a second point', () => {
    expect(appendDot('4.2', false)).toBe('4.2')
    expect(appendDot('0.', false)).toBe('0.')
  })
})

describe('toggleSign', () => {
  it('makes a positive number negative', () => {
    expect(toggleSign('42')).toBe('-42')
  })

  it('makes a negative number positive', () => {
    expect(toggleSign('-42')).toBe('42')
  })

  it('works on zero', () => {
    expect(toggleSign('0')).toBe('-0')
    expect(toggleSign('-0')).toBe('0')
  })
})

describe('removeLast', () => {
  it('drops the last character', () => {
    expect(removeLast('427')).toBe('42')
    expect(removeLast('4.2')).toBe('4.')
  })

  it('falls back to zero rather than leaving the entry empty', () => {
    expect(removeLast('4')).toBe('0')
  })

  it('falls back to zero rather than leaving a lone minus sign', () => {
    expect(removeLast('-4')).toBe('0')
  })
})

describe('entryToOperand', () => {
  it('parses what the keypad can produce', () => {
    expect(entryToOperand('42')).toBe(42)
    expect(entryToOperand('-4.25')).toBe(-4.25)
    expect(entryToOperand('0.')).toBe(0)
    expect(entryToOperand('-0')).toBe(-0)
  })

  // Reachable by holding a digit key: Number() gives Infinity, and JSON.stringify would
  // then send null rather than a number.
  it('rejects a number too large for float64', () => {
    expect(entryToOperand('9'.repeat(400))).toBeNull()
  })
})
