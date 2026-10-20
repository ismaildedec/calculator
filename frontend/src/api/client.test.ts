import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculate, resolveBaseUrl } from './client'

describe('resolveBaseUrl', () => {
  it('is same-origin in a production build, where nginx proxies /api/', () => {
    expect(resolveBaseUrl({ PROD: true })).toBe('')
  })

  it('points at the backend port in a dev build', () => {
    expect(resolveBaseUrl({ PROD: false })).toBe('http://localhost:8080')
  })

  it('lets the environment override either default', () => {
    expect(resolveBaseUrl({ PROD: true, VITE_API_BASE_URL: 'https://api.example.com' })).toBe(
      'https://api.example.com',
    )
    expect(resolveBaseUrl({ PROD: false, VITE_API_BASE_URL: '' })).toBe('')
  })
})

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestInit(): RequestInit {
  return fetchMock.mock.calls[0]?.[1] as RequestInit
}

describe('calculate', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the result of a successful calculation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operation: 'add', result: 5 }))

    await expect(calculate('add', { a: 2, b: 3 })).resolves.toEqual({ ok: true, result: 5 })
  })

  it('posts json to the endpoint named after the operation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operation: 'divide', result: 2.5 }))

    await calculate('divide', { a: 10, b: 4 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/v1\/divide$/)
    expect(requestInit()).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(requestInit().body).toBe('{"a":10,"b":4}')
  })

  // The service rejects unknown fields, so sending b to a unary operation would turn a
  // valid request into a 400.
  it('omits the second operand for a unary operation', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operation: 'sqrt', result: 3 }))

    await calculate('sqrt', { a: 9 })

    expect(requestInit().body).toBe('{"a":9}')
  })

  it('passes the service error contract through unchanged', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        error: { code: 'DIVISION_BY_ZERO', message: 'division by zero is not allowed', field: 'b' },
      }),
    )

    await expect(calculate('divide', { a: 1, b: 0 })).resolves.toEqual({
      ok: false,
      code: 'DIVISION_BY_ZERO',
      message: 'division by zero is not allowed',
      field: 'b',
    })
  })

  it('keeps an error without a field', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(422, {
        error: { code: 'NON_FINITE_RESULT', message: 'the result cannot be represented' },
      }),
    )

    await expect(calculate('power', { a: 10, b: 400 })).resolves.toEqual({
      ok: false,
      code: 'NON_FINITE_RESULT',
      message: 'the result cannot be represented',
      field: undefined,
    })
  })

  it('reports an unreachable service', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(calculate('add', { a: 1, b: 2 })).resolves.toMatchObject({
      ok: false,
      code: 'NETWORK_ERROR',
    })
  })

  it('reports a response body that is not json', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }))

    await expect(calculate('add', { a: 1, b: 2 })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_RESPONSE',
    })
  })

  it('reports a success body with no numeric result', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { operation: 'add' }))

    await expect(calculate('add', { a: 1, b: 2 })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_RESPONSE',
    })
  })

  it('reports an error body with no code', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'something went wrong' }))

    await expect(calculate('add', { a: 1, b: 2 })).resolves.toMatchObject({
      ok: false,
      code: 'INVALID_RESPONSE',
    })
  })
})
