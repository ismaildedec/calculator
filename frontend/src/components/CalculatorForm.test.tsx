import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculate } from '../api/client'
import type { CalculationOutcome } from '../api/client'
import { CalculatorForm } from './CalculatorForm'

vi.mock('../api/client', () => ({ calculate: vi.fn() }))

const calculateMock = vi.mocked(calculate)

function succeedsWith(result: number) {
  calculateMock.mockResolvedValue({ ok: true, result })
}

function failsWith(failure: Omit<Extract<CalculationOutcome, { ok: false }>, 'ok'>) {
  calculateMock.mockResolvedValue({ ok: false, ...failure })
}

const firstNumber = () => screen.getByLabelText('First number')
const secondNumber = () => screen.getByLabelText('Second number')
// Matches both labels the button carries: "Calculate" and, while in flight, "Calculating...".
const calculateButton = () => screen.getByRole('button', { name: /calculat/i })

describe('CalculatorForm', () => {
  beforeEach(() => {
    calculateMock.mockReset()
  })

  it('starts on addition with two operands', () => {
    render(<CalculatorForm />)

    expect(screen.getByRole('radio', { name: /add/i })).toBeChecked()
    expect(firstNumber()).toBeInTheDocument()
    expect(secondNumber()).toBeInTheDocument()
  })

  it('asks for a single operand when the operation is unary', async () => {
    const user = userEvent.setup()
    render(<CalculatorForm />)

    await user.click(screen.getByRole('radio', { name: /square root/i }))

    expect(screen.getByLabelText('Number')).toBeInTheDocument()
    expect(screen.queryByLabelText('Second number')).not.toBeInTheDocument()
  })

  it('reports both empty operands without calling the service', async () => {
    const user = userEvent.setup()
    render(<CalculatorForm />)

    await user.click(calculateButton())

    expect(await screen.findAllByText('Enter a number.')).toHaveLength(2)
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('rejects an operand that is not a number without calling the service', async () => {
    const user = userEvent.setup()
    render(<CalculatorForm />)

    await user.type(firstNumber(), 'twelve')
    await user.type(secondNumber(), '3')
    await user.click(calculateButton())

    expect(await screen.findByText('Enter a valid number.')).toBeInTheDocument()
    expect(firstNumber()).toBeInvalid()
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('shows the result of a calculation', async () => {
    const user = userEvent.setup()
    succeedsWith(5)
    render(<CalculatorForm />)

    await user.type(firstNumber(), '2')
    await user.type(secondNumber(), '3')
    await user.click(calculateButton())

    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(calculateMock).toHaveBeenCalledWith('add', { a: 2, b: 3 })
  })

  it('shows the float64 result exactly as the service returned it', async () => {
    const user = userEvent.setup()
    succeedsWith(0.30000000000000004)
    render(<CalculatorForm />)

    await user.type(firstNumber(), '0.1')
    await user.type(secondNumber(), '0.2')
    await user.click(calculateButton())

    expect(await screen.findByText('0.30000000000000004')).toBeInTheDocument()
  })

  it('sends only the first operand for a unary operation', async () => {
    const user = userEvent.setup()
    succeedsWith(3)
    render(<CalculatorForm />)

    await user.click(screen.getByRole('radio', { name: /square root/i }))
    await user.type(screen.getByLabelText('Number'), '9')
    await user.click(calculateButton())

    expect(await screen.findByText('3')).toBeInTheDocument()
    expect(calculateMock).toHaveBeenCalledWith('sqrt', { a: 9 })
  })

  it('shows the message the service sent and marks the field it blamed', async () => {
    const user = userEvent.setup()
    failsWith({
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
      field: 'b',
    })
    render(<CalculatorForm />)

    await user.click(screen.getByRole('radio', { name: /divide/i }))
    await user.type(firstNumber(), '1')
    await user.type(secondNumber(), '0')
    await user.click(calculateButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('division by zero is not allowed')
    expect(secondNumber()).toBeInvalid()
    expect(firstNumber()).toBeValid()
  })

  it('shows an unreachable service as an error rather than failing silently', async () => {
    const user = userEvent.setup()
    failsWith({ code: 'NETWORK_ERROR', message: 'Cannot reach the calculator service.' })
    render(<CalculatorForm />)

    await user.type(firstNumber(), '1')
    await user.type(secondNumber(), '2')
    await user.click(calculateButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the calculator service.')
  })

  it('discards the result when an operand is edited', async () => {
    const user = userEvent.setup()
    succeedsWith(5)
    render(<CalculatorForm />)

    await user.type(firstNumber(), '2')
    await user.type(secondNumber(), '3')
    await user.click(calculateButton())
    expect(await screen.findByText('5')).toBeInTheDocument()

    await user.type(secondNumber(), '9')

    expect(screen.queryByText('5')).not.toBeInTheDocument()
  })

  it('discards the result when the operation changes', async () => {
    const user = userEvent.setup()
    succeedsWith(5)
    render(<CalculatorForm />)

    await user.type(firstNumber(), '2')
    await user.type(secondNumber(), '3')
    await user.click(calculateButton())
    expect(await screen.findByText('5')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /multiply/i }))

    expect(screen.queryByText('5')).not.toBeInTheDocument()
  })

  it('disables the button while the request is in flight', async () => {
    const user = userEvent.setup()
    let release: (outcome: CalculationOutcome) => void = () => {}
    calculateMock.mockReturnValue(
      new Promise<CalculationOutcome>((resolve) => {
        release = resolve
      }),
    )
    render(<CalculatorForm />)

    await user.type(firstNumber(), '2')
    await user.type(secondNumber(), '3')
    await user.click(calculateButton())

    expect(calculateButton()).toBeDisabled()

    release({ ok: true, result: 5 })

    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(calculateButton()).toBeEnabled()
  })
})
