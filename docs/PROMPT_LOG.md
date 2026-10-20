# Prompt Log / Engineering Journal

This file records how this project was built with AI assistance, as requested by the
assignment ("Share any prompts that you used in your work").

**Format.** One entry per working phase, append-only. Each entry records the instruction
given, the reasoning that followed, the decision taken, and anything that was *measured*
rather than assumed.

**Working language.** The author and the assistant worked in Turkish. Everything
committed to this repository, including the instructions quoted below, is in English;
quoted instructions are faithful translations, condensed where they repeated themselves.

**A note on the style of collaboration.** The standing rules for the session were: no
code before the requirements are agreed; nothing added that the assignment brief does not
ask for; no technical claim without a measurement; stop and report at the end of every
phase. Those rules shaped this log as much as they shaped the code.

---

## Entry 001 - Requirements analysis, clarifying questions, architecture

### Context

The assignment: build a full-stack calculator, React (TypeScript preferred) frontend
against a Go (preferred) REST backend. Budget ~2-4 hours. The brief states explicitly:
"Prioritize correctness, clarity, and maintainability over extra features."

### Instruction received

> Do not write code yet. First: (1) extract the acceptance criteria of this assignment
> item by item and predict what the evaluator will look at; (2) ask me the five questions
> whose answers would change the design the most, and do not proceed before they are
> answered; (3) then present two architecture options with pros and cons - I will choose.
>
> Standing rules: talk to me in Turkish, but everything that enters the repository is
> English - code, comments, commit messages, README, prompt log. Start writing the prompt
> log in English in engineering-journal format from the start; do not tidy it up afterwards.
> The assignment says 2-4 hours and correctness over extra features, so add nothing that
> is not in the brief without asking me. Make no technical claim without measuring it. I
> will do the commits and pushes, not you. Stop at the end of every phase, report, and
> wait for approval.

### Acceptance criteria extracted

Explicitly required by the brief: four arithmetic operations; a React UI with input
validation, error handling and basic mobile support; REST endpoints that validate input
and handle edge cases (division by zero, invalid data) and return JSON; idiomatic code in
both layers; unit tests for key functionality in both layers; documentation covering
setup, API usage and design rationale; a coverage report; a single git repository.
Optional: exponentiation, square root, percentage, and a Dockerfile.

Predicted evaluation focus, in order of likely weight:

1. Whether a clean clone runs by following the README alone. The most common failure.
2. The quality of the error contract - division by zero must not surface as a 500 or as
   `Infinity`.
3. Validation present in *both* layers, not just one.
4. Which cases the tests cover, rather than the coverage percentage.
5. Scope discipline. The brief's "over extra features" line reads as a deliberate test;
   adding auth, persistence or a deep layered architecture would count against us.
6. Idiomatic Go (handler/logic separation, no global state, correct status codes) and
   idiomatic React TypeScript (no `any`, typed client, loading and error states).
7. A written "design decisions / assumptions" section, which the brief asks for twice.
8. Readable commit history.
9. CORS actually working between the two development servers.

Technical risks flagged for measurement rather than assumption: how `encoding/json`
behaves when asked to marshal `NaN` or an infinity; floating-point display behaviour such
as `0.1 + 0.2`; overflow on large exponents; `0^0` and the square root of a negative
number.

### Clarifying questions and the answers that set the design

1. **Frontend interaction model?** Answer: a two-operand form (operand A, operation,
   operand B, Calculate button) rather than a classic keypad. Rationale: the brief asks
   only for "entering input and displaying results"; a keypad needs a non-trivial input
   state machine (entry buffer, pending operator, repeated equals) whose tests would
   consume the time budget without serving a stated requirement.
2. **API shape?** Answer: one endpoint per operation (`POST /api/v1/add`, `/divide`, and
   so on), matching the brief's plural "endpoints", instead of a single generic
   `/calculate`.
3. **Number semantics?** Answer: `float64` with explicit non-finite result checks, rather
   than a decimal library. Rationale: no external dependency, and square root and power
   stay native. The floating-point consequence (`0.1 + 0.2`) is documented as an
   assumption instead of being hidden.
4. **Which optional operations?** Answer: exponentiation and square root. Percentage was
   deliberately left out: its meaning is ambiguous ("b percent of a" versus "a is what
   percent of b") and the brief marks it optional, so it buys an assumption we do not
   need. Square root was kept specifically because it is unary and therefore forces the
   request schema to handle two different arities.
5. **Delivery extras?** Answer: Docker Compose yes, since the brief lists it and it is
   therefore a scoring line. Coverage as a hand-written `COVERAGE.md` stating both layers'
   numbers and the command to reproduce them, with the generated `coverage.out` and HTML
   report git-ignored. CI explicitly declined: it is not in the brief.

### Decision: backend structure

Two options were put forward.

*Option A - one named handler per operation*, plus shared `decodeBinary`, `decodeUnary`,
`writeResult` and `writeError` helpers. `POST /api/v1/divide` maps to `Handler.Divide`:
greppable and free of indirection, at the cost of six near-identical eight-line handler
bodies.

*Option B - an operation registry* (`{name, arity, fn}`) behind a single generic handler,
with routes bound in a loop. Roughly fifty fewer lines and a structural guarantee that
every endpoint shares one validation path, at the cost of an arity switch and of there
being no named function to find when reading a URL.

**Chosen: Option A.** The deciding argument was that the brief's final yardstick is
"clean, readable, idiomatic", and that Option B's main benefit - a consistent error shape
- is already obtained by funnelling every failure through a single `writeError`. The fifty
lines saved were not worth the loss of directness. Keeping the outside shape (one URL per
operation) identical to the inside shape (one handler per operation) was also judged more
honest than collapsing six routes back into one function.

The arithmetic itself lives in `internal/calc` as pure functions that know nothing about
HTTP, which is where the edge-case tests are aimed.

### Decision: CORS, per environment

The author rejected the suggestion to use a proxy everywhere and asked for a deliberately
different arrangement per environment:

- **Development:** the frontend calls the backend's port directly and the backend carries
  a CORS middleware reading `ALLOWED_ORIGIN`, defaulting to `*` so that anyone who clones
  the repository has it work without configuration.
- **Docker:** nginx serves the built frontend and proxies `/api/` to the backend, so the
  browser only ever talks to one origin and CORS never comes into play.
- A test is to cover the `OPTIONS` preflight explicitly.
- The README is to explain the split and the reason for it.

Consequence to document: with `ALLOWED_ORIGIN` set to `*` a browser may not send
credentials. This application sends none, so the default is safe; stating it is better
than leaving a reader to wonder.

### Decision: error contract

Agreed before any code, because changing it later would touch the backend, the frontend
and every test. Every failure, on every endpoint, returns the same body shape
(`error.code`, `error.message`, and an optional `error.field`). Success returns the
operation name and the result.

Status codes: `400` when the input itself is unacceptable (malformed JSON, missing
operand, non-numeric operand, unknown field, division by zero, square root of a negative
number); `422` when the input is acceptable but the result cannot be represented
(overflow, a non-finite result); `405` and `404` for the wrong method and an unknown
operation.

Three sub-decisions inside that contract are worth recording, because none is the obvious
default:

1. **Request operands are `*float64`, not `float64`.** With a plain `float64`, the body
   `{"a": 10}` sent to `/divide` would decode the absent `b` as `0`, and the caller would
   be told "division by zero" when the real fault was a missing field. A pointer separates
   "not sent" from "sent as zero".
2. **Unknown fields are rejected** (`DisallowUnknownFields`), so a typo such as sending
   `b` to `/sqrt` fails loudly instead of being silently ignored.
3. **Division by zero is `400`, not `422`.** Both are defensible; `400` was chosen as the
   status an evaluator is most likely to expect.

Whether the non-finite-result case is genuinely necessary - that is, what `json.Marshal`
actually does with `NaN` and the infinities - is deliberately left as something to be
settled by a test in the next phase rather than asserted here.

### Measurements

Tool versions on the development machine, measured rather than assumed:

| Tool | Version |
| --- | --- |
| Go | 1.24.4 (windows/amd64) |
| Node | 22.17.1 |
| npm | 10.9.2 |
| Docker | 29.0.1 |
| Docker Compose | 2.40.3 |
| git | 2.50.0 |

The first reading of the Go version was taken inside an unrelated repository that pins
`go 1.25.1` in its `go.mod`; with `GOTOOLCHAIN=auto` that repository switches to a
downloaded 1.25.1 toolchain, so the reading was wrong for this project. Re-measured in a
neutral directory and in this project, the toolchain is 1.24.4. The mistake was caught
because the Docker base image tag depends on the answer.

The practical consequence: 1.24.4 is above 1.22, so the standard library's
`net/http.ServeMux` supports method-and-path patterns (`POST /api/v1/divide`) and the
backend needs **no routing dependency**.

### Repository state finding

The repository had already been cloned, but one level deeper than the path given in the
instructions: the git working tree with the correct `origin` is at
`Desktop/calculator/calculator`, holding a single `Initial commit` and only a
`.gitattributes` file. Rather than relocate someone else's working tree without being
asked, work began inside the existing clone and the discrepancy was reported.

Asked afterwards to correct it, the working tree was flattened one level up to
`Desktop/calculator` by moving all five entries, including `.git`, and removing the empty
inner directory. Verified afterwards: `git fsck` silent, `git status` still tracking
`origin/main`, the single commit and the remote unchanged.

`.gitattributes` already contains `* text=auto` and `core.autocrlf` is unset, so files are
normalised to LF on commit and no line-ending problem is expected on this Windows machine.

### Produced in this phase

The directory skeleton (`backend/cmd/server`, `backend/internal/calc`,
`backend/internal/httpapi`, `docs`), `backend/go.mod` for module
`github.com/ismaildedec/calculator/backend`, the root `.gitignore`, and this log. No
application code yet, by instruction.

### Next

Phase 2: `internal/calc` as pure functions with table-driven tests over the edge cases
listed above, starting with the `NaN` and infinity marshalling question.

---

## Entry 002 - The arithmetic package, measured first

### Instruction received

> Approved. Start phase 2.

### Measurement before implementation

Entry 001 left one question deliberately unanswered: whether the non-finite-result case
in the error contract was real or imagined. A throwaway probe was written **outside the
repository** (it is a measuring instrument, not a deliverable) to settle it, and to
collect the decoding behaviour the HTTP layer will need in the next phase.

What `encoding/json` does with non-finite floats:

| Value | Result |
| --- | --- |
| `NaN` | error, `*json.UnsupportedValueError`: `json: unsupported value: NaN` |
| `+Inf` | error, same type |
| `-Inf` | error, same type |
| struct field holding any of them | error, same type |

So the case is real, and the consequence is worse than a wrong number: a handler that
writes `200` and only then fails to encode would emit a broken body. The guard is
therefore a correctness requirement, not decoration, and `NON_FINITE_RESULT` stays in the
contract.

Arithmetic edge cases, measured rather than recalled:

| Expression | Result |
| --- | --- |
| `1 / 0`, `-1 / 0` | `+Inf`, `-Inf` |
| `0 / 0` | `NaN` |
| `math.Sqrt(-4)` | `NaN` |
| `math.Sqrt(0)` | `0` |
| `math.Pow(0, 0)` | `1` |
| `math.Pow(2, -2)` | `0.25` |
| `math.Pow(10, 400)` | `+Inf` |
| `math.Pow(-8, 0.5)` | `NaN` |
| `1e308 + 1e308` (runtime) | `+Inf` |

### Two ways the measurement was nearly wrong

Both are recorded because both would have put a false statement into this file.

**Constant overflow is a compile-time error.** The first probe would not build:
`1e308 + 1e308` as a *constant* expression is rejected by the compiler as an overflow.
Only runtime values can overflow, which is precisely the case that matters here, since
operands arrive from user input. The probe was changed to use variables.

**Constant folding hid the floating-point artifact.** The probe first reported
`0.1 + 0.2` as `0.3`, and that number was about to be recorded as the measured behaviour.
It is wrong: Go evaluates untyped constant expressions with arbitrary precision at
compile time, so the constant `0.1 + 0.2` really is `0.3`. Re-measured with variables, as
the server will actually compute it:

| Expression (runtime values) | Result |
| --- | --- |
| `0.1 + 0.2` | `0.30000000000000004` |
| `1.1 + 2.2` | `3.3000000000000003` |
| `0.3 - 0.1` | `0.19999999999999998` |
| `4.35 * 100` | `434.99999999999994` |
| `1 / 3` | `0.3333333333333333` |

These values reach the JSON body verbatim. That is the documented cost of the `float64`
decision taken in entry 001; the README will state it as an assumption rather than hide it
behind rounding.

### Decoding behaviour collected for the next phase

Measured against a struct with `*float64` operands and `DisallowUnknownFields`:

| Body | Outcome |
| --- | --- |
| `{"a":1,"b":2}` | ok, both set |
| `{"a":1}` | ok, `b` is nil - the missing-field case works as designed |
| `{"a":1,"b":null}` | ok, `b` is nil - indistinguishable from missing |
| `{"a":"x","b":2}` | `*json.UnmarshalTypeError`, with the field name available |
| `{"a":1,"b":2,"c":3}` | plain error, message `json: unknown field "c"`, not a typed error |
| `{` | plain error, `unexpected EOF` |
| empty body | `io.EOF` |
| `{"a":1,"b":2}{"a":3}` | **ok** - trailing content after the first value is ignored |
| `[1,2]` | `*json.UnmarshalTypeError` with an empty field name |

Three consequences for the HTTP layer, to be implemented next phase: an explicit null is
treated as a missing field (and documented); a type error with a field name maps to
`INVALID_NUMBER` with that field while one without maps to `INVALID_JSON`; and trailing
content has to be rejected deliberately, since the decoder accepts it by default.

### The package

Six pure functions, each returning `(float64, error)`. A single unexported `finite` guard
rejects a result that cannot be represented in JSON. One guard suffices for both overflow
and undefined results because `NaN` and the infinities propagate through arithmetic
rather than appearing only at the last step; it also means a hypothetical non-finite
operand cannot slip through.

Division by zero and the square root of a negative number are intercepted *before* that
guard, even though `finite` would catch both. The reason is the error code: the caller
should be told "division by zero", not "the result is not finite", because the first
names the mistake and the second only names its symptom.

`Add` returning an error reads oddly at first, but `math.MaxFloat64 + math.MaxFloat64`
overflows to `+Inf`, so addition can fail for the same reason as the rest. A uniform
signature across all six also keeps the handlers uniform.

The first draft was over-commented and the author asked for it to be cut back. What
remains is the package doc explaining why the operations return an error at all, and two
short notes in the tests covering why comparisons are exact and what the property tests
guard: eight comment lines across 211, none of them restating code. The same standard
applies to the phases that follow.

### Test design

Table-driven, split by arity: one table for the five binary operations, one for `Sqrt` -
27 and 6 sub-tests respectively, alongside the two property tests described below.

Results are compared with **exact** float equality rather than a tolerance. This is
deliberate: the expected values are either exactly representable or are the precise
`float64` outcome, and a tolerance would hide the very rounding behaviour that four of the
cases exist to document (`0.1 + 0.2`, `0.3 - 0.1`, `4.35 * 100`). Errors are compared with
`errors.Is`.

Two tests carry the design rationale rather than a single case.
`TestJSONRejectsNonFiniteFloats` pins down the premise the guard rests on, so the
reasoning in this log is executable rather than just written down. `TestResultsAreAlwaysMarshalable` runs every
operation over fifteen hostile operands, including both zeros, both extremes of the range
and the smallest subnormal, and asserts the property the HTTP layer depends on: whenever
an operation reports success, its result can be written to the response.

### Verification

| Check | Result |
| --- | --- |
| `gofmt -l .` | no files listed |
| `go build ./...` | clean |
| `go vet ./...` | clean |
| `go test ./internal/calc/` | 4 test functions, 33 sub-tests, all passing |
| statement coverage | 100.0% of `internal/calc` |

Coverage was not accepted as evidence that the tests work. One hundred percent of
statements can be executed by tests that assert nothing useful, so the suite was checked
by mutation: `calc.go` was deliberately broken in one place at a time on a throwaway copy,
and the suite had to fail each time.

| Mutation | Outcome |
| --- | --- |
| remove the non-finite guard | killed |
| non-finite guard returns the value instead of an error | killed |
| remove the division-by-zero guard | killed |
| remove the negative-sqrt guard | killed |
| subtract adds instead | killed |
| multiply divides instead | killed |
| divide inverts its operands | killed |
| power swaps its operands | killed |

Eight of eight killed, so the suite detects a wrong answer and not merely the absence of a
crash.

### Open question raised for the author

`Multiply(-1, 0)` returns negative zero, which `encoding/json` writes as `-0`. It is a
valid JSON number and an honest IEEE 754 result, but it looks like a defect to a user. It
was left as it is rather than silently normalised, because normalising would be behaviour
the brief does not ask for. Flagged for a decision.

### Next

Phase 3: the HTTP layer - six handlers, the shared decode and response helpers, the error
mapping measured above, the CORS middleware with its `OPTIONS` preflight test, and
rejection of trailing content.

---

## Entry 003 - The HTTP layer

### Instruction received

> Pushed, let us continue.

The negative-zero question from entry 002 was still unanswered. Since nothing in this
phase depends on it, the work went ahead on the assumption that the value is left as it
is and documented, which is the option that adds no behaviour; switching to normalisation
later is a one-line change.

### Structure

Four files, following the option A decision from entry 001. `handler.go` holds six named
handlers, each eight lines: decode, compute, write. `decode.go` holds `decodeBinary` and
`decodeUnary` over the pointer-operand structs, plus the mapping from decoding failures to
the error contract. `response.go` holds the response shapes, the `apiError` type and the
single `writeError` every failure passes through. `router.go` binds the routes and wraps
them in the CORS middleware.

`cmd/server/main.go` reads `PORT` and `ALLOWED_ORIGIN`, sets read and write timeouts on
the server and serves. Graceful shutdown was deliberately left out: it is idiomatic, but
the brief does not ask for it. It is noted here as a ten-line addition if the author wants
it.

### A problem the measurement did not predict

With Go 1.22 method patterns, registering `POST /api/v1/add` makes the standard mux answer
a `GET` on that path by itself - with a **plain-text** 405. That would have been the one
response in the service not following the JSON error contract, and no test written against
the happy path would have caught it.

The fix is to register the bare path as well, so the method-constrained pattern serves
`POST` and the bare one serves everything else:

```go
mux.HandleFunc("POST /api/v1/add", handleAdd)
mux.HandleFunc("/api/v1/add", handleMethodNotAllowed)
```

Whether the mux treats those two as a conflict - which panics at registration rather than
failing a build - was not assumed. The first test run answered it: the patterns coexist,
the method-constrained one being the more specific. The six bare registrations are made in
a loop, since that case is uniform; the six operation handlers stay explicit, which was the
point of choosing option A.

The preflight is answered in the CORS middleware, before the mux. That ordering matters:
an `OPTIONS` request reaching the mux would have been met by `handleMethodNotAllowed`.

### The error mapping

Built on the decoding behaviour measured in entry 002 rather than on guesses about it. A
`*json.UnmarshalTypeError` carrying a field name becomes `INVALID_NUMBER` naming that
field; the same error without one means the whole body was the wrong shape and becomes
`INVALID_JSON`. `io.EOF` is reported as an empty body rather than as malformed JSON, since
those are different mistakes from the caller's side.

The unknown-field case is the ugly one. `encoding/json` reports it as an untyped error
whose message is the only place the field name appears, so the name is recovered by
trimming the message prefix. The comment in the code says why, because string-matching a
standard library message is otherwise an obvious thing to object to.

Trailing content is rejected explicitly with `dec.More()`. Entry 002 measured that
`{"a":1,"b":2}{"a":3}` is accepted by default, the decoder simply stopping after the first
value.

`writeJSON` marshals before it touches the status code, so an encoding failure can still
be reported as a 500 with the usual error body instead of a half-written 200. This is the
direct consequence of the `NaN` finding in entry 002.

### Verification

| Check | Result |
| --- | --- |
| `gofmt -l .` | no files listed |
| `go vet ./...` | clean |
| `go test ./...` | all passing |
| `internal/calc` coverage | 100.0% |
| `internal/httpapi` coverage | 100.0% |
| `cmd/server` coverage | 33.3% |
| total | 96.0% |

The first run of the HTTP tests reported 85.3%, and the gaps were not random: the error
branches of five handlers had no test, which is to say the contract itself was untested on
most endpoints. Those cases were added for that reason, not to move the number. The only
statements now uncovered anywhere are those of `main`, which binds a port; that is left
untested on purpose and recorded as such rather than papered over.

Mutation checking was extended to the whole backend. Twenty mutations across arithmetic,
decoding, the error contract, routing and CORS - among them accepting unknown fields,
accepting trailing content, answering division by zero with 422, dropping the JSON content
type, removing the method-not-allowed routes, sending an empty allowed origin and no longer
answering preflight requests. All twenty were killed.

### Evidence from a running server

The server was built, started on port 8099 with `ALLOWED_ORIGIN=http://localhost:5173`,
and exercised with curl. Measured, not predicted:

| Request | Status | Body |
| --- | --- | --- |
| `add {"a":2,"b":3}` | 200 | `{"operation":"add","result":5}` |
| `divide {"a":10,"b":4}` | 200 | `{"operation":"divide","result":2.5}` |
| `add {"a":0.1,"b":0.2}` | 200 | `{"operation":"add","result":0.30000000000000004}` |
| `divide {"a":1,"b":0}` | 400 | `DIVISION_BY_ZERO`, field `b` |
| `sqrt {"a":-4}` | 400 | `NEGATIVE_SQRT`, field `a` |
| `power {"a":10,"b":400}` | 422 | `NON_FINITE_RESULT` |
| `add {"a":1}` | 400 | `MISSING_FIELD`, field `b` |
| `add {"a":"x","b":2}` | 400 | `INVALID_NUMBER`, field `a` |
| `add {"a":1,"b":2,"c":3}` | 400 | `UNKNOWN_FIELD`, field `c` |
| `add {"a":1,` | 400 | `INVALID_JSON` |
| `add` with no body | 400 | `INVALID_JSON`, "request body is empty" |
| `GET add` | 405 | `METHOD_NOT_ALLOWED`, `Allow: POST` |
| `POST percentage` | 404 | `NOT_FOUND` |

The preflight answered `204` with the three CORS headers and an empty body, and the
configured origin was echoed rather than the `*` default, confirming `ALLOWED_ORIGIN` is
actually read. The `0.1 + 0.2` row is the entry 002 measurement arriving in a real
response, which is what the README will document as an assumption.

### Next

Phase 4: the frontend - the two-operand form, a typed client, validation before the request
is sent, rendering of the error contract, basic mobile support, and Vitest tests.

---

## Entry 004 - Three decisions from the author, applied

### Instruction received

> Normalise negative zero to 0.
>
> Do not add graceful shutdown. The service is stateless and requests take milliseconds;
> there is nothing to drain. Write it in the README design decisions: "considered, not
> added, for this reason."
>
> But do add the `http.Server` timeouts (`ReadHeaderTimeout`, `ReadTimeout`,
> `WriteTimeout`, `IdleTimeout`). They contain no logic, produce no errors, and leaving
> them out is a real omission in Go.
>
> If graceful shutdown is ever added: test that the process exits with a NON-ZERO code when
> startup fails. Otherwise "I could not start" and "I shut down cleanly" look the same.

### Negative zero

Collapsed inside `finite`, so every operation benefits from one line rather than each one
guarding separately.

That line, `if v == 0 { return 0, nil }`, reads as a no-op and would be a natural thing for
a later reader to delete as dead code, so it carries the only inline comment in the
package body explaining that it is not redundant.

The test checks `math.Signbit` rather than equality, because `-0 == 0` is true in Go and an
equality assertion would have passed with or without the fix. Five paths that produce a
negative zero are covered: multiplying a negative by zero, multiplying by a negative zero,
adding two negative zeros, dividing a negative zero, and the square root of one.

Verified by mutation: replacing the collapse with `if false` kills the suite, so the test
is doing work. Verified end to end against a running server as well -
`multiply {"a":-1,"b":0}` now answers `{"operation":"multiply","result":0}`, and
`sqrt {"a":-0.0}` answers `0`.

### Graceful shutdown: declined, with the reasoning recorded

Not added. The reasoning is the author's and belongs in the README rather than only here:
the service holds no state and a request is a single arithmetic operation, so there is no
in-flight work a drain period would protect.

### Timeouts

`IdleTimeout` was missing and has been added alongside the three that were already there.
The author's argument is the deciding one: these fields carry no logic and cannot fail, so
including them costs nothing, while omitting them is a genuine gap in a Go server rather
than a stylistic preference.

### The exit-code requirement, measured now rather than assumed later

The standing instruction above is recorded for whenever graceful shutdown appears. The
current behaviour was measured rather than left to assumption: a second instance started on
an already-bound port exits with **code 1** and logs the bind error, because
`log.Fatal` is what handles a failed `ListenAndServe` at this point. So the requirement is already
met, and the risk the author names only becomes live once a shutdown path exists - at that
point `http.ErrServerClosed` has to be distinguished from a real startup failure, or a
bind error could end up exiting zero.

### Something the measurement turned up

The startup log line is printed *before* `ListenAndServe` is called, so a failed bind
produces `calculator api listening on :8097` immediately followed by the bind error. The
log claims success for something that did not happen. It is the same class of misleading
signal as the exit-code point above.

Left unchanged and raised with the author rather than fixed silently, since it is not in the
brief. The fix is to listen first and log afterwards:

```go
l, err := net.Listen("tcp", addr)
if err != nil {
    log.Fatal(err)
}
log.Printf("calculator api listening on %s, allowed origin %q", addr, allowedOrigin)
if err := srv.Serve(l); err != nil {
    log.Fatal(err)
}
```

### Verification after the changes

`gofmt` and `go vet` clean. `internal/calc` and `internal/httpapi` both at 100.0% statement
coverage, `cmd/server` at 33.3% with only `main` uncovered, 96.1% overall. Twenty-one
mutations across the backend, all killed.

---

## Entry 005 - The frontend

### Instruction received

> Fix it, then move on to phase 4.

The fix is the misleading startup log from entry 004: bind first, log second. `net.Listen`
now runs before the log line and `srv.Serve` takes the listener, so `Addr` on the server
struct became dead configuration and was removed. Measured both ways afterwards: a
successful start logs `calculator api listening on :8096`, and a failed bind logs only the
bind error and exits 1, with no line claiming success.

### Scaffold

`npm create vite@latest frontend -- --template react-ts`, then the test tooling. Versions
measured rather than assumed, because they decide what the Docker image and the README
have to say:

| Package | Version |
| --- | --- |
| react | 19.3.1 |
| vite | 8.3.4 |
| typescript | 7.0.2 |
| vitest | 5.0.5 |
| @testing-library/react | 16.3.3 |

Installed clean, no peer conflicts, no advisories.

The scaffold's demo material was deleted rather than left lying around: `src/assets`
(three images), `public/icons.svg`, and `frontend/README.md`, which was Vite template prose
about React Compiler and plugin choices with nothing to do with this project. Checked for
references before deleting each one.

### Shape of the UI

A two-operand form, as decided in entry 001. The operation is a radio group, so it is one
accessible control with six options rather than six buttons with invented semantics, and
the arity in the shared operation list decides whether the second operand is rendered at
all - selecting square root removes the field rather than disabling it.

Operands are `type="text"` with `inputMode="decimal"`, not `type="number"`. A number input
would hand validation to the browser, which means messages we do not control, differing by
browser, and awkward to assert in a test. The brief asks specifically for input validation
and error handling, so those belong to us.

Editing either operand discards the displayed result. A result left on screen next to
operands it was not computed from is simply a false statement, and it is the kind of bug
nobody files because it looks like staleness rather than wrongness.

### The client

`calculate` returns a discriminated union rather than throwing. A thrown error would mean
try/catch in the component for something that is not exceptional at all - division by zero
is a perfectly ordinary outcome of this form - and a union makes the two paths equally
visible to the type checker.

It also validates what comes back instead of trusting it: a non-JSON body, a success
without a numeric `result`, and an error without a `code` all become `INVALID_RESPONSE`
rather than being allowed to reach the UI as `undefined`. A fetch rejection becomes
`NETWORK_ERROR` with a message that names the likely cause.

One detail is a direct consequence of a backend decision: the request for a unary
operation must omit `b` entirely, because the service rejects unknown fields. Sending
`{"a":9,"b":null}` to `/sqrt` would turn a valid calculation into a 400. There is a test
asserting the serialised body is exactly `{"a":9}`.

### Validation

Three distinct messages rather than one: empty, unparseable, and out of range. `Number('')`
is `0` in JavaScript, so the empty case has to be checked before parsing or a blank field
would silently calculate with zero.

The backend validates all of this again. That is deliberate, not redundant: the frontend
check exists so a mistake is reported instantly without a round trip, and the backend check
exists because an API cannot trust its callers.

### A mistake in my own test

The first run failed one test. The button label changes to `Calculating...` while a request
is in flight, and the query I had written looked for `/calculate/i`, which does not match
`Calculating`. The component was right and the test was wrong - a useful reminder that a red
test is not automatically a bug in the code.

### Verification

| Check | Result |
| --- | --- |
| `tsc -b` | clean |
| `vite build` | succeeds, 223 kB bundle, 70 kB gzipped |
| `oxlint` | 0 warnings, 0 errors over 11 files and 116 rules |
| `vitest run` | 40 tests in 5 files, all passing |
| statements / branches / functions / lines | 100% / 100% / 100% / 100% |

The clean lint result was not taken at face value: oxlint printed nothing at all, which
looks the same as not having run. A throwaway file containing an unused variable and an
`eval` call was linted and produced two warnings, so the silence is real. The file was
deleted immediately.

Coverage reports `src/api/types.ts` as an empty file. It holds only type declarations, so
it compiles to nothing and has no statements to cover.

Coverage was again not treated as evidence on its own. Eleven mutations were applied to the
frontend - accepting an empty operand, accepting a non-numeric one, submitting despite
validation errors, treating every operation as binary, never marking a field invalid, no
longer rendering the service error, treating a failed response as a success, skipping the
result type check, calling the wrong endpoint, and mislabelling a network failure. All
eleven were killed.

Copying the project for each mutation was impractical here because of `node_modules`, so
the mutations are applied in place and the file is restored from a byte-for-byte backup,
with the restore also wired to a trap so an interrupted run cannot leave a modified source
behind, and a checksum comparison afterwards. Not `git checkout`: the work was uncommitted,
and restoring through git would have destroyed it.

### Measured against the real backend

Both halves were started together and exercised, since this is what the README will tell a
reader to do and the most common way a take-home fails is that those instructions do not
work.

The backend answered `{"operation":"divide","result":2.5}` to a request carrying
`Origin: http://127.0.0.1:5173`, with `Access-Control-Allow-Origin: *` from the default, and
the preflight returned 204 with all three CORS headers. The dev server served the app shell
with the right title and entry point, and the production bundle contains the real UI strings
and the API path.

One finding that changes the documentation: **the Vite dev server binds IPv6 only on this
machine.** `http://localhost:5173` and `http://[::1]:5173` both answer; `http://127.0.0.1:5173`
refuses the connection. The README has to say `localhost`, because telling a reader to open
`127.0.0.1:5173` would hand them a broken instruction.

### Next

Phase 5: the Dockerfiles and compose setup with nginx proxying `/api/`, the README with
setup instructions, API examples and the design decisions, and `COVERAGE.md`.

---

## Entry 006 - Docker, documentation, and a clean-clone test

### Instruction received

> Pushed, start.
>
> I want to test it myself too, so at the end tell me how to test the project.

### The build-time trap, and a verification of mine that was wrong

The frontend needs a different API base in each setup: the backend's own port in
development, same-origin under nginx. The obvious implementation is to set
`VITE_API_BASE_URL=""` in the Dockerfile, but that leans on an empty string surviving
Vite's environment injection. If it did not, the image would quietly bake in
`http://localhost:8080` - and on a developer's own machine that might even appear to work,
because the host really does have a backend on 8080. A bug that only shows up on someone
else's computer.

So the rule became a function instead, deriving the base from `PROD` with the variable as
an override, which means the image needs no build argument at all, and the rule is unit
tested for all three inputs.

The first check of this was a bad test: it grepped the built bundle for `localhost:8080`
and reported a failure. The string is indeed present, and the verdict was still wrong -
presence of a literal is not behaviour. Reading the emitted code settled it:

```js
function d(e){return e.VITE_API_BASE_URL??(e.PROD?``:`http://localhost:8080`)}
var f=d({BASE_URL:`/`,DEV:!1,MODE:`production`,PROD:!0,SSR:!1})
```

The call passes `PROD:!0` with no `VITE_API_BASE_URL`, so the function returns the empty
string and the request template `fetch(\`${f}/api/v1/${e}\`)` resolves to `/api/v1/add`.
The literal survives only as a dead branch the minifier could not remove, since the choice
is made at runtime from an injected object.

The check was replaced with one that asserts the thing that matters: that the injected
object at the call site carries `PROD:!0` and no baked-in override. Noted here because the
first version is the kind of test that fails for the wrong reason and, had it been the
other way around, would have passed for the wrong reason too.

### Images

The backend builds to `scratch`. A statically linked Go binary needs no shell, no package
manager and no CA certificates, the last only because this service makes no outbound
calls - a service that did would need them copied in. The result is **8.3 MB**. The
container runs as uid 65534 rather than root, written numerically because `scratch` has no
`/etc/passwd` to resolve a name against.

The frontend builds with `node:22-alpine` and is served by `nginx:alpine`, **103 MB**. Its
`.dockerignore` is not decoration: without `node_modules` excluded, the host's installed
tree would be copied into the build context, defeating the `npm ci` layer and potentially
carrying platform-specific binaries into a Linux image.

`proxy_pass http://backend:8080;` has no trailing slash, so `/api/v1/add` reaches the
backend unchanged. nginx resolves that hostname when it loads its configuration rather
than per request, so `depends_on` is what makes the name resolvable in time.

Compose publishes the backend on 8080 as well as serving the frontend on 3000. That is so
the `curl` examples in the README work against the Docker stack and not only against
`go run`; the frontend itself never uses that port.

### Documentation

`README.md` covers the two ways to run it, the six endpoints, the full error-code table,
runnable `curl` examples with their actual output, and a design-decisions section carrying
the assumptions this log accumulated: float64 rounding left visible, non-finite results as
errors, negative zero normalised, a missing operand distinguished from a zero one, unknown
fields rejected, CORS handled per environment, one handler per endpoint, percentage
omitted, validation on both sides, and graceful shutdown considered and declined with the
reason the author gave.

`COVERAGE.md` carries the numbers, the commands to reproduce them, what is deliberately
not covered, and the mutation results - because statement coverage alone is not evidence
that a suite detects anything.

### Numbers at the end of the phase

| Layer | Tests | Coverage |
| --- | --- | --- |
| Backend | 16 functions, 74 sub-tests | `calc` 100%, `httpapi` 100%, `cmd/server` 25.0%, total 94.2% |
| Frontend | 43 tests in 5 files | 100% statements, branches, functions and lines |

The backend total fell from 96.1% to 94.2% during this phase. Nothing regressed: `main`
grew by the `net.Listen` fix, so the one function deliberately left uncovered now accounts
for more statements. Recorded rather than quietly rounded up.

### The two verifications that mattered most

Entry 001 predicted that the most likely way this submission fails is that the README's
instructions do not work on someone else's machine. Two checks were aimed at exactly that.

First, every `curl` example in the README was run verbatim against the running stack and
its output compared with what the README claims. All seven matched, including status lines
and error bodies.

Second, a clean-clone test. The files git would actually hand someone - tracked plus
untracked and not ignored, 47 of them, with no `node_modules`, no `dist` and no `coverage`
- were copied to a separate directory and the project was started there from nothing:

| From the clean copy | Result |
| --- | --- |
| `docker compose up --build` | both images built, stack came up |
| `http://localhost:3000` | serves the app, title `Calculator` |
| `add` through the UI origin | `{"operation":"add","result":5}` |
| `divide` by zero through the UI origin | the 400 error contract |
| bundle built inside the image | `PROD:!0`, no override, same-origin |
| `go vet ./...` and `go test ./...` | clean, all packages passing |
| `npm install` from the lockfile alone | 0 vulnerabilities |
| `npm test` | 43 tests passing |
| `npm run lint`, `npm run build` | clean, built in 343 ms |

The temporary copy and its images were removed afterwards.

---

## Entry 007 - Replacing the form with a keypad

### Instruction received

> I do not like this design. I do not want to type a number and then pick an operation.
> Let us change the calculator to the keypad layout you offered me in the model choice.

Followed by two decisions, asked before any code was written because each changed work in
both layers:

> Add percentage to the backend.
>
> Yes, the physical keyboard should work too.

The keypad was the option entry 001 argued against, on the grounds that its input state
machine would add needless complexity. That argument was made before anything existed; the
author has now seen the result and chosen differently, which is a different situation, so
the keypad was built rather than re-litigated.

### What was thrown away

`CalculatorForm.tsx` and its fourteen tests. Also `validation.ts` and its fourteen tests,
for a reason worth recording: with a keypad there is no way to type a letter, so
`validateOperand`'s "not a number" and "empty" branches became unreachable. Keeping tested
code that can never run would have been worse than deleting it.

What replaced it is narrower and entirely reachable: `entry.ts`, the rules for the number
being typed, as pure string functions - `appendDigit`, `appendDot`, `toggleSign`,
`removeLast`, `entryToOperand`. Extracting them means the fiddly parts (a lone zero is
replaced rather than grown, a second decimal point is refused, backspacing to nothing
yields `0` rather than an empty string) are unit tested directly instead of only through
the component.

One validation case survives and is genuinely reachable: hold a digit key long enough and
`Number()` returns `Infinity`, which `JSON.stringify` would send as `null`. That is caught
before a request is made.

### Percentage

`Percentage(a, b)` returns b percent of a, so `{"a":200,"b":15}` is 30. Entry 001 left the
operation out precisely because the meaning is ambiguous; the ambiguity has not gone away,
so the reading chosen is stated in the README and in the API table rather than left for a
caller to discover.

On the keypad it is simply another binary operator - `200 % 15 =` - rather than the
context-sensitive key a pocket calculator has, because that is what the endpoint is.

### Both suites caught a stale assumption of mine

The backend test for an unknown endpoint used `/api/v1/percentage` as its example of an
operation that does not exist. Adding percentage made that test fail with a 200, which is
exactly right.

The frontend test written in entry 005 to pin the operation list to the service's endpoints
failed for the same reason. That test exists to catch one side drifting from the other, and
the first drift it caught was mine.

### The state machine

Three pieces of state carry a calculation: `accumulator` (the value already computed),
`pending` (the operator waiting for its right-hand side) and `replace` (whether the next
digit starts a new number or appends to the current one).

Evaluation is sequential, with no operator precedence: `2 + 3 × 4` is 20. That is how a
standard pocket calculator behaves, and it follows from the service exposing binary
operations - pressing an operator computes whatever was pending, so the display always
shows the running result. `2 + 3 + 4 =` makes two requests, `add(2,3)` then `add(5,4)`.

The division of labour is explicit: digits, `.`, `±`, `⌫` and `AC` edit the number being
typed and never reach the network; the six binary operators and `√` are requests. Sending
"multiply by -1" for a sign toggle would have been fidelity theatre rather than keeping the
promise that the service does the arithmetic.

Keyboard support maps the obvious keys and ignores input while a request is in flight, as
the buttons do by being disabled.

### Verification

The first coverage run reported 90.66% and the gaps were all real behaviour rather than
noise: the too-large guard on the operator and equals paths, failure handling mid-chain and
after `√`, the in-flight guard on the keyboard, and five of the keyboard operator mappings.
Tests were added for each, which brought it to 100%.

| Layer | Tests | Coverage |
| --- | --- | --- |
| Backend | 16 functions, 84 sub-tests | `calc` 100%, `httpapi` 100%, `cmd/server` 25.0%, total 94.6% |
| Frontend | 68 tests in 5 files | 100% statements, branches, functions and lines |

The mutation checks were rewritten for the new design rather than quietly dropped, since
the files they pointed at no longer exist. Forty mutations now, all killed: 23 on the
backend including percentage dividing by ten and the percentage route removed, and 17 on
the frontend including appending digits to a finished result, allowing a second decimal
point, ignoring a repeated operator press, unbinding the keyboard, and leaving the keys
enabled during a request.

The images were rebuilt and the stack checked again: percentage answers `30` through the
nginx proxy, the keypad's own strings are present in the shipped bundle, and the base URL
is still resolved same-origin inside the image.
