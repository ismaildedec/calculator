package httpapi

import (
	"net/http"

	"github.com/ismaildedec/calculator/backend/internal/calc"
)

type operation struct {
	name    string
	handler http.HandlerFunc
}

// One list drives both registrations each operation needs, so an operation cannot end up
// in the POST routes without its method fallback.
var operations = []operation{
	binary("add", calc.Add),
	binary("subtract", calc.Subtract),
	binary("multiply", calc.Multiply),
	binary("divide", calc.Divide),
	binary("power", calc.Power),
	binary("percentage", calc.Percentage),
	unary("sqrt", calc.Sqrt),
}

func NewRouter(allowedOrigin string) http.Handler {
	mux := http.NewServeMux()

	for _, op := range operations {
		mux.HandleFunc("POST /api/v1/"+op.name, op.handler)

		// The pattern above matches POST only; without this one the mux answers every other
		// method with its own plain-text 405.
		mux.HandleFunc("/api/v1/"+op.name, handleMethodNotAllowed)
	}

	mux.HandleFunc("/", handleNotFound)

	return withCORS(mux, allowedOrigin)
}

// Development runs the frontend and the backend on different ports, so the browser needs
// these headers. Under Docker nginx proxies both from one origin and they are unused.
func withCORS(next http.Handler, allowedOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
