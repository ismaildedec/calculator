package httpapi

import "net/http"

func NewRouter(allowedOrigin string) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/add", handleAdd)
	mux.HandleFunc("POST /api/v1/subtract", handleSubtract)
	mux.HandleFunc("POST /api/v1/multiply", handleMultiply)
	mux.HandleFunc("POST /api/v1/divide", handleDivide)
	mux.HandleFunc("POST /api/v1/power", handlePower)
	mux.HandleFunc("POST /api/v1/sqrt", handleSqrt)

	// The patterns above match POST only. Without these the mux would answer any other
	// method with its own plain-text 405, breaking the JSON error contract.
	for _, op := range []string{"add", "subtract", "multiply", "divide", "power", "sqrt"} {
		mux.HandleFunc("/api/v1/"+op, handleMethodNotAllowed)
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
