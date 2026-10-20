package main

import "testing"

func TestEnvUsesFallbackUnlessSet(t *testing.T) {
	const key = "CALCULATOR_TEST_VALUE"

	if got := env(key, "fallback"); got != "fallback" {
		t.Errorf("unset: env() = %q, want %q", got, "fallback")
	}

	t.Setenv(key, "configured")
	if got := env(key, "fallback"); got != "configured" {
		t.Errorf("set: env() = %q, want %q", got, "configured")
	}

	t.Setenv(key, "")
	if got := env(key, "fallback"); got != "fallback" {
		t.Errorf("set to empty: env() = %q, want %q", got, "fallback")
	}
}
