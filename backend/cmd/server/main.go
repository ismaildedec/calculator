package main

import (
	"log"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/ismaildedec/calculator/backend/internal/httpapi"
)

func main() {
	addr := ":" + env("PORT", "8080")
	allowedOrigin := env("ALLOWED_ORIGIN", "*")

	srv := &http.Server{
		Handler:           httpapi.NewRouter(allowedOrigin),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	// Bind before logging, so a failed bind cannot be preceded by a line claiming success.
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("calculator api listening on %s, allowed origin %q", addr, allowedOrigin)
	if err := srv.Serve(listener); err != nil {
		log.Fatal(err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
