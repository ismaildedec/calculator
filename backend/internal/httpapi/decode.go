package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const unknownFieldPrefix = "json: unknown field "

// Operands are pointers so that an absent field is distinguishable from a zero one.
type binaryRequest struct {
	A *float64 `json:"a"`
	B *float64 `json:"b"`
}

type unaryRequest struct {
	A *float64 `json:"a"`
}

func decodeBinary(r *http.Request) (float64, float64, error) {
	var req binaryRequest
	if err := decodeBody(r, &req); err != nil {
		return 0, 0, err
	}

	a, err := operand(req.A, "a")
	if err != nil {
		return 0, 0, err
	}
	b, err := operand(req.B, "b")
	if err != nil {
		return 0, 0, err
	}
	return a, b, nil
}

func decodeUnary(r *http.Request) (float64, error) {
	var req unaryRequest
	if err := decodeBody(r, &req); err != nil {
		return 0, err
	}
	return operand(req.A, "a")
}

func decodeBody(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return decodeError(err)
	}

	// Decode stops after the first JSON value, so anything following it would otherwise
	// be accepted and ignored.
	if dec.More() {
		return newAPIError(http.StatusBadRequest, codeInvalidJSON, "unexpected content after the JSON object", "")
	}
	return nil
}

func operand(v *float64, name string) (float64, error) {
	if v == nil {
		return 0, newAPIError(http.StatusBadRequest, codeMissingField, fmt.Sprintf("field %q is required", name), name)
	}
	return *v, nil
}

func decodeError(err error) error {
	var typeErr *json.UnmarshalTypeError

	switch {
	case errors.Is(err, io.EOF):
		return newAPIError(http.StatusBadRequest, codeInvalidJSON, "request body is empty", "")

	case errors.As(err, &typeErr):
		if typeErr.Field == "" {
			return newAPIError(http.StatusBadRequest, codeInvalidJSON, "request body must be a JSON object", "")
		}
		return newAPIError(http.StatusBadRequest, codeInvalidNumber, fmt.Sprintf("field %q must be a number", typeErr.Field), typeErr.Field)

	// encoding/json reports an unknown field as an untyped error, so the field name can
	// only be recovered from the message text.
	case strings.HasPrefix(err.Error(), unknownFieldPrefix):
		field := strings.Trim(strings.TrimPrefix(err.Error(), unknownFieldPrefix), `"`)
		return newAPIError(http.StatusBadRequest, codeUnknownField, fmt.Sprintf("unknown field %q", field), field)

	default:
		return newAPIError(http.StatusBadRequest, codeInvalidJSON, "request body is not valid JSON", "")
	}
}
