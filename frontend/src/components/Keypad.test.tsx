import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calculate } from '../api/client'
import type { CalculationOutcome } from '../api/client'
import { OPERATIONS } from '../operations'
import { Keypad } from './Keypad'

vi.mock('../api/client', () => ({ calculate: vi.fn() }))

const calculateMock = vi.mocked(calculate)

const display = () => screen.getByRole('status').textContent
const expression = () => screen.getByRole('status').previousSibling?.textContent

function key(name: string) {
  return screen.getByRole('button', { name })
}

async function press(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  for (const name of names) {
    await user.click(key(name))
  }
}

describe('Keypad', () => {
  beforeEach(() => {
    calculateMock.mockReset()
    calculateMock.mockResolvedValue({ ok: true, result: 0 })
  })

  it('starts at zero', () => {
    render(<Keypad />)

    expect(display()).toBe('0')
  })

  it('has a key for every operation the service offers', () => {
    render(<Keypad />)

    for (const operation of OPERATIONS) {
      expect(screen.getByRole('button', { name: operation.label })).toBeInTheDocument()
    }
  })

  it('builds a number from digits without calling the service', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '4', '2', '7')

    expect(display()).toBe('427')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('allows only one decimal point', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '1', 'Decimal point', '2', 'Decimal point', '5')

    expect(display()).toBe('1.25')
  })

  it('toggles the sign without calling the service', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '7', 'Toggle sign')
    expect(display()).toBe('-7')

    await press(user, 'Toggle sign')
    expect(display()).toBe('7')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('removes the last digit and falls back to zero', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '4', '2', 'Backspace')
    expect(display()).toBe('4')

    await press(user, 'Backspace')
    expect(display()).toBe('0')
  })

  it('clears everything', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '4', '2', 'Add', '7', 'Clear all')

    expect(display()).toBe('0')
    expect(expression()).toBe('')
  })

  it('shows the pending operation and waits before calling the service', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '1', '2', 'Add')

    expect(expression()).toBe('12 +')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('calculates on equals', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({ ok: true, result: 5 })
    render(<Keypad />)

    await press(user, '2', 'Add', '3', 'Equals')

    expect(calculateMock).toHaveBeenCalledExactlyOnceWith('add', { a: 2, b: 3 })
    expect(display()).toBe('5')
    expect(expression()).toBe('2 + 3 =')
  })

  it('evaluates a chain from left to right, one call per operator', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValueOnce({ ok: true, result: 5 })
    calculateMock.mockResolvedValueOnce({ ok: true, result: 9 })
    render(<Keypad />)

    await press(user, '2', 'Add', '3', 'Add', '4', 'Equals')

    expect(calculateMock).toHaveBeenNthCalledWith(1, 'add', { a: 2, b: 3 })
    expect(calculateMock).toHaveBeenNthCalledWith(2, 'add', { a: 5, b: 4 })
    expect(display()).toBe('9')
  })

  // Sequential evaluation, like a standard pocket calculator: 2 + 3 x 4 is 20, not 14.
  it('has no operator precedence', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValueOnce({ ok: true, result: 5 })
    calculateMock.mockResolvedValueOnce({ ok: true, result: 20 })
    render(<Keypad />)

    await press(user, '2', 'Add', '3', 'Multiply', '4', 'Equals')

    expect(calculateMock).toHaveBeenNthCalledWith(2, 'multiply', { a: 5, b: 4 })
    expect(display()).toBe('20')
  })

  it('changes the pending operator when two are pressed in a row', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '8', 'Add', 'Divide')

    expect(expression()).toBe('8 ÷')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('continues from the previous result', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValueOnce({ ok: true, result: 5 })
    calculateMock.mockResolvedValueOnce({ ok: true, result: 15 })
    render(<Keypad />)

    await press(user, '2', 'Add', '3', 'Equals', 'Multiply', '3', 'Equals')

    expect(calculateMock).toHaveBeenNthCalledWith(2, 'multiply', { a: 5, b: 3 })
    expect(display()).toBe('15')
  })

  it('applies the square root immediately to the current entry', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({ ok: true, result: 3 })
    render(<Keypad />)

    await press(user, '9', 'Square root')

    expect(calculateMock).toHaveBeenCalledExactlyOnceWith('sqrt', { a: 9 })
    expect(display()).toBe('3')
    expect(expression()).toBe('√(9)')
  })

  it('sends percentage as a binary operation', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({ ok: true, result: 30 })
    render(<Keypad />)

    await press(user, '2', '0', '0', 'Percentage', '1', '5', 'Equals')

    expect(calculateMock).toHaveBeenCalledExactlyOnceWith('percentage', { a: 200, b: 15 })
    expect(display()).toBe('30')
  })

  it('sends power as a binary operation', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({ ok: true, result: 1024 })
    render(<Keypad />)

    await press(user, '2', 'Power', '1', '0', 'Equals')

    expect(calculateMock).toHaveBeenCalledExactlyOnceWith('power', { a: 2, b: 10 })
    expect(display()).toBe('1024')
  })

  it('shows the message the service sent', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({
      ok: false,
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
      field: 'b',
    })
    render(<Keypad />)

    await press(user, '1', 'Divide', '0', 'Equals')

    expect(await screen.findByRole('alert')).toHaveTextContent('division by zero is not allowed')
  })

  it('shows an unreachable service rather than failing silently', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the calculator service.',
    })
    render(<Keypad />)

    await press(user, '1', 'Add', '1', 'Equals')

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the calculator service.')
  })

  it('clears the error once the next digit is pressed', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({
      ok: false,
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
    })
    render(<Keypad />)

    await press(user, '1', 'Divide', '0', 'Equals')
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await press(user, '5')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(display()).toBe('5')
  })

  it('does nothing on equals with no pending operation', async () => {
    const user = userEvent.setup()
    render(<Keypad />)

    await press(user, '7', 'Equals')

    expect(calculateMock).not.toHaveBeenCalled()
    expect(display()).toBe('7')
  })

  it('refuses an entry too large for float64 instead of sending it', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Keypad />)

    await user.click(key('9'))
    await user.keyboard('9'.repeat(320))
    await press(user, 'Square root')

    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('refuses an oversized entry when an operator is pressed', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Keypad />)

    await user.click(key('9'))
    await user.keyboard('9'.repeat(320))
    await press(user, 'Add')

    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('refuses an oversized second operand on equals', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Keypad />)

    await press(user, '2', 'Add', '9')
    await user.keyboard('9'.repeat(320))
    await press(user, 'Equals')

    expect(await screen.findByRole('alert')).toHaveTextContent('too large')
    expect(calculateMock).not.toHaveBeenCalled()
  })

  it('reports a failure that happens mid-chain', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({
      ok: false,
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
    })
    render(<Keypad />)

    await press(user, '1', 'Divide', '0', 'Add')

    expect(await screen.findByRole('alert')).toHaveTextContent('division by zero is not allowed')
  })

  it('reports a failed square root', async () => {
    const user = userEvent.setup()
    calculateMock.mockResolvedValue({
      ok: false,
      code: 'NEGATIVE_SQRT',
      message: 'the square root of a negative number is not defined',
      field: 'a',
    })
    render(<Keypad />)

    await press(user, '4', 'Toggle sign', 'Square root')

    expect(await screen.findByRole('alert')).toHaveTextContent('not defined')
  })

  it('disables the keys while a request is in flight', async () => {
    const user = userEvent.setup()
    let release: (outcome: CalculationOutcome) => void = () => {}
    calculateMock.mockReturnValue(
      new Promise<CalculationOutcome>((resolve) => {
        release = resolve
      }),
    )
    render(<Keypad />)

    await press(user, '2', 'Add', '3', 'Equals')
    expect(key('Equals')).toBeDisabled()

    release({ ok: true, result: 5 })

    expect(await screen.findByText('5')).toBeInTheDocument()
    expect(key('Equals')).toBeEnabled()
  })

  describe('state left by one key for the next', () => {
    it('keeps a square root taken inside a pending operation', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValueOnce({ ok: true, result: 4 })
      calculateMock.mockResolvedValueOnce({ ok: true, result: 13 })
      calculateMock.mockResolvedValueOnce({ ok: true, result: 26 })
      render(<Keypad />)

      await press(user, '9', 'Add', '1', '6', 'Square root')
      expect(display()).toBe('4')

      await press(user, 'Multiply', '2', 'Equals')

      expect(calculateMock).toHaveBeenNthCalledWith(2, 'add', { a: 9, b: 4 })
      expect(display()).toBe('26')
    })

    it('shows the pending operation alongside a square root', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 4 })
      render(<Keypad />)

      await press(user, '9', 'Add', '1', '6', 'Square root')

      expect(expression()).toBe('9 + √(16)')
    })

    it('retries rather than silently swapping the operator after a failure', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({
        ok: false,
        code: 'DIVISION_BY_ZERO',
        message: 'division by zero is not allowed',
      })
      render(<Keypad />)

      await press(user, '1', 'Divide', '0', 'Add')
      expect(await screen.findByRole('alert')).toBeInTheDocument()

      await press(user, 'Multiply')

      expect(expression()).toBe('1 ÷')
      expect(calculateMock).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('alert')).toHaveTextContent('division by zero is not allowed')
    })

    it('lets a failed operand be corrected and the calculation retried', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValueOnce({
        ok: false,
        code: 'DIVISION_BY_ZERO',
        message: 'division by zero is not allowed',
      })
      calculateMock.mockResolvedValueOnce({ ok: true, result: 0.2 })
      render(<Keypad />)

      await press(user, '1', 'Divide', '0', 'Equals')
      expect(await screen.findByRole('alert')).toBeInTheDocument()

      await press(user, 'Backspace', '5', 'Equals')

      expect(calculateMock).toHaveBeenNthCalledWith(2, 'divide', { a: 1, b: 5 })
      expect(display()).toBe('0.2')
    })

    it('ignores backspace and sign toggle while no right operand has been typed', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 16 })
      render(<Keypad />)

      await press(user, '8', 'Add', 'Backspace', 'Toggle sign')

      expect(display()).toBe('8')

      await press(user, 'Equals')
      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('add', { a: 8, b: 8 })
    })

    it('clears a computed result rather than editing half of it', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 1e21 })
      render(<Keypad />)

      await press(user, '1', 'Add', '1', 'Equals')
      expect(display()).toBe('1e+21')

      await press(user, 'Backspace')

      expect(display()).toBe('0')
    })

    it('does not report an exponent-form result as too large', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 1e-7 })
      render(<Keypad />)

      await press(user, '1', 'Divide', '7', 'Equals')
      expect(display()).toBe('1e-7')

      await press(user, 'Add')

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(expression()).toBe('1e-7 +')
    })

    it('negates a result without starting to append to it', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 5 })
      render(<Keypad />)

      await press(user, '2', 'Add', '3', 'Equals', 'Toggle sign')
      expect(display()).toBe('-5')

      await press(user, '7')
      expect(display()).toBe('7')
    })
  })

  describe('keyboard', () => {
    it('types a calculation and submits it with Enter', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 15 })
      render(<Keypad />)

      await user.keyboard('12+3{Enter}')

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('add', { a: 12, b: 3 })
      expect(display()).toBe('15')
    })

    it('maps the remaining operators', async () => {
      const user = userEvent.setup()
      calculateMock.mockResolvedValue({ ok: true, result: 0 })
      render(<Keypad />)

      await user.keyboard('8/2=')

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith('divide', { a: 8, b: 2 })
    })

    it('backspaces and clears', async () => {
      const user = userEvent.setup()
      render(<Keypad />)

      await user.keyboard('123{Backspace}')
      expect(display()).toBe('12')

      await user.keyboard('{Escape}')
      expect(display()).toBe('0')
    })

    it.each([
      { keys: '9-3=', operation: 'subtract', payload: { a: 9, b: 3 } },
      { keys: '9*3=', operation: 'multiply', payload: { a: 9, b: 3 } },
      { keys: '2^3=', operation: 'power', payload: { a: 2, b: 3 } },
      { keys: '200%15=', operation: 'percentage', payload: { a: 200, b: 15 } },
    ])('maps $keys to $operation', async ({ keys, operation, payload }) => {
      const user = userEvent.setup()
      render(<Keypad />)

      await user.keyboard(keys)

      expect(calculateMock).toHaveBeenCalledExactlyOnceWith(operation, payload)
    })

    it('accepts a full stop as a decimal point', async () => {
      const user = userEvent.setup()
      render(<Keypad />)

      await user.keyboard('1.5')

      expect(display()).toBe('1.5')
    })

    it('ignores keys while a request is in flight', async () => {
      const user = userEvent.setup()
      let release: (outcome: CalculationOutcome) => void = () => {}
      calculateMock.mockReturnValue(
        new Promise<CalculationOutcome>((resolve) => {
          release = resolve
        }),
      )
      render(<Keypad />)

      await press(user, '2', 'Add', '3', 'Equals')
      await user.keyboard('7')

      expect(display()).toBe('3')

      release({ ok: true, result: 5 })
      expect(await screen.findByText('5')).toBeInTheDocument()
    })

    it('leaves browser shortcuts alone', async () => {
      const user = userEvent.setup()
      render(<Keypad />)

      await press(user, '5')

      await user.keyboard('{Control>}0{/Control}')
      await user.keyboard('{Control>}-{/Control}')
      await user.keyboard('{Alt>}5{/Alt}')

      expect(display()).toBe('5')
      expect(expression()).toBe('')
      expect(calculateMock).not.toHaveBeenCalled()
    })

    it('ignores keys it does not map', async () => {
      const user = userEvent.setup()
      render(<Keypad />)

      await press(user, '5')
      await user.keyboard('abc{ArrowLeft}{ArrowRight}')

      expect(display()).toBe('5')
      expect(calculateMock).not.toHaveBeenCalled()
    })

    it('registers one listener regardless of how many keys are pressed', async () => {
      const added = vi.spyOn(window, 'addEventListener')
      const removed = vi.spyOn(window, 'removeEventListener')
      const user = userEvent.setup()
      render(<Keypad />)

      await user.keyboard('12345')

      expect(added.mock.calls.filter((call) => call[0] === 'keydown')).toHaveLength(1)
      expect(removed.mock.calls.filter((call) => call[0] === 'keydown')).toHaveLength(0)

      added.mockRestore()
      removed.mockRestore()
    })

    it('accepts a comma as a decimal point', async () => {
      const user = userEvent.setup()
      render(<Keypad />)

      await user.keyboard('1,5')

      expect(display()).toBe('1.5')
    })
  })
})
