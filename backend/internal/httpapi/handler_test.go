package httpapi

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const testOrigin = "*"

func send(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	NewRouter(testOrigin).ServeHTTP(rec, req)
	return rec
}

func TestOperationsSucceed(t *testing.T) {
	tests := []struct {
		name string
		path string
		body string
		want float64
	}{
		{name: "add", path: "/api/v1/add", body: `{"a":2,"b":3}`, want: 5},
		{name: "subtract", path: "/api/v1/subtract", body: `{"a":5,"b":3}`, want: 2},
		{name: "multiply", path: "/api/v1/multiply", body: `{"a":4,"b":3}`, want: 12},
		{name: "divide", path: "/api/v1/divide", body: `{"a":10,"b":4}`, want: 2.5},
		{name: "power", path: "/api/v1/power", body: `{"a":2,"b":10}`, want: 1024},
		{name: "percentage", path: "/api/v1/percentage", body: `{"a":200,"b":15}`, want: 30},
		{name: "percentage survives an intermediate overflow", path: "/api/v1/percentage", body: `{"a":1e300,"b":1e10}`, want: 1e308},
		{name: "trailing whitespace is accepted", path: "/api/v1/percentage", body: "{\"a\":200,\"b\":15}\n  ", want: 30},
		{name: "sqrt", path: "/api/v1/sqrt", body: `{"a":9}`, want: 3},
		{name: "negative operands", path: "/api/v1/add", body: `{"a":-2,"b":-3}`, want: -5},
		{name: "float64 rounding is passed through", path: "/api/v1/add", body: `{"a":0.1,"b":0.2}`, want: 0.30000000000000004},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := send(t, http.MethodPost, tt.path, tt.body)

			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, want 200. body: %s", rec.Code, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", got)
			}

			var resp successResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("response is not valid JSON: %v. body: %s", err, rec.Body.String())
			}
			if want := strings.TrimPrefix(tt.path, "/api/v1/"); resp.Operation != want {
				t.Errorf("operation = %q, want %q", resp.Operation, want)
			}
			if resp.Result != tt.want {
				t.Errorf("result = %v, want %v", resp.Result, tt.want)
			}
		})
	}
}

func TestErrorResponses(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
		wantCode   string
		wantField  string
	}{
		{
			name: "division by zero", method: http.MethodPost, path: "/api/v1/divide", body: `{"a":1,"b":0}`,
			wantStatus: http.StatusBadRequest, wantCode: codeDivisionByZero, wantField: "b",
		},
		{
			name: "zero divided by zero", method: http.MethodPost, path: "/api/v1/divide", body: `{"a":0,"b":0}`,
			wantStatus: http.StatusBadRequest, wantCode: codeDivisionByZero, wantField: "b",
		},
		{
			name: "square root of a negative number", method: http.MethodPost, path: "/api/v1/sqrt", body: `{"a":-4}`,
			wantStatus: http.StatusBadRequest, wantCode: codeNegativeSqrt, wantField: "a",
		},
		{
			name: "power overflows the range", method: http.MethodPost, path: "/api/v1/power", body: `{"a":10,"b":400}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "missing operand", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "missing first operand", method: http.MethodPost, path: "/api/v1/add", body: `{"b":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "a",
		},
		{
			name: "missing operand on subtract", method: http.MethodPost, path: "/api/v1/subtract", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "missing operand on multiply", method: http.MethodPost, path: "/api/v1/multiply", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "missing operand on divide", method: http.MethodPost, path: "/api/v1/divide", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "missing operand on power", method: http.MethodPost, path: "/api/v1/power", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "missing operand on percentage", method: http.MethodPost, path: "/api/v1/percentage", body: `{"a":1}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "percentage overflows the range", method: http.MethodPost, path: "/api/v1/percentage",
			body:       `{"a":1.7976931348623157e308,"b":1.7976931348623157e308}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "missing operand on sqrt", method: http.MethodPost, path: "/api/v1/sqrt", body: `{}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "a",
		},
		{
			name: "add overflows the range", method: http.MethodPost, path: "/api/v1/add",
			body:       `{"a":1.7976931348623157e308,"b":1.7976931348623157e308}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "subtract overflows the range", method: http.MethodPost, path: "/api/v1/subtract",
			body:       `{"a":-1.7976931348623157e308,"b":1.7976931348623157e308}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "multiply overflows the range", method: http.MethodPost, path: "/api/v1/multiply",
			body:       `{"a":1.7976931348623157e308,"b":2}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "divide overflows the range", method: http.MethodPost, path: "/api/v1/divide",
			body:       `{"a":1.7976931348623157e308,"b":0.5}`,
			wantStatus: http.StatusUnprocessableEntity, wantCode: codeNonFiniteResult,
		},
		{
			name: "sqrt of a number that is not a number", method: http.MethodPost, path: "/api/v1/sqrt", body: `{"a":"nine"}`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidNumber, wantField: "a",
		},
		{
			name: "null operand is treated as missing", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":null}`,
			wantStatus: http.StatusBadRequest, wantCode: codeMissingField, wantField: "b",
		},
		{
			name: "string operand", method: http.MethodPost, path: "/api/v1/add", body: `{"a":"x","b":2}`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidNumber, wantField: "a",
		},
		{
			name: "boolean operand", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":true}`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidNumber, wantField: "b",
		},
		{
			name: "unknown field", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":2,"c":3}`,
			wantStatus: http.StatusBadRequest, wantCode: codeUnknownField, wantField: "c",
		},
		{
			name: "second operand sent to a unary operation", method: http.MethodPost, path: "/api/v1/sqrt", body: `{"a":9,"b":2}`,
			wantStatus: http.StatusBadRequest, wantCode: codeUnknownField, wantField: "b",
		},
		{
			name: "truncated json", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "empty body", method: http.MethodPost, path: "/api/v1/add", body: ``,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "content after the json object", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":2}{"a":3}`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "a stray closing brace after the object", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":2}}`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "a stray closing bracket after the object", method: http.MethodPost, path: "/api/v1/add", body: `{"a":1,"b":2}]`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "body is an array", method: http.MethodPost, path: "/api/v1/add", body: `[1,2]`,
			wantStatus: http.StatusBadRequest, wantCode: codeInvalidJSON,
		},
		{
			name: "wrong method", method: http.MethodGet, path: "/api/v1/add", body: ``,
			wantStatus: http.StatusMethodNotAllowed, wantCode: codeMethodNotAllowed,
		},
		{
			name: "operation that does not exist", method: http.MethodPost, path: "/api/v1/factorial", body: `{"a":1,"b":2}`,
			wantStatus: http.StatusNotFound, wantCode: codeNotFound,
		},
		{
			name: "unknown path", method: http.MethodPost, path: "/", body: ``,
			wantStatus: http.StatusNotFound, wantCode: codeNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := send(t, tt.method, tt.path, tt.body)

			if rec.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d. body: %s", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if got := rec.Header().Get("Content-Type"); got != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", got)
			}

			var resp errorResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("error response is not valid JSON: %v. body: %s", err, rec.Body.String())
			}
			if resp.Error.Code != tt.wantCode {
				t.Errorf("code = %q, want %q", resp.Error.Code, tt.wantCode)
			}
			if resp.Error.Field != tt.wantField {
				t.Errorf("field = %q, want %q", resp.Error.Field, tt.wantField)
			}
			if resp.Error.Message == "" {
				t.Error("message is empty")
			}
		})
	}
}

func TestSuccessfulResponseCarriesNoErrorObject(t *testing.T) {
	rec := send(t, http.MethodPost, "/api/v1/add", `{"a":1,"b":2}`)

	var body map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if _, found := body["error"]; found {
		t.Errorf("a successful response contains an error object: %s", rec.Body.String())
	}
}

func TestEveryOperationRejectsOtherMethods(t *testing.T) {
	for _, operation := range operations {
		for _, method := range []string{http.MethodGet, http.MethodPut, http.MethodDelete} {
			t.Run(operation.name+" "+method, func(t *testing.T) {
				rec := send(t, method, "/api/v1/"+operation.name, "")

				if rec.Code != http.StatusMethodNotAllowed {
					t.Fatalf("status = %d, want 405. body: %s", rec.Code, rec.Body.String())
				}

				var resp errorResponse
				if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
					t.Fatalf("response is not valid JSON: %v. body: %s", err, rec.Body.String())
				}
				if resp.Error.Code != codeMethodNotAllowed {
					t.Errorf("code = %q, want %q", resp.Error.Code, codeMethodNotAllowed)
				}
			})
		}
	}
}

func TestMethodNotAllowedAdvertisesPost(t *testing.T) {
	rec := send(t, http.MethodGet, "/api/v1/divide", "")

	if got := rec.Header().Get("Allow"); got != http.MethodPost {
		t.Errorf("Allow = %q, want %q", got, http.MethodPost)
	}
}

func TestPreflightRequestIsAnswered(t *testing.T) {
	rec := send(t, http.MethodOptions, "/api/v1/add", "")

	if rec.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, testOrigin)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); !strings.Contains(got, http.MethodPost) {
		t.Errorf("Access-Control-Allow-Methods = %q, want it to include POST", got)
	}
	if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "Content-Type") {
		t.Errorf("Access-Control-Allow-Headers = %q, want it to include Content-Type", got)
	}
	if rec.Body.Len() != 0 {
		t.Errorf("preflight response has a body: %s", rec.Body.String())
	}
}

func TestCORSHeaderIsPresentOnNormalResponses(t *testing.T) {
	for _, path := range []string{"/api/v1/add", "/api/v1/nope"} {
		rec := send(t, http.MethodPost, path, `{"a":1,"b":2}`)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != testOrigin {
			t.Errorf("%s: Access-Control-Allow-Origin = %q, want %q", path, got, testOrigin)
		}
	}
}

// calc never returns a non-finite result, so this branch is a defence, not a live path.
func TestWriteJSONFallsBackWhenEncodingFails(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, math.NaN())

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}

	var resp errorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("fallback body is not valid JSON: %v. body: %s", err, rec.Body.String())
	}
	if resp.Error.Code != codeInternal {
		t.Errorf("code = %q, want %q", resp.Error.Code, codeInternal)
	}
}

func TestUnrecognisedErrorBecomesInternalServerError(t *testing.T) {
	got := asAPIError(errors.New("something nobody mapped"))

	if got.status != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", got.status)
	}
	if got.code != codeInternal {
		t.Errorf("code = %q, want %q", got.code, codeInternal)
	}
	if got.message == "" {
		t.Error("message is empty")
	}
}

func TestAPIErrorReportsItsMessage(t *testing.T) {
	const message = "field \"b\" is required"

	if got := newAPIError(http.StatusBadRequest, codeMissingField, message, "b").Error(); got != message {
		t.Errorf("Error() = %q, want %q", got, message)
	}
}

func TestAllowedOriginIsConfigurable(t *testing.T) {
	const origin = "http://localhost:5173"

	req := httptest.NewRequest(http.MethodPost, "/api/v1/add", strings.NewReader(`{"a":1,"b":2}`))
	rec := httptest.NewRecorder()
	NewRouter(origin).ServeHTTP(rec, req)

	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != origin {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, origin)
	}
}
