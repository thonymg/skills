package main

import (
	"log"

	"ganigeorgiev.com/pocketbase/pocketbase"
	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/plugins/migratecmd"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/osutils"

	_ "pbapp/migrations"
)

func main() {
	app := pocketbase.New()
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: osutils.IsProbablyGoRun()})

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.GET("/api/pbapp/me", func(e *core.RequestEvent) error {
			return e.JSON(200, map[string]any{"id": e.Auth.Id})
		}).Bind(apis.RequireAuth())
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
