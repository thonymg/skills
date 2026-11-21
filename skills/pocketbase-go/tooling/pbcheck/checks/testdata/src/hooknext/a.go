package hooknext

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
)

func good(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error { return se.Next() })
	app.OnRecordCreate("posts").BindFunc(func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return nil
	})
	app.OnRecordCreate().BindFunc(named)
}

func named(e *core.RecordEvent) error { return e.Next() }

func bad(app core.App) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error { return nil })      // want `never calls e.Next\(\)`
	app.OnRecordCreate().BindFunc(func(_ *core.RecordEvent) error { return nil }) // want `ignores its event`
	app.OnRecordCreate().BindFunc(func(e *core.RecordEvent) error {
		e.Next() // want `discarded`
		return nil
	})
	app.OnRecordCreate().Bind(&hook.Handler[*core.RecordEvent]{Id: "x", Func: func(e *core.RecordEvent) error { return nil }}) // want `never calls e.Next\(\)`
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.BindFunc(func(e *core.RequestEvent) error { return nil }) // want `never calls e.Next\(\)`
		return se.Next()
	})
}
