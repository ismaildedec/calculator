export type OperationId = 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'percentage' | 'sqrt'

export interface OperandPayload {
  a: number
  b?: number
}

export interface SuccessResponse {
  operation: OperationId
  result: number
}

// A plain string, not 'a' | 'b': an unknown-field error names whatever the caller sent.
export interface ErrorResponse {
  error: {
    code: string
    message: string
    field?: string
  }
}
