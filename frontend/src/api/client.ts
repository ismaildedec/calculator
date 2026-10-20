import type { ErrorResponse, OperandPayload, OperationId, SuccessResponse } from './types'

// Development talks to the backend's own port; the Docker image is built with this set to
// an empty string, where nginx serves both from one origin.
const baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export type CalculationOutcome =
  | { ok: true; result: number }
  | { ok: false; code: string; message: string; field?: string }

export async function calculate(
  operation: OperationId,
  operands: OperandPayload,
): Promise<CalculationOutcome> {
  let response: Response

  try {
    response = await fetch(`${baseUrl}/api/v1/${operation}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operands),
    })
  } catch {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the calculator service. Check that the backend is running.',
    }
  }

  const payload = await readJson(response)

  if (!response.ok) {
    const failure = (payload as ErrorResponse | null)?.error
    if (!failure?.code || !failure.message) {
      return unexpectedResponse(response.status)
    }
    return { ok: false, code: failure.code, message: failure.message, field: failure.field }
  }

  const success = payload as SuccessResponse | null
  if (typeof success?.result !== 'number') {
    return unexpectedResponse(response.status)
  }
  return { ok: true, result: success.result }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function unexpectedResponse(status: number): CalculationOutcome {
  return {
    ok: false,
    code: 'INVALID_RESPONSE',
    message: `The service returned an unexpected response (HTTP ${status}).`,
  }
}
