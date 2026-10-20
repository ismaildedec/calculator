package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/ismaildedec/calculator/backend/internal/httpapi"
)

func main() {
	addr := ":" + env("PORT", "8080")
	allowedOrigin := env("ALLOWED_ORIGIN", "*")

	srv := &http.Server{
		Addr:              addr,
		Handler:           httpapi.NewRouter(allowedOrigin),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}

	log.Printf("calculator api listening on %s, allowed origin %q", addr, allowedOrigin)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
