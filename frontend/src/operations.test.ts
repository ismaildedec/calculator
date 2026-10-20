import { describe, expect, it } from 'vitest'
import type { OperationId } from './api/types'
import { OPERATIONS, operationById } from './operations'

describe('OPERATIONS', () => {
  // Pins the list to the endpoints the service exposes; an operation added on one side
  // without the other should break here.
  it('declares exactly the operations the service offers', () => {
    expect(OPERATIONS.map((operation) => operation.id)).toEqual([
      'add',
      'subtract',
      'multiply',
      'divide',
      'power',
      'percentage',
      'sqrt',
    ])
  })

  it('marks only the square root as taking one operand', () => {
    const unary = OPERATIONS.filter((operation) => operation.operandCount === 1)

    expect(unary.map((operation) => operation.id)).toEqual(['sqrt'])
  })
})

describe('operationById', () => {
  it('finds an operation by its id', () => {
    expect(operationById('divide')).toMatchObject({ id: 'divide', operandCount: 2 })
  })

  it('fails loudly for an id that does not exist', () => {
    expect(() => operationById('factorial' as OperationId)).toThrow(/unknown operation/)
  })
})
