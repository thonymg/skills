package mailer

import "net/mail"

type Message struct {
	From    mail.Address
	Subject string
}
