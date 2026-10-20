# Coverage

Measured with Go 1.24.4, Node 22.17.1 and Vitest 5.0.5.

The generated artefacts (`coverage.out`, the HTML report, `frontend/coverage/`) are not
committed; the commands below regenerate them.

## Reproducing these numbers

```bash
cd backend
go test ./... -coverprofile=coverage.out
go tool cover -func=coverage.out          # per-function breakdown
go tool cover -html=coverage.out          # browsable report

cd ../frontend
npm run test:coverage
```

## Backend

17 test functions, 112 sub-tests.

| Package | Statement coverage |
| --- | --- |
| `internal/calc` | 100.0% |
| `internal/httpapi` | 100.0% |
| `cmd/server` | 25.0% |
| **total** | **92.5%** |

The total is the only figure below 100% because `main` is deliberately not unit tested, and
it moves when code is removed rather than when tests are: folding seven duplicated handlers
into two factories deleted 43 fully covered statements, which raised `main`'s share of the
whole from 5.5% to 7.5% without any test changing.

## Frontend

80 tests across 5 files.

| Metric | Coverage |
| --- | --- |
| Statements | 100% (159/159) |
| Branches | 100% (80/80) |
| Functions | 100% (40/40) |
| Lines | 100% (150/150) |

`src/api/types.ts` is reported as an empty file: it declares only types, so it compiles to
nothing and has no statements to cover.

## What is not covered, and why

**`main` in `cmd/server`.** It reads two environment variables, binds a TCP listener and
serves. Covering it in a unit test would mean binding a port from the test process to
assert that a server starts, which tests the standard library rather than this code. It is
exercised instead by starting the binary and exercising every endpoint with `curl`,
including the two cases that matter about startup: a successful bind logs that it is
listening, and a failed bind logs only the error and exits with a non-zero status.

`env`, the one piece of logic in that file, is covered by a unit test: an unset variable
and a variable set to the empty string both fall back to the default.

## Why coverage is not the evidence here

Full statement coverage can be reached by tests that assert nothing useful. Each suite was
therefore checked by mutation: the source was deliberately broken in one place at a time
and the suite had to fail. Fifty-two mutations were applied in total and all fifty-two
were killed.

**Backend, 28 mutations.** Arithmetic: removing the non-finite guard; returning the
non-finite value instead of an error; removing the division-by-zero guard; removing the
negative-sqrt guard; no longer collapsing negative zero; subtract adding; multiply
dividing; divide inverting its operands; power swapping its operands; percentage dividing
by ten; percentage always multiplying first (the intermediate-overflow bug); percentage
always dividing first (the naive fix, which costs precision). Decoding: accepting unknown
fields; accepting content after the JSON object; accepting a stray closing delimiter;
accepting a missing operand; reporting a type error as invalid JSON. Error contract:
answering division by zero with 422; dropping the field name from that error; answering
overflow with 400; dropping the JSON content type. Routing and CORS: removing the
method-not-allowed routes; removing the not-found route; removing the percentage entry
from the routing table; the binary factory swapping its operands; every response claiming
to be "add"; sending an empty allowed origin; no longer answering preflight
requests; dropping the allowed-methods header.

**Frontend, 24 mutations.** Entry rules: appending digits to a finished result; allowing a
second decimal point; making the sign toggle a no-op; letting backspace empty the entry;
accepting a non-finite entry. Stage handling: never computing on equals; skipping the
pending operation in a chain; treating every operator press as a swap; editing the left
operand on backspace or sign toggle; half-editing a computed result; leaving stale state
after a failure. Keypad: sending the wrong operation for the square root; no longer
reporting service errors; leaving the keys enabled during a request; unbinding the
keyboard; swallowing browser shortcuts; acting on keys it does not map. Operation table:
dropping percentage. Client: treating a failed response as a success; skipping the result
type check; calling the wrong endpoint; mislabelling a network failure; ignoring the
production base URL.
