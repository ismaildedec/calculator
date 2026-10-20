# Calculator

A calculator with a React frontend and a Go REST backend. The frontend does no arithmetic
of its own: every result on screen was computed by the service.

- **Backend** - Go, standard library only, no third-party dependencies
- **Frontend** - React 19 with TypeScript, built by Vite
- **Operations** - add, subtract, multiply, divide, power, percentage, square root

[docs/PROMPT_LOG.md](docs/PROMPT_LOG.md) is the engineering journal for this project: the
AI prompts used, the decisions taken and why, what was measured, and the mistakes caught
along the way. [COVERAGE.md](COVERAGE.md) has the test numbers.

## Quick start with Docker

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

The backend is also published on port 8080, so the `curl` examples below work against the
running stack.

To stop it:

```bash
docker compose down
```

## Running it without Docker

Two terminals. The backend first:

```bash
cd backend
go run ./cmd/server
```

It listens on **http://localhost:8080**. Requires Go 1.22 or newer (the router uses
method patterns from `net/http`); developed against 1.24.4.

Then the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Use `localhost`, not `127.0.0.1` - the Vite dev server may
bind IPv6 only, in which case `127.0.0.1:5173` refuses the connection while `localhost`
works.

If Docker Compose is already running, port 8080 is taken; stop it first or set `PORT` to
something else.

### Configuration

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | backend | `8080` | Port to listen on |
| `ALLOWED_ORIGIN` | backend | `*` | Value of the `Access-Control-Allow-Origin` header |
| `VITE_API_BASE_URL` | frontend build | dev: `http://localhost:8080`, production: empty | Overrides where the frontend sends requests |

Nothing has to be set for either setup to work.

## API

All endpoints are `POST` and all take and return JSON.

| Endpoint | Body | Example response |
| --- | --- | --- |
| `/api/v1/add` | `{"a": 2, "b": 3}` | `{"operation":"add","result":5}` |
| `/api/v1/subtract` | `{"a": 5, "b": 3}` | `{"operation":"subtract","result":2}` |
| `/api/v1/multiply` | `{"a": 4, "b": 3}` | `{"operation":"multiply","result":12}` |
| `/api/v1/divide` | `{"a": 10, "b": 4}` | `{"operation":"divide","result":2.5}` |
| `/api/v1/power` | `{"a": 2, "b": 10}` | `{"operation":"power","result":1024}` |
| `/api/v1/percentage` | `{"a": 200, "b": 15}` | `{"operation":"percentage","result":30}` |
| `/api/v1/sqrt` | `{"a": 9}` | `{"operation":"sqrt","result":3}` |

`percentage` returns **b percent of a**, so `{"a": 200, "b": 15}` is 30.

`sqrt` takes one operand. Sending `b` to it is an error rather than being ignored.

### Errors

Every failure, on every endpoint, has the same shape:

```json
{
  "error": {
    "code": "DIVISION_BY_ZERO",
    "message": "division by zero is not allowed",
    "field": "b"
  }
}
```

`field` is present only when the fault belongs to a specific operand.

| Code | Status | When |
| --- | --- | --- |
| `INVALID_JSON` | 400 | Body is empty, malformed, not an object, or has content after the object |
| `MISSING_FIELD` | 400 | A required operand was not sent |
| `INVALID_NUMBER` | 400 | An operand is not a number |
| `UNKNOWN_FIELD` | 400 | The body contains a field the endpoint does not accept |
| `DIVISION_BY_ZERO` | 400 | Divisor is zero |
| `NEGATIVE_SQRT` | 400 | Square root of a negative number |
| `NON_FINITE_RESULT` | 422 | Operands are valid but the result cannot be represented |
| `METHOD_NOT_ALLOWED` | 405 | Any method other than `POST` |
| `NOT_FOUND` | 404 | Unknown endpoint |

The split between 400 and 422 is deliberate: 400 means the input itself is not acceptable,
422 means the input was fine but the answer cannot be expressed as a finite number.

### Examples

```bash
# a calculation
curl -X POST http://localhost:8080/api/v1/add \
  -H 'Content-Type: application/json' \
  -d '{"a": 2, "b": 3}'
# {"operation":"add","result":5}

# fifteen percent of two hundred
curl -X POST http://localhost:8080/api/v1/percentage \
  -H 'Content-Type: application/json' \
  -d '{"a": 200, "b": 15}'
# {"operation":"percentage","result":30}

# division by zero
curl -i -X POST http://localhost:8080/api/v1/divide \
  -H 'Content-Type: application/json' \
  -d '{"a": 1, "b": 0}'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"DIVISION_BY_ZERO","message":"division by zero is not allowed","field":"b"}}

# a result outside the float64 range
curl -i -X POST http://localhost:8080/api/v1/power \
  -H 'Content-Type: application/json' \
  -d '{"a": 10, "b": 400}'
# HTTP/1.1 422 Unprocessable Entity
# {"error":{"code":"NON_FINITE_RESULT","message":"the result cannot be represented as a finite number"}}

# a missing operand, which is not the same as a zero one
curl -i -X POST http://localhost:8080/api/v1/add \
  -H 'Content-Type: application/json' \
  -d '{"a": 1}'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"MISSING_FIELD","message":"field \"b\" is required","field":"b"}}

# a field the endpoint does not accept
curl -i -X POST http://localhost:8080/api/v1/sqrt \
  -H 'Content-Type: application/json' \
  -d '{"a": 9, "b": 2}'
# HTTP/1.1 400 Bad Request
# {"error":{"code":"UNKNOWN_FIELD","message":"unknown field \"b\"","field":"b"}}

# the wrong method
curl -i -X GET http://localhost:8080/api/v1/add
# HTTP/1.1 405 Method Not Allowed
# Allow: POST
# {"error":{"code":"METHOD_NOT_ALLOWED","message":"this endpoint only accepts POST"}}
```

Under Docker the same calls work through the frontend's origin, for example
`curl -X POST http://localhost:3000/api/v1/add ...`, because nginx proxies `/api/`.

## Tests

```bash
cd backend  && go test ./...                 # and: go vet ./...
cd frontend && npm test                      # and: npm run lint
```

With coverage:

```bash
cd backend  && go test ./... -coverprofile=coverage.out && go tool cover -func=coverage.out
cd frontend && npm run test:coverage
```

Current numbers and what is deliberately not covered are in [COVERAGE.md](COVERAGE.md).

## Design decisions and assumptions

### Arithmetic is `float64`, and its rounding is visible

The service does not hide floating-point behaviour. `0.1 + 0.2` returns
`0.30000000000000004` and `4.35 * 100` returns `434.99999999999994`, because that is what
IEEE 754 doubles do, and the UI shows the number it was given. A decimal library would
have changed those answers at the cost of a dependency and special handling for `sqrt` and
`power`; for a calculator demo, being predictable and honest was judged more useful than
being pretty. A production money calculator would make the opposite call.

### A non-finite result is an error, not a number

`encoding/json` refuses to marshal `NaN` and the infinities - it returns
`*json.UnsupportedValueError`. A handler that wrote `200` and only then tried to encode
such a value would emit a broken body. So every operation checks its result and returns
`NON_FINITE_RESULT` instead, which covers overflow (`10^400`), undefined results
(`(-8)^0.5`) and anything else that escapes the range.

### Negative zero is normalised to zero

`-1 * 0` is negative zero in IEEE 754, and JSON serialises it as `-0`. That is correct and
it looks like a defect, so results are collapsed to positive zero before they leave the
arithmetic layer.

### A missing operand is not a zero operand

Request operands are decoded into pointers. Without that, `{"a": 10}` sent to `/divide`
would decode the absent `b` as `0` and the caller would be told "division by zero" when
the real mistake was a missing field.

An explicit `null` is treated the same as a missing field; JSON decoding cannot
distinguish the two here, and the distinction would not help the caller.

### Unknown fields are rejected

A body carrying a field the endpoint does not accept fails with `UNKNOWN_FIELD` rather than
being silently ignored, so a typo is reported instead of quietly changing what you asked
for. Content after the JSON object is rejected for the same reason: the decoder accepts it
by default.

### CORS is handled differently in each setup, on purpose

In development the frontend and backend are on different ports, so the browser performs a
CORS check. The backend carries a small middleware that answers it, reading
`ALLOWED_ORIGIN` and defaulting to `*` so that a fresh clone works with no configuration.
Because the default is `*`, a browser may not send credentials - this API uses none.

Under Docker there is no CORS check at all: nginx serves the built frontend and proxies
`/api/` to the backend, so the browser only ever talks to one origin. The frontend picks
its base URL accordingly, which is why the Docker image needs no build argument.

### One endpoint per operation, one named handler per endpoint

The alternative was a single `/calculate` endpoint taking the operation as a field, or a
registry of operations behind one generic handler. Both are shorter. Named handlers were
chosen so that the URL and the code have the same shape and `/api/v1/divide` leads to
`handleDivide` with nothing in between; the duplication is seven eight-line functions, and
every failure still passes through one `writeError`, so the error contract cannot drift
between endpoints.

### Percentage means "b percent of a"

The operation is ambiguous in general - it could as easily mean "a is what percent of b" -
so one reading was chosen and is stated here and in the API table. On the keypad it behaves
like any other binary operator: `200 % 15 =` is 30.

### The keypad evaluates left to right, with no operator precedence

`2 + 3 × 4` is **20**, not 14, exactly as a standard pocket calculator behaves. Pressing an
operator computes whatever is already pending, so the running result is always what the
display shows.

This also keeps the promise that the frontend does no arithmetic: each pending operation is
a request to the service. `2 + 3 + 4 =` makes two calls, `add(2,3)` and then `add(5,4)`.

### Which keys are arithmetic and which are editing

Digits, `.`, `±`, `⌫` and `AC` change the number being typed and never reach the network.
Sending "multiply by -1" to the service for a sign toggle would be ceremony, not fidelity.
Everything that is actually arithmetic - the six binary operators and `√` - is a request.

`√` applies immediately to whatever is on the display; the binary operators wait for `=` or
for the next operator.

### The keyboard works as well as the keys

`0`-`9`, `.` and `,` for the decimal point, `+ - * / ^ %`, `Enter` or `=` to evaluate,
`Backspace` to delete, `Escape` to clear. Keystrokes are ignored while a request is in
flight, as are the buttons, which are disabled.

### Validation happens on both sides

The keypad cannot produce a malformed number - there is no way to type two decimal points
or leave the entry empty - so those rules are enforced in the entry logic and tested
directly. It can still produce a number too large for a `float64`: enough digits and
JavaScript's `Number` gives `Infinity`, which `JSON.stringify` would send as `null`. That
case is caught before a request is made.

The backend validates everything again regardless, because an API cannot trust its callers.

### No graceful shutdown

Considered and left out. The service holds no state and a request is one arithmetic
operation taking microseconds, so a drain period would protect no in-flight work. The
server does set `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout` and `IdleTimeout`, which
cost nothing and whose absence would be a real gap.

The server binds its listener before logging that it is listening, so a failed start cannot
be preceded by a line claiming success, and it exits non-zero in that case.

### No CI, no authentication, no persistence

None are in the brief. The services trust each other, nothing is stored, and there is no
pipeline configuration.

## Layout

```
backend/
  cmd/server/          entry point: configuration, listener, server
  internal/calc/       the arithmetic, as pure functions with no HTTP knowledge
  internal/httpapi/    handlers, request decoding, the error contract, CORS, routing
  Dockerfile           multi-stage build to a scratch image (8 MB)
frontend/
  src/api/             typed client and the response contract
  src/components/      the keypad and its state machine
  src/operations.ts    the shared operation list, including arity
  src/entry.ts         the rules for the number being typed, as pure functions
  Dockerfile           multi-stage build to nginx
  nginx.conf           serves the app, proxies /api/ to the backend
docs/PROMPT_LOG.md     engineering journal, including the AI prompts used
docker-compose.yml     both services together
COVERAGE.md            coverage numbers and what is not covered
```
