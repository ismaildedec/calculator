package calc

import (
	"encoding/json"
	"errors"
	"math"
	"testing"
)

// Comparisons are exact, not approximate: a tolerance would hide the float64 rounding
// that several of these cases exist to document.
func TestBinaryOperations(t *testing.T) {
	negativeZero := math.Copysign(0, -1)

	tests := []struct {
		name    string
		op      func(a, b float64) (float64, error)
		a, b    float64
		want    float64
		wantErr error
	}{
		{name: "add positive operands", op: Add, a: 2, b: 3, want: 5},
		{name: "add negative operands", op: Add, a: -2, b: -3, want: -5},
		{name: "add zero", op: Add, a: 5, b: 0, want: 5},
		{name: "add exposes float64 rounding", op: Add, a: 0.1, b: 0.2, want: 0.30000000000000004},
		{name: "add overflows to infinity", op: Add, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFiniteResult},

		{name: "subtract to positive", op: Subtract, a: 5, b: 3, want: 2},
		{name: "subtract to negative", op: Subtract, a: 3, b: 5, want: -2},
		{name: "subtract exposes float64 rounding", op: Subtract, a: 0.3, b: 0.1, want: 0.19999999999999998},
		{name: "subtract overflows to infinity", op: Subtract, a: -math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFiniteResult},

		{name: "multiply positive operands", op: Multiply, a: 4, b: 3, want: 12},
		{name: "multiply by negative", op: Multiply, a: -4, b: 3, want: -12},
		{name: "multiply by zero", op: Multiply, a: 5, b: 0, want: 0},
		{name: "multiply exposes float64 rounding", op: Multiply, a: 4.35, b: 100, want: 434.99999999999994},
		{name: "multiply overflows to infinity", op: Multiply, a: math.MaxFloat64, b: 2, wantErr: ErrNonFiniteResult},

		{name: "divide evenly", op: Divide, a: 10, b: 4, want: 2.5},
		{name: "divide by negative", op: Divide, a: -10, b: 4, want: -2.5},
		{name: "divide by zero is rejected", op: Divide, a: 10, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide zero by zero is rejected", op: Divide, a: 0, b: 0, wantErr: ErrDivisionByZero},
		{name: "divide by negative zero is rejected", op: Divide, a: 1, b: negativeZero, wantErr: ErrDivisionByZero},
		{name: "divide overflows to infinity", op: Divide, a: math.MaxFloat64, b: 0.5, wantErr: ErrNonFiniteResult},

		{name: "power of integer exponent", op: Power, a: 2, b: 10, want: 1024},
		{name: "power of negative exponent", op: Power, a: 2, b: -2, want: 0.25},
		{name: "power of zero exponent", op: Power, a: 7, b: 0, want: 1},
		{name: "power defines zero to the zero as one", op: Power, a: 0, b: 0, want: 1},
		{name: "power of fractional exponent", op: Power, a: 9, b: 0.5, want: 3},
		{name: "power overflows to infinity", op: Power, a: 10, b: 400, wantErr: ErrNonFiniteResult},
		{name: "power of negative base with fractional exponent is undefined", op: Power, a: -8, b: 0.5, wantErr: ErrNonFiniteResult},

		{name: "percentage of a whole", op: Percentage, a: 200, b: 15, want: 30},
		{name: "percentage of a negative whole", op: Percentage, a: -200, b: 15, want: -30},
		{name: "percentage by a negative rate", op: Percentage, a: 200, b: -15, want: -30},
		{name: "percentage of zero", op: Percentage, a: 0, b: 50, want: 0},
		{name: "zero percent", op: Percentage, a: 200, b: 0, want: 0},
		{name: "a whole hundred percent", op: Percentage, a: 42, b: 100, want: 42},
		{name: "percentage exposes float64 rounding", op: Percentage, a: 7, b: 3, want: 0.21},
		// Both fail if the product is taken before the division.
		{name: "percentage survives an intermediate overflow", op: Percentage, a: 1e300, b: 1e10, want: 1e308},
		{name: "a hundred percent of the largest float64", op: Percentage, a: math.MaxFloat64, b: 100, want: math.MaxFloat64},
		{name: "percentage overflows the range", op: Percentage, a: math.MaxFloat64, b: math.MaxFloat64, wantErr: ErrNonFiniteResult},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.op(tt.a, tt.b)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil {
				if got != 0 {
					t.Errorf("result = %v, want 0 alongside an error", got)
				}
				return
			}
			if got != tt.want {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestSqrt(t *testing.T) {
	tests := []struct {
		name    string
		a       float64
		want    float64
		wantErr error
	}{
		{name: "square root of a perfect square", a: 9, want: 3},
		{name: "square root of zero", a: 0, want: 0},
		{name: "square root of negative zero is allowed", a: math.Copysign(0, -1), want: 0},
		{name: "square root of a non-square", a: 2, want: 1.4142135623730951},
		{name: "square root of a negative number is rejected", a: -4, wantErr: ErrNegativeSqrt},
		{name: "square root of the largest float64", a: math.MaxFloat64, want: 1.3407807929942596e+154},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Sqrt(tt.a)

			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want %v", err, tt.wantErr)
			}
			if tt.wantErr != nil {
				if got != 0 {
					t.Errorf("result = %v, want 0 alongside an error", got)
				}
				return
			}
			if got != tt.want {
				t.Errorf("result = %v, want %v", got, tt.want)
			}
		})
	}
}

// Checks the sign bit rather than equality, since -0 == 0 would pass either way.
func TestResultsNeverCarryNegativeZero(t *testing.T) {
	negativeZero := math.Copysign(0, -1)

	tests := []struct {
		name string
		run  func() (float64, error)
	}{
		{name: "multiply a negative by zero", run: func() (float64, error) { return Multiply(-1, 0) }},
		{name: "multiply by negative zero", run: func() (float64, error) { return Multiply(1, negativeZero) }},
		{name: "add two negative zeros", run: func() (float64, error) { return Add(negativeZero, negativeZero) }},
		{name: "divide negative zero", run: func() (float64, error) { return Divide(negativeZero, 5) }},
		{name: "square root of negative zero", run: func() (float64, error) { return Sqrt(negativeZero) }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.run()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if math.Signbit(got) {
				t.Errorf("result carries the sign bit, want positive zero")
			}
		})
	}
}

func TestJSONRejectsNonFiniteFloats(t *testing.T) {
	for _, v := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		if _, err := json.Marshal(v); err == nil {
			t.Errorf("encoding/json accepted %v, expected it to be rejected", v)
		}
	}
}

func TestResultsAreAlwaysMarshalable(t *testing.T) {
	operands := []float64{
		0, math.Copysign(0, -1), 1, -1, 0.5, -0.5, 2, -2,
		1e308, -1e308, math.MaxFloat64, -math.MaxFloat64,
		math.SmallestNonzeroFloat64, 400, -400,
	}

	binary := map[string]func(a, b float64) (float64, error){
		"Add":        Add,
		"Subtract":   Subtract,
		"Multiply":   Multiply,
		"Divide":     Divide,
		"Power":      Power,
		"Percentage": Percentage,
	}

	for name, op := range binary {
		for _, a := range operands {
			for _, b := range operands {
				got, err := op(a, b)
				if err != nil {
					continue
				}
				if _, err := json.Marshal(got); err != nil {
					t.Errorf("%s(%v, %v) = %v, which cannot be marshalled: %v", name, a, b, got, err)
				}
			}
		}
	}

	for _, a := range operands {
		got, err := Sqrt(a)
		if err != nil {
			continue
		}
		if _, err := json.Marshal(got); err != nil {
			t.Errorf("Sqrt(%v) = %v, which cannot be marshalled: %v", a, got, err)
		}
	}
}
