import type { ErrorResponse, OperandPayload, OperationId, SuccessResponse } from './types'

export interface BaseUrlEnv {
  VITE_API_BASE_URL?: string
  PROD: boolean
}

// A production build is served by nginx, which proxies /api/ to the backend, so requests
// are same-origin and the base is empty. A dev build talks to the backend's own port.
// VITE_API_BASE_URL overrides either. Deriving this from PROD rather than from the
// variable alone means the Docker image needs no build argument to be correct.
export function resolveBaseUrl(env: BaseUrlEnv): string {
  return env.VITE_API_BASE_URL ?? (env.PROD ? '' : 'http://localhost:8080')
}

const baseUrl = resolveBaseUrl(import.meta.env)

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
