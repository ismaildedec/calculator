import { useState } from 'react'
import type { FormEvent } from 'react'
import { calculate } from '../api/client'
import type { CalculationOutcome } from '../api/client'
import type { OperationId } from '../api/types'
import { OPERATIONS, operationById } from '../operations'
import { validateOperand } from '../validation'

type OperandName = 'a' | 'b'

type FieldErrors = Partial<Record<OperandName, string>>

export function CalculatorForm() {
  const [operationId, setOperationId] = useState<OperationId>('add')
  const [operands, setOperands] = useState<Record<OperandName, string>>({ a: '', b: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [outcome, setOutcome] = useState<CalculationOutcome | null>(null)
  const [pending, setPending] = useState(false)

  const operation = operationById(operationId)
  const takesTwoOperands = operation.operandCount === 2
  const blamedField = outcome && !outcome.ok ? outcome.field : undefined

  function selectOperation(id: OperationId) {
    setOperationId(id)
    setFieldErrors({})
    setOutcome(null)
  }

  // A result shown next to operands it was not computed from would be a lie, so editing
  // either operand discards it.
  function updateOperand(name: OperandName, value: string) {
    setOperands((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setOutcome(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors: FieldErrors = { a: validateOperand(operands.a) }
    if (takesTwoOperands) {
      errors.b = validateOperand(operands.b)
    }

    setFieldErrors(errors)
    setOutcome(null)
    if (errors.a || errors.b) {
      return
    }

    const payload = takesTwoOperands
      ? { a: Number(operands.a), b: Number(operands.b) }
      : { a: Number(operands.a) }

    setPending(true)
    setOutcome(await calculate(operationId, payload))
    setPending(false)
  }

  return (
    <form className="calculator" onSubmit={submit} noValidate>
      <fieldset className="operations">
        <legend>Operation</legend>
        {OPERATIONS.map((candidate) => (
          <label
            key={candidate.id}
            className={candidate.id === operationId ? 'operation operation-selected' : 'operation'}
          >
            <input
              type="radio"
              name="operation"
              value={candidate.id}
              checked={candidate.id === operationId}
              onChange={() => selectOperation(candidate.id)}
            />
            <span className="operation-symbol" aria-hidden="true">
              {candidate.symbol}
            </span>
            <span>{candidate.label}</span>
          </label>
        ))}
      </fieldset>

      <OperandField
        name="a"
        label={takesTwoOperands ? 'First number' : 'Number'}
        value={operands.a}
        error={fieldErrors.a}
        blamedByService={blamedField === 'a'}
        onChange={updateOperand}
      />

      {takesTwoOperands ? (
        <OperandField
          name="b"
          label="Second number"
          value={operands.b}
          error={fieldErrors.b}
          blamedByService={blamedField === 'b'}
          onChange={updateOperand}
        />
      ) : null}

      <button type="submit" disabled={pending}>
        {pending ? 'Calculating...' : 'Calculate'}
      </button>

      {outcome?.ok ? (
        <p className="result" aria-live="polite">
          <span className="result-label">Result</span>
          <span className="result-value">{String(outcome.result)}</span>
        </p>
      ) : null}

      {outcome && !outcome.ok ? (
        <p className="service-error" role="alert">
          {outcome.message}
        </p>
      ) : null}
    </form>
  )
}

interface OperandFieldProps {
  name: OperandName
  label: string
  value: string
  error?: string
  blamedByService: boolean
  onChange: (name: OperandName, value: string) => void
}

function OperandField({ name, label, value, error, blamedByService, onChange }: OperandFieldProps) {
  const errorId = `${name}-error`

  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={Boolean(error) || blamedByService}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error ? (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
