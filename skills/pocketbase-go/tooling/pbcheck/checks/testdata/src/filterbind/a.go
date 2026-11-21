package filterbind

import (
	"fmt"

	"github.com/pocketbase/dbx"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

const byStatus = "status = {:status}"

func good(app core.App, s string) {
	app.FindFirstRecordByFilter("posts", "status = {:status}", dbx.Params{"status": s})
	app.FindRecordsByFilter("posts", byStatus, "-created", 10, 0, dbx.Params{"status": s})
	dbx.NewExp("a = {:a}", dbx.Params{"a": s})
}

func bad(app core.App, s string) {
	app.FindFirstRecordByFilter("posts", "status = '"+s+"'")                  // want `built at runtime`
	app.FindRecordsByFilter("posts", fmt.Sprintf("title ~ '%s'", s), "", 1, 0) // want `built at runtime`
	app.DB().NewQuery("SELECT * FROM posts WHERE id = '" + s + "'")           // want `built at runtime`
}
