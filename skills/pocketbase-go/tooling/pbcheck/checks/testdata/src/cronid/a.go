package cronid

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func jobs(app core.App, name string) {
	app.Cron().MustAdd("cleanupDrafts", "0 3 * * *", func() {})
	app.Cron().MustAdd("__pbMine__", "* * * * *", func() {}) // want `reserved __pb prefix`
	app.Cron().MustAdd("job-"+name, "* * * * *", func() {}) // want `computed at runtime`
}
