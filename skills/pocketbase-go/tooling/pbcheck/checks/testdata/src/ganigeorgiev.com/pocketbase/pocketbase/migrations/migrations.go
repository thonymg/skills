package migrations

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func Register(up func(app core.App) error, down func(app core.App) error, optFilename ...string) {}
