package migrations

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	m "ganigeorgiev.com/pocketbase/pocketbase/migrations"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		posts := core.NewBaseCollection("posts")
		posts.ListRule = types.Pointer("owner = @request.auth.id")
		posts.ViewRule = types.Pointer("owner = @request.auth.id")
		posts.CreateRule = types.Pointer("@request.auth.id != '' && owner = @request.auth.id")
		posts.UpdateRule = types.Pointer("owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)")
		posts.DeleteRule = types.Pointer("owner = @request.auth.id")
		posts.Fields.Add(&core.TextField{Name: "title", Required: true})
		posts.Fields.Add(&core.RelationField{Name: "owner", CollectionId: users.Id, Required: true, MaxSelect: 1})
		return app.Save(posts)
	}, func(app core.App) error {
		posts, err := app.FindCollectionByNameOrId("posts")
		if err != nil {
			return err
		}
		return app.Delete(posts)
	})
}
