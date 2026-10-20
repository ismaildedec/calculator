import { describe, expect, it } from 'vitest'
import { validateOperand } from './validation'

describe('validateOperand', () => {
  const cases: Array<{ name: string; input: string; expected: string | undefined }> = [
    { name: 'an empty string', input: '', expected: 'Enter a number.' },
    { name: 'only whitespace', input: '   ', expected: 'Enter a number.' },
    { name: 'letters', input: 'abc', expected: 'Enter a valid number.' },
    { name: 'a number with a suffix', input: '12abc', expected: 'Enter a valid number.' },
    { name: 'a lone minus sign', input: '-', expected: 'Enter a valid number.' },
    { name: 'two numbers', input: '1 2', expected: 'Enter a valid number.' },
    { name: 'a value beyond float64', input: '1e999', expected: 'This number is too large.' },
    { name: 'zero', input: '0', expected: undefined },
    { name: 'a negative number', input: '-4', expected: undefined },
    { name: 'a decimal', input: '2.5', expected: undefined },
    { name: 'a decimal without a leading zero', input: '.5', expected: undefined },
    { name: 'a number padded with spaces', input: ' 12 ', expected: undefined },
    { name: 'exponent notation', input: '1.5e3', expected: undefined },
    { name: 'negative zero', input: '-0', expected: undefined },
  ]

  for (const { name, input, expected } of cases) {
    it(`${expected === undefined ? 'accepts' : 'rejects'} ${name}`, () => {
      expect(validateOperand(input)).toBe(expected)
    })
  }
})
