package routepath

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func routes(se *core.ServeEvent, h func(*core.RequestEvent) error) {
	se.Router.GET("/api/myapp/posts/{id}", h)
	g := se.Router.Group("/api/myapp")
	g.POST("/items/{id}/archive", h)
	se.Router.GET("/api/myapp/posts/:id", h)        // want `uses :param`
	se.Router.GET("/api/collections/posts/stats", h) // want `system /api/ path`
	se.Router.Group("/api/files")                   // want `system /api/ path`
}
