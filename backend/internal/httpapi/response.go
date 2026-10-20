package httpapi

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/ismaildedec/calculator/backend/internal/calc"
)

const (
	codeInvalidJSON      = "INVALID_JSON"
	codeInvalidNumber    = "INVALID_NUMBER"
	codeMissingField     = "MISSING_FIELD"
	codeUnknownField     = "UNKNOWN_FIELD"
	codeDivisionByZero   = "DIVISION_BY_ZERO"
	codeNegativeSqrt     = "NEGATIVE_SQRT"
	codeNonFiniteResult  = "NON_FINITE_RESULT"
	codeMethodNotAllowed = "METHOD_NOT_ALLOWED"
	codeNotFound         = "NOT_FOUND"
	codeInternal         = "INTERNAL"
)

type successResponse struct {
	Operation string  `json:"operation"`
	Result    float64 `json:"result"`
}

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Field   string `json:"field,omitempty"`
}

type apiError struct {
	status  int
	code    string
	message string
	field   string
}

func newAPIError(status int, code, message, field string) *apiError {
	return &apiError{status: status, code: code, message: message, field: field}
}

func (e *apiError) Error() string { return e.message }

func writeResult(w http.ResponseWriter, operation string, result float64) {
	writeJSON(w, http.StatusOK, successResponse{Operation: operation, Result: result})
}

func writeError(w http.ResponseWriter, err error) {
	e := asAPIError(err)
	writeJSON(w, e.status, errorResponse{Error: errorDetail{Code: e.code, Message: e.message, Field: e.field}})
}

func asAPIError(err error) *apiError {
	var apiErr *apiError
	if errors.As(err, &apiErr) {
		return apiErr
	}

	switch {
	case errors.Is(err, calc.ErrDivisionByZero):
		return newAPIError(http.StatusBadRequest, codeDivisionByZero, "division by zero is not allowed", "b")
	case errors.Is(err, calc.ErrNegativeSqrt):
		return newAPIError(http.StatusBadRequest, codeNegativeSqrt, "the square root of a negative number is not defined", "a")
	case errors.Is(err, calc.ErrNonFiniteResult):
		return newAPIError(http.StatusUnprocessableEntity, codeNonFiniteResult, "the result cannot be represented as a finite number", "")
	}

	return newAPIError(http.StatusInternalServerError, codeInternal, "unexpected server error", "")
}

// Encoding happens before the status code is written, so a failure here can still be
// reported as one.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("httpapi: encoding a %d response failed: %v", status, err)
		status, body = http.StatusInternalServerError, []byte(`{"error":{"code":"INTERNAL","message":"unexpected server error"}}`)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(body)
}
