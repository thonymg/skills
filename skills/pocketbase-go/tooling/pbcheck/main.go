// pbcheck runs the pocketbase-go analyzers (see checks/) as one multichecker.
// Usage: pbcheck -json ./...
package main

import (
	"golang.org/x/tools/go/analysis/multichecker"

	"pbcheck/checks"
)

func main() { multichecker.Main(checks.All...) }
