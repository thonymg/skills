package apis

import (
	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
)

func RequireAuth(optCollectionNames ...string) *hook.Handler[*core.RequestEvent] { return nil }
func RequireSuperuserAuth() *hook.Handler[*core.RequestEvent]                    { return nil }
