package mailersender

import (
	"net/mail"

	"ganigeorgiev.com/pocketbase/pocketbase/core"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/mailer"
)

func build(app core.App) []*mailer.Message {
	return []*mailer.Message{
		{From: mail.Address{Address: app.Settings().Meta.SenderAddress}},
		{From: mail.Address{Address: "no-reply@example.com"}}, // want `hard-coded sender`
	}
}
