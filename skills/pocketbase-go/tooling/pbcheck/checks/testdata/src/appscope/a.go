package appscope

import (
	"ganigeorgiev.com/pocketbase/pocketbase"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

func main() {
	app := pocketbase.New()
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/myapp/x", func(e *core.RequestEvent) error {
			_, err := e.App.FindFirstRecordByFilter("posts", "id != ''")
			return err
		})
		app.Settings() // want `captured app used in a handler: use e.App`
		return se.Next()
	})
	app.OnRecordCreate().BindFunc(func(e *core.RecordEvent) error {
		return e.App.RunInTransaction(func(txApp core.App) error {
			if err := txApp.Save(e.Record); err != nil {
				return err
			}
			return app.Save(e.Record) // want `used inside RunInTransaction: use the txApp argument`
		})
	})
}
