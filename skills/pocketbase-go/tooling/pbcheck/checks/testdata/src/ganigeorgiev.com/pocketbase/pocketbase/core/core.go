package core

import (
	"github.com/pocketbase/dbx"

	"ganigeorgiev.com/pocketbase/pocketbase/tools/cron"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/filesystem"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/hook"
	"ganigeorgiev.com/pocketbase/pocketbase/tools/router"
)

type Model interface{}
type Record struct{}
type MetaConfig struct{ SenderAddress string }
type Settings struct{ Meta MetaConfig }

type App interface {
	Save(m Model) error
	Delete(m Model) error
	RunInTransaction(fn func(txApp App) error) error
	FindFirstRecordByFilter(collection any, filter string, params ...dbx.Params) (*Record, error)
	FindRecordsByFilter(collection any, filter string, sort string, limit int, offset int, params ...dbx.Params) ([]*Record, error)
	NewFilesystem() (*filesystem.System, error)
	NewBackupsFilesystem() (*filesystem.System, error)
	Cron() *cron.Cron
	Settings() *Settings
	DB() dbx.Builder
	OnServe() *hook.Hook[*ServeEvent]
	OnRecordCreate(tags ...string) *hook.TaggedHook[*RecordEvent]
	Start() error
}

type BaseApp struct{ App }

type RequestEvent struct{ App App }

func (e *RequestEvent) Next() error                     { return nil }
func (e *RequestEvent) JSON(status int, data any) error { return nil }

type ServeEvent struct {
	App    App
	Router *router.Router[*RequestEvent]
}

func (e *ServeEvent) Next() error { return nil }

type RecordEvent struct {
	App    App
	Record *Record
}

func (e *RecordEvent) Next() error { return nil }

type MigrationsList struct{}

func (l *MigrationsList) Register(up func(txApp App) error, down func(txApp App) error, optFilename ...string) {}

var AppMigrations MigrationsList
