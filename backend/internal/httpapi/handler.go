package httpapi

import "net/http"

// Decode, compute, write is the same sequence for every operation; the two shapes differ
// only in how many operands they read.
func binary(name string, operate func(a, b float64) (float64, error)) operation {
	return operation{
		name: name,
		handler: func(w http.ResponseWriter, r *http.Request) {
			a, b, err := decodeBinary(r)
			if err != nil {
				writeError(w, err)
				return
			}
			result, err := operate(a, b)
			if err != nil {
				writeError(w, err)
				return
			}
			writeResult(w, name, result)
		},
	}
}

func unary(name string, operate func(a float64) (float64, error)) operation {
	return operation{
		name: name,
		handler: func(w http.ResponseWriter, r *http.Request) {
			a, err := decodeUnary(r)
			if err != nil {
				writeError(w, err)
				return
			}
			result, err := operate(a)
			if err != nil {
				writeError(w, err)
				return
			}
			writeResult(w, name, result)
		},
	}
}

func handleMethodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", http.MethodPost)
	writeError(w, newAPIError(http.StatusMethodNotAllowed, codeMethodNotAllowed, "this endpoint only accepts POST", ""))
}

func handleNotFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, newAPIError(http.StatusNotFound, codeNotFound, "unknown endpoint", ""))
}
