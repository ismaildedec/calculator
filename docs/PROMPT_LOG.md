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
