package httpapi

import (
	"net/http"

	"github.com/ismaildedec/calculator/backend/internal/calc"
)

func handleAdd(w http.ResponseWriter, r *http.Request) {
	a, b, err := decodeBinary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Add(a, b)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "add", result)
}

func handleSubtract(w http.ResponseWriter, r *http.Request) {
	a, b, err := decodeBinary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Subtract(a, b)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "subtract", result)
}

func handleMultiply(w http.ResponseWriter, r *http.Request) {
	a, b, err := decodeBinary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Multiply(a, b)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "multiply", result)
}

func handleDivide(w http.ResponseWriter, r *http.Request) {
	a, b, err := decodeBinary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Divide(a, b)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "divide", result)
}

func handlePower(w http.ResponseWriter, r *http.Request) {
	a, b, err := decodeBinary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Power(a, b)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "power", result)
}

func handleSqrt(w http.ResponseWriter, r *http.Request) {
	a, err := decodeUnary(r)
	if err != nil {
		writeError(w, err)
		return
	}
	result, err := calc.Sqrt(a)
	if err != nil {
		writeError(w, err)
		return
	}
	writeResult(w, "sqrt", result)
}

func handleMethodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", http.MethodPost)
	writeError(w, newAPIError(http.StatusMethodNotAllowed, codeMethodNotAllowed, "this endpoint only accepts POST", ""))
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, newAPIError(http.StatusNotFound, codeNotFound, "unknown endpoint", ""))
}
