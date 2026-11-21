package dbx

type Params map[string]any
type Expression interface{}
type Query struct{}

func (q *Query) Execute() error { return nil }

type Builder interface{ NewQuery(sql string) *Query }

func NewExp(e string, params ...Params) Expression { return nil }
