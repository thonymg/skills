package hook

type Handler[T any] struct {
	Func     func(T) error
	Id       string
	Priority int
}
type Hook[T any] struct{}

func (h *Hook[T]) BindFunc(fn func(e T) error) string { return "" }
func (h *Hook[T]) Bind(handler *Handler[T]) string    { return "" }

type TaggedHook[T any] struct{}

func (h *TaggedHook[T]) BindFunc(fn func(e T) error) string { return "" }
func (h *TaggedHook[T]) Bind(handler *Handler[T]) string    { return "" }
