package migratedown

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	m "ganigeorgiev.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error { return nil }, func(app core.App) error { return nil })
	m.Register(func(app core.App) error { return nil }, nil) // want `no down function`
	core.AppMigrations.Register(func(txApp core.App) error { return nil }, nil) // want `no down function`
}
