package settingscache

import "ganigeorgiev.com/pocketbase/pocketbase/core"

var cached *core.Settings

func good(app core.App) string { return app.Settings().Meta.SenderAddress }

func bad(app core.App) {
	cached = app.Settings() // want `settings cached in package variable cached`
	local := app.Settings()
	_ = local
}
