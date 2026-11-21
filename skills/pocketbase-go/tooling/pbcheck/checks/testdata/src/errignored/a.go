package errignored

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func good(app core.App, r *core.Record) error {
	if err := app.Save(r); err != nil {
		return err
	}
	return app.Delete(r)
}

func bad(app core.App, r *core.Record, e *core.RequestEvent) {
	app.Save(r)         // want `error returned by Save is discarded`
	_ = app.Delete(r)   // want `error returned by Delete is discarded`
	e.JSON(200, "ok")   // want `error returned by JSON is discarded`
	_, _ = app.FindFirstRecordByFilter("posts", "id != ''") // want `error returned by FindFirstRecordByFilter is discarded`
}
