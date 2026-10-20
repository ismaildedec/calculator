// Package calc implements the calculator's arithmetic as pure functions.
//
// Operations return an error instead of a non-finite float64: encoding/json rejects NaN
// and the infinities, which would corrupt a response whose status code is already written.
package calc

import "math"

func Add(a, b float64) (float64, error) {
	return finite(a + b)
}

func Subtract(a, b float64) (float64, error) {
	return finite(a - b)
}

func Multiply(a, b float64) (float64, error) {
	return finite(a * b)
}

func Divide(a, b float64) (float64, error) {
	if b == 0 {
		return 0, ErrDivisionByZero
	}
	return finite(a / b)
}

func Power(a, b float64) (float64, error) {
	return finite(math.Pow(a, b))
}

func Sqrt(a float64) (float64, error) {
	if a < 0 {
		return 0, ErrNegativeSqrt
	}
	return finite(math.Sqrt(a))
}

func finite(v float64) (float64, error) {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, ErrNonFiniteResult
	}
	if v == 0 {
		return 0, nil // not redundant: collapses negative zero, which serialises as -0
	}
	return v, nil
}
