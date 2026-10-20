import type { OperationId } from './api/types'

export interface Operation {
  id: OperationId
  label: string
  symbol: string
  operandCount: 1 | 2
}

export const OPERATIONS: readonly Operation[] = [
  { id: 'add', label: 'Add', symbol: '+', operandCount: 2 },
  { id: 'subtract', label: 'Subtract', symbol: '−', operandCount: 2 },
  { id: 'multiply', label: 'Multiply', symbol: '×', operandCount: 2 },
  { id: 'divide', label: 'Divide', symbol: '÷', operandCount: 2 },
  { id: 'power', label: 'Power', symbol: '^', operandCount: 2 },
  { id: 'percentage', label: 'Percentage', symbol: '%', operandCount: 2 },
  { id: 'sqrt', label: 'Square root', symbol: '√', operandCount: 1 },
]

export function operationById(id: OperationId): Operation {
  const found = OPERATIONS.find((operation) => operation.id === id)
  if (!found) {
    throw new Error(`unknown operation: ${id}`)
  }
  return found
}
