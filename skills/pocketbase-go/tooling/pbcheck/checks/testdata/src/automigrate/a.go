package automigrate

import (
	"os"
	"strings"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/plugins/migratecmd"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/osutils"
)

func setup(app core.App) {
	migratecmd.MustRegister(app, nil, migratecmd.Config{Automigrate: osutils.IsProbablyGoRun()})
	migratecmd.MustRegister(app, nil, migratecmd.Config{Automigrate: true}) // want `hard-coded to true`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())                  // want `hand-rolled`
	_ = isGoRun
}
