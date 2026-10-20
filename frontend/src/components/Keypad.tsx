import { useEffect, useRef, useState } from 'react'
import { calculate } from '../api/client'
import type { CalculationOutcome } from '../api/client'
import type { OperationId } from '../api/types'
import { appendDigit, appendDot, entryToOperand, removeLast, toggleSign } from '../entry'
import type { BinaryOperationId } from '../operations'
import { operationById } from '../operations'

// A single "replace the entry" flag cannot express this: a result and a waiting operator
// both replace the entry, but only one means "no right-hand operand exists yet".
type Stage = 'typing' | 'operatorPending' | 'result'

interface Key {
  label: string
  name: string
  variant: 'digit' | 'function' | 'operator' | 'equals'
  press: () => void
  keyboard?: string[]
  span?: number
}

const TOO_LARGE = 'That number is too large to calculate with.'

export function Keypad() {
  const [entry, setEntry] = useState('0')
  const [accumulator, setAccumulator] = useState<number | null>(null)
  const [pending, setPending] = useState<BinaryOperationId | null>(null)
  const [stage, setStage] = useState<Stage>('result')
  const [expression, setExpression] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function clearAll() {
    setEntry('0')
    setAccumulator(null)
    setPending(null)
    setExpression('')
    setError(null)
    setStage('result')
  }

  function typeDigit(value: string) {
    setError(null)
    setEntry((current) => appendDigit(current, value, stage !== 'typing'))
    setStage('typing')
  }

  function typeDot() {
    setError(null)
    setEntry((current) => appendDot(current, stage !== 'typing'))
    setStage('typing')
  }

  // While an operator waits, the only number on screen is the left operand.
  function backspace() {
    if (stage === 'operatorPending') {
      return
    }
    setError(null)
    // Half of a computed result is not a number: 1e+21 would silently become 1e+2.
    setEntry((current) => (stage === 'result' ? '0' : removeLast(current)))
    setStage('typing')
  }

  function toggleEntrySign() {
    if (stage === 'operatorPending') {
      return
    }
    setError(null)
    setEntry((current) => toggleSign(current))
  }

  async function run(operation: OperationId, a: number, b?: number) {
    setBusy(true)
    const outcome = await calculate(operation, b === undefined ? { a } : { a, b })
    setBusy(false)
    return outcome
  }

  // The operand on screen is left alone so it can be corrected and retried.
  function fail(outcome: Extract<CalculationOutcome, { ok: false }>) {
    setError(outcome.message)
    setStage('typing')
  }

  async function pressOperator(operation: BinaryOperationId) {
    setError(null)
    const symbol = operationById(operation).symbol

    if (stage === 'operatorPending') {
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
    setStage('operatorPending')
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
    setStage('result')
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

    const waiting =
      pending !== null && accumulator !== null
        ? `${accumulator} ${operationById(pending).symbol} `
        : ''
    setExpression(`${waiting}√(${current})`)
    setEntry(String(outcome.result))
    setStage('result')
  }

  const digit = (value: string): Key => ({
    label: value,
    name: value,
    variant: 'digit',
    press: () => typeDigit(value),
    keyboard: [value],
  })

  const operator = (operation: BinaryOperationId, keyboard: string[]): Key => {
    const { symbol, label } = operationById(operation)
    return {
      label: symbol,
      name: label,
      variant: 'operator',
      press: () => void pressOperator(operation),
      keyboard,
    }
  }

  const rows: Key[][] = [
    [
      { label: 'AC', name: 'Clear all', variant: 'function', press: clearAll, keyboard: ['Escape'] },
      { label: '⌫', name: 'Backspace', variant: 'function', press: backspace, keyboard: ['Backspace'] },
      operator('percentage', ['%']),
      operator('power', ['^']),
    ],
    [digit('7'), digit('8'), digit('9'), operator('divide', ['/'])],
    [digit('4'), digit('5'), digit('6'), operator('multiply', ['*'])],
    [digit('1'), digit('2'), digit('3'), operator('subtract', ['-'])],
    [
      { label: '±', name: 'Toggle sign', variant: 'function', press: toggleEntrySign },
      digit('0'),
      { label: '.', name: 'Decimal point', variant: 'function', press: typeDot, keyboard: ['.', ','] },
      operator('add', ['+']),
    ],
    [
      { label: '√', name: 'Square root', variant: 'function', press: () => void pressSqrt() },
      {
        label: '=',
        name: 'Equals',
        variant: 'equals',
        press: () => void pressEquals(),
        keyboard: ['Enter', '='],
        span: 3,
      },
    ],
  ]

  const keys = rows.flat()

  function handleKeyDown(event: KeyboardEvent) {
    // Without this, Ctrl+0 and Ctrl+- would be swallowed instead of zooming the page.
    if (busy || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const match = keys.find((key) => key.keyboard?.includes(event.key))
    if (!match) {
      return
    }

    event.preventDefault()
    match.press()
  }

  const latestKeyHandler = useRef(handleKeyDown)
  useEffect(() => {
    latestKeyHandler.current = handleKeyDown
  })

  // Registered once: re-binding on every render would churn a listener per key press.
  useEffect(() => {
    const listener = (event: KeyboardEvent) => latestKeyHandler.current(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

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
        {keys.map((key) => (
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
