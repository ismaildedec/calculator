import type { OperationId } from './api/types'

export interface Operation {
  id: OperationId
  label: string
  symbol: string
  operandCount: 1 | 2
}

export const OPERATIONS = [
  { id: 'add', label: 'Add', symbol: '+', operandCount: 2 },
  { id: 'subtract', label: 'Subtract', symbol: '−', operandCount: 2 },
  { id: 'multiply', label: 'Multiply', symbol: '×', operandCount: 2 },
  { id: 'divide', label: 'Divide', symbol: '÷', operandCount: 2 },
  { id: 'power', label: 'Power', symbol: '^', operandCount: 2 },
  { id: 'percentage', label: 'Percentage', symbol: '%', operandCount: 2 },
  { id: 'sqrt', label: 'Square root', symbol: '√', operandCount: 1 },
] as const satisfies readonly Operation[]

// Arity is derived from the table rather than written out a second time, so a unary
// operation added above cannot be sent with two operands.
export type BinaryOperationId = Extract<(typeof OPERATIONS)[number], { operandCount: 2 }>['id']

export function operationById(id: OperationId): Operation {
  const found = OPERATIONS.find((operation) => operation.id === id)
  if (!found) {
    throw new Error(`unknown operation: ${id}`)
  }
  return found
}
