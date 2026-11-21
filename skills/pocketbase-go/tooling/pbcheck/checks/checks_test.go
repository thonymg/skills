package checks

import (
	"testing"

	"golang.org/x/tools/go/analysis/analysistest"
)

// Each testdata/src/<analyzer> package holds good code (no diagnostic) and bad
// code annotated with `// want`. A rule without both fails here.
func TestAnalyzers(t *testing.T) {
	for _, a := range All {
		t.Run(a.Name, func(t *testing.T) {
			analysistest.Run(t, analysistest.TestData(), a, a.Name)
		})
	}
}
