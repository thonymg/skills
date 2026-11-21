package migratecmd

import "ganigeorgiev.com/pocketbase/pocketbase/core"

type Config struct {
	Dir         string
	Automigrate bool
}

func MustRegister(app core.App, rootCmd any, config Config) {}
