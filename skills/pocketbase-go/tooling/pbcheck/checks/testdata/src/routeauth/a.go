package routeauth

import (
	"ganigeorgiev.com/pocketbase/pocketbase/apis"
	"ganigeorgiev.com/pocketbase/pocketbase/core"
)

func routes(se *core.ServeEvent, h func(*core.RequestEvent) error) {
	se.Router.GET("/api/myapp/me", h).Bind(apis.RequireAuth())
	g := se.Router.Group("/api/myapp/admin")
	g.Bind(apis.RequireSuperuserAuth())
	g.DELETE("/cache", h)
	se.Router.GET("/api/myapp/public", h) // want `no apis.Require\* middleware`
}
