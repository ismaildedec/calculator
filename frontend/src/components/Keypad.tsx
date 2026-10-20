import { useEffect, useState } from 'react'
import { calculate } from '../api/client'
import type { CalculationOutcome } from '../api/client'
import type { OperationId } from '../api/types'
import { appendDigit, appendDot, entryToOperand, removeLast, toggleSign } from '../entry'
import { operationById } from '../operations'

type BinaryOperationId = Exclude<OperationId, 'sqrt'>

interface Key {
  label: string
  name: string
  variant: 'digit' | 'function' | 'operator' | 'equals'
  press: () => void
  span?: number
}

const TOO_LARGE = 'That number is too large to calculate with.'

export function Keypad() {
  const [entry, setEntry] = useState('0')
  const [accumulator, setAccumulator] = useState<number | null>(null)
  const [pending, setPending] = useState<BinaryOperationId | null>(null)
  const [expression, setExpression] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // After a result or an operator, the next digit starts a new number instead of appending.
  const [replace, setReplace] = useState(true)

  function clearAll() {
    setEntry('0')
    setAccumulator(null)
    setPending(null)
    setExpression('')
    setError(null)
    setReplace(true)
  }

  function editEntry(next: string) {
    setError(null)
    setEntry(next)
    setReplace(false)
  }

  async function run(operation: OperationId, a: number, b?: number) {
    setBusy(true)
    const outcome = await calculate(operation, b === undefined ? { a } : { a, b })
    setBusy(false)
    return outcome
  }

  function fail(outcome: Extract<CalculationOutcome, { ok: false }>) {
    setError(outcome.message)
    setReplace(true)
  }

  async function pressOperator(operation: BinaryOperationId) {
    setError(null)
    const symbol = operationById(operation).symbol

    // Two operators in a row only changes which one is waiting.
    if (replace && accumulator !== null) {
      setPending(operation)
      setExpression(`${accumulator} ${symbol}`)
      return
    }

    const current = entryToOperand(entry)
    if (current === null) {
      setError(TOO_LARGE)
      return
    }

    let left = current
    if (pending !== null && accumulator !== null) {
      const outcome = await run(pending, accumulator, current)
      if (!outcome.ok) {
        fail(outcome)
        return
      }
      left = outcome.result
      setEntry(String(left))
    }

    setAccumulator(left)
    setPending(operation)
    setExpression(`${left} ${symbol}`)
    setReplace(true)
  }

  async function pressEquals() {
    setError(null)
    if (pending === null || accumulator === null) {
      return
    }

    const right = entryToOperand(entry)
    if (right === null) {
      setError(TOO_LARGE)
      return
    }

    const outcome = await run(pending, accumulator, right)
    if (!outcome.ok) {
      fail(outcome)
      return
    }

    setExpression(`${accumulator} ${operationById(pending).symbol} ${right} =`)
    setEntry(String(outcome.result))
    setAccumulator(null)
    setPending(null)
    setReplace(true)
  }

  async function pressSqrt() {
    setError(null)

    const current = entryToOperand(entry)
    if (current === null) {
      setError(TOO_LARGE)
      return
    }

    const outcome = await run('sqrt', current)
    if (!outcome.ok) {
      fail(outcome)
      return
    }

    setExpression(`√(${current}) =`)
    setEntry(String(outcome.result))
    setReplace(true)
  }

  const digit = (value: string): Key => ({
    label: value,
    name: value,
    variant: 'digit',
    press: () => editEntry(appendDigit(entry, value, replace)),
  })

  const operator = (operation: BinaryOperationId): Key => {
    const { symbol, label } = operationById(operation)
    return { label: symbol, name: label, variant: 'operator', press: () => void pressOperator(operation) }
  }

  const rows: Key[][] = [
    [
      { label: 'AC', name: 'Clear all', variant: 'function', press: clearAll },
      { label: '⌫', name: 'Backspace', variant: 'function', press: () => editEntry(removeLast(entry)) },
      operator('percentage'),
      operator('power'),
    ],
    [digit('7'), digit('8'), digit('9'), operator('divide')],
    [digit('4'), digit('5'), digit('6'), operator('multiply')],
    [digit('1'), digit('2'), digit('3'), operator('subtract')],
    [
      { label: '±', name: 'Toggle sign', variant: 'function', press: () => editEntry(toggleSign(entry)) },
      digit('0'),
      { label: '.', name: 'Decimal point', variant: 'function', press: () => editEntry(appendDot(entry, replace)) },
      operator('add'),
    ],
    [
      { label: '√', name: 'Square root', variant: 'function', press: () => void pressSqrt() },
      { label: '=', name: 'Equals', variant: 'equals', press: () => void pressEquals(), span: 3 },
    ],
  ]

  // Re-registered on every render so the handler always closes over current state.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (busy) {
        return
      }

      const byKey: Record<string, (() => void) | undefined> = {
        '.': () => editEntry(appendDot(entry, replace)),
        ',': () => editEntry(appendDot(entry, replace)),
        '+': () => void pressOperator('add'),
        '-': () => void pressOperator('subtract'),
        '*': () => void pressOperator('multiply'),
        '/': () => void pressOperator('divide'),
        '^': () => void pressOperator('power'),
        '%': () => void pressOperator('percentage'),
        '=': () => void pressEquals(),
        Enter: () => void pressEquals(),
        Backspace: () => editEntry(removeLast(entry)),
        Escape: clearAll,
      }

      const action = /^[0-9]$/.test(event.key)
        ? () => editEntry(appendDigit(entry, event.key, replace))
        : byKey[event.key]

      if (action) {
        event.preventDefault()
        action()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="calculator">
      <div className="display">
        <div className="expression">{expression}</div>
        <output className="entry" aria-live="polite">
          {entry}
        </output>
        {error ? (
          <p className="display-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="keys">
        {rows.flat().map((key) => (
          <button
            key={key.name}
            type="button"
            className={`key key-${key.variant}`}
            style={key.span ? { gridColumn: `span ${key.span}` } : undefined}
            aria-label={key.name === key.label ? undefined : key.name}
            disabled={busy}
            onClick={key.press}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  )
}
