package router

import "ganigeorgiev.com/pocketbase/pocketbase/tools/hook"

type Route[T any] struct{}

func (r *Route[T]) Bind(middlewares ...*hook.Handler[T]) *Route[T] { return r }
func (r *Route[T]) BindFunc(fn func(e T) error) *Route[T]         { return r }

type RouterGroup[T any] struct{}

func (g *RouterGroup[T]) Group(prefix string) *RouterGroup[T]                   { return g }
func (g *RouterGroup[T]) Bind(middlewares ...*hook.Handler[T]) *RouterGroup[T] { return g }
func (g *RouterGroup[T]) BindFunc(fn func(e T) error) *RouterGroup[T]          { return g }
func (g *RouterGroup[T]) GET(path string, action func(e T) error) *Route[T]    { return nil }
func (g *RouterGroup[T]) POST(path string, action func(e T) error) *Route[T]   { return nil }
func (g *RouterGroup[T]) DELETE(path string, action func(e T) error) *Route[T] { return nil }

type Router[T any] struct{ *RouterGroup[T] }
