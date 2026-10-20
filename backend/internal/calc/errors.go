package calc

import "errors"

var (
	ErrDivisionByZero  = errors.New("division by zero")
	ErrNegativeSqrt    = errors.New("square root of a negative number")
	ErrNonFiniteResult = errors.New("result is not a finite number")
)
