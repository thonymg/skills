// Package checks holds the pocketbase-go analyzers. Each one mechanizes a rule
// from the PocketBase docs or a verified community rule; packages are
// matched by path suffix so github.com (<= v0.40) and ganigeorgiev.com
// (>= v0.41) module paths are both covered.
//
// Class (used by pbg): every analyzer is a gate except those listed in Review.
package checks

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"regexp"
	"strings"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/analysis/passes/inspect"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

// All analyzers, in catalog order.
var All = []*analysis.Analyzer{
	HookNext, AppScope, FilterBind, RoutePath, FSClose, MigrateDown,
	AutoMigrate, CronID, ErrIgnored, MailerSender, SettingsCache, RouteAuth,
}

// Review lists analyzers whose findings are reported but never block.
var Review = map[string]bool{"routeauth": true}

// ── helpers ──────────────────────────────────────────────────────────────────

// pkgIs reports whether p is pocketbase/pocketbase[/sub] on any host.
func pkgIs(p *types.Package, sub string) bool {
	if p == nil {
		return false
	}
	want := "pocketbase/pocketbase"
	if sub != "" {
		want += "/" + sub
	}
	return p.Path() == want || strings.HasSuffix(p.Path(), "/"+want)
}

func inPocketBase(p *types.Package) bool {
	return p != nil && (strings.Contains(p.Path(), "pocketbase/pocketbase") || strings.HasSuffix(p.Path(), "pocketbase/dbx"))
}

func callee(info *types.Info, call *ast.CallExpr) *types.Func {
	f, _ := typeutil.Callee(info, call).(*types.Func)
	return f
}

func deref(t types.Type) types.Type {
	if p, ok := t.(*types.Pointer); ok {
		return p.Elem()
	}
	return t
}

// isAppType: core.App, *core.BaseApp or *pocketbase.PocketBase.
func isAppType(t types.Type) bool {
	n, ok := deref(t).(*types.Named)
	if !ok {
		return false
	}
	o := n.Obj()
	return (o.Name() == "App" || o.Name() == "BaseApp") && pkgIs(o.Pkg(), "core") ||
		o.Name() == "PocketBase" && pkgIs(o.Pkg(), "")
}

// eventParam returns the first parameter of fn when it is a *core.<Event> that
// carries an App field (hook and route handlers), else nil.
func eventParam(info *types.Info, fn *ast.FuncType) *types.Var {
	if fn.Params == nil || len(fn.Params.List) == 0 || len(fn.Params.List[0].Names) == 0 {
		return nil
	}
	v, _ := info.Defs[fn.Params.List[0].Names[0]].(*types.Var)
	if v == nil {
		return nil
	}
	n, ok := deref(v.Type()).(*types.Named)
	if !ok || !pkgIs(n.Obj().Pkg(), "core") {
		return nil
	}
	if st, ok := n.Underlying().(*types.Struct); ok {
		for i := 0; i < st.NumFields(); i++ {
			if f := st.Field(i); f.Name() == "App" || (f.Embedded() && hasAppField(f.Type())) {
				return v
			}
		}
	}
	return nil
}

func hasAppField(t types.Type) bool {
	st, ok := deref(t).Underlying().(*types.Struct)
	if !ok {
		return false
	}
	for i := 0; i < st.NumFields(); i++ {
		if f := st.Field(i); f.Name() == "App" || (f.Embedded() && hasAppField(f.Type())) {
			return true
		}
	}
	return false
}

func constString(info *types.Info, e ast.Expr) (string, bool) {
	tv, ok := info.Types[e]
	if !ok || tv.Value == nil || tv.Value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(tv.Value), true
}

func isNil(info *types.Info, e ast.Expr) bool {
	tv, ok := info.Types[e]
	return ok && tv.IsNil()
}

func run(pass *analysis.Pass, types []ast.Node, fn func(ast.Node, []ast.Node)) {
	pass.ResultOf[inspect.Analyzer].(*inspector.Inspector).WithStack(types, func(n ast.Node, push bool, stack []ast.Node) bool {
		if push {
			fn(n, stack)
		}
		return true
	})
}

func newAnalyzer(name, doc string, fn func(*analysis.Pass)) *analysis.Analyzer {
	return &analysis.Analyzer{
		Name: name, Doc: doc, Requires: []*analysis.Analyzer{inspect.Analyzer},
		Run: func(pass *analysis.Pass) (any, error) { fn(pass); return nil, nil },
	}
}

// funcBody resolves a handler expression (func literal or same-package func) to its type and body.
func funcBody(pass *analysis.Pass, e ast.Expr) (*ast.FuncType, *ast.BlockStmt) {
	switch h := e.(type) {
	case *ast.FuncLit:
		return h.Type, h.Body
	case *ast.Ident:
		obj := pass.TypesInfo.Uses[h]
		for _, f := range pass.Files {
			for _, d := range f.Decls {
				if fd, ok := d.(*ast.FuncDecl); ok && fd.Recv == nil && pass.TypesInfo.Defs[fd.Name] == obj {
					return fd.Type, fd.Body
				}
			}
		}
	}
	return nil, nil
}

// ── hooknext ─────────────────────────────────────────────────────────────────

var HookNext = newAnalyzer("hooknext",
	"hook and middleware handlers must call e.Next() and propagate its error",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !(pkgIs(fn.Pkg(), "tools/hook") || pkgIs(fn.Pkg(), "tools/router")) {
				return
			}
			var handlers []ast.Expr
			switch fn.Name() {
			case "BindFunc":
				handlers = call.Args
			case "Bind":
				for _, a := range call.Args {
					if u, ok := a.(*ast.UnaryExpr); ok {
						if cl, ok := u.X.(*ast.CompositeLit); ok {
							for _, el := range cl.Elts {
								if kv, ok := el.(*ast.KeyValueExpr); ok && kv.Key.(*ast.Ident).Name == "Func" {
									handlers = append(handlers, kv.Value)
								}
							}
						}
					}
				}
			}
			for _, h := range handlers {
				checkNext(pass, h)
			}
		})
	})

func checkNext(pass *analysis.Pass, h ast.Expr) {
	ft, body := funcBody(pass, h)
	if ft == nil || body == nil {
		return
	}
	if ft.Params == nil || len(ft.Params.List) == 0 || len(ft.Params.List[0].Names) == 0 || ft.Params.List[0].Names[0].Name == "_" {
		pass.Reportf(h.Pos(), "handler ignores its event, so it can never call e.Next(): the hook chain stops here")
		return
	}
	param := pass.TypesInfo.Defs[ft.Params.List[0].Names[0]]
	called := false
	ast.Inspect(body, func(n ast.Node) bool {
		switch s := n.(type) {
		case *ast.ExprStmt:
			if c, ok := s.X.(*ast.CallExpr); ok && isNextCall(pass, c, param) {
				called = true
				pass.Reportf(c.Pos(), "error returned by e.Next() is discarded: return it or check it")
			}
		case *ast.CallExpr:
			if isNextCall(pass, s, param) {
				called = true
			}
		}
		return true
	})
	if !called {
		pass.Reportf(h.Pos(), "handler never calls e.Next(): the remaining handlers (and the default action) are skipped")
	}
}

func isNextCall(pass *analysis.Pass, c *ast.CallExpr, param types.Object) bool {
	sel, ok := c.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "Next" {
		return false
	}
	id, ok := sel.X.(*ast.Ident)
	return ok && pass.TypesInfo.Uses[id] == param
}

// ── appscope ─────────────────────────────────────────────────────────────────

var AppScope = newAnalyzer("appscope",
	"inside RunInTransaction use txApp; inside hook/route handlers use e.App, never a captured app",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.Ident)(nil)}, func(n ast.Node, stack []ast.Node) {
			id := n.(*ast.Ident)
			obj, ok := pass.TypesInfo.Uses[id].(*types.Var)
			if !ok || obj.IsField() || !isAppType(obj.Type()) {
				return
			}
			for i := len(stack) - 2; i >= 0; i-- {
				lit, ok := stack[i].(*ast.FuncLit)
				if !ok {
					continue
				}
				declaredInside := obj.Pos() >= lit.Pos() && obj.Pos() <= lit.End()
				if isTxCallback(pass, lit, stack[:i]) {
					if !declaredInside {
						pass.Reportf(id.Pos(), "%s is used inside RunInTransaction: use the txApp argument (the outer app waits for the write lock held by this transaction)", id.Name)
					}
					return
				}
				if eventParam(pass.TypesInfo, lit.Type) != nil {
					if !declaredInside {
						pass.Reportf(id.Pos(), "captured %s used in a handler: use e.App (the handler may run inside a transaction)", id.Name)
					}
					return
				}
			}
		})
	})

func isTxCallback(pass *analysis.Pass, lit *ast.FuncLit, stack []ast.Node) bool {
	if len(stack) == 0 {
		return false
	}
	call, ok := stack[len(stack)-1].(*ast.CallExpr)
	if !ok {
		return false
	}
	fn := callee(pass.TypesInfo, call)
	return fn != nil && fn.Name() == "RunInTransaction" && pkgIs(fn.Pkg(), "core")
}

// ── filterbind ───────────────────────────────────────────────────────────────

var filterArg = map[string]int{"FindFirstRecordByFilter": 1, "FindRecordsByFilter": 1, "NewExp": 0, "NewQuery": 0}

var FilterBind = newAnalyzer("filterbind",
	"filters and raw SQL are constants with {:placeholders} bound through dbx.Params",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !inPocketBase(fn.Pkg()) {
				return
			}
			i, ok := filterArg[fn.Name()]
			if !ok || len(call.Args) <= i {
				return
			}
			if _, isConst := constString(pass.TypesInfo, call.Args[i]); !isConst {
				pass.Reportf(call.Args[i].Pos(), "%s receives a string built at runtime: use a constant with {:name} placeholders and dbx.Params (injection)", fn.Name())
			}
		})
	})

// ── routepath ────────────────────────────────────────────────────────────────

var (
	colonParam = regexp.MustCompile(`/:[A-Za-z_]`)
	reserved   = regexp.MustCompile(`^/api/(collections|files|realtime|settings|backups|logs|crons|health|batch|oauth2-redirect)(/|$)`)
	routeVerbs = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true, "HEAD": true, "OPTIONS": true, "Any": true, "Route": true, "Group": true}
)

var RoutePath = newAnalyzer("routepath",
	"route paths use {param} (not :param) and never shadow system /api/ routes",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !pkgIs(fn.Pkg(), "tools/router") || !routeVerbs[fn.Name()] || len(call.Args) == 0 {
				return
			}
			arg := call.Args[0]
			if fn.Name() == "Route" && len(call.Args) > 1 {
				arg = call.Args[1]
			}
			p, ok := constString(pass.TypesInfo, arg)
			if !ok {
				return
			}
			if colonParam.MatchString(p) {
				pass.Reportf(arg.Pos(), "route %q uses :param — PocketBase (v0.23+) uses {param}", p)
			}
			if reserved.MatchString(p) {
				pass.Reportf(arg.Pos(), "route %q is under a system /api/ path: namespace it as /api/<yourapp>/…", p)
			}
		})
	})

// ── fsclose ──────────────────────────────────────────────────────────────────

var closers = map[string]bool{"NewFilesystem": true, "NewBackupsFilesystem": true, "GetReader": true}

var FSClose = newAnalyzer("fsclose",
	"filesystems and readers from NewFilesystem/NewBackupsFilesystem/GetReader are closed",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.AssignStmt)(nil)}, func(n ast.Node, stack []ast.Node) {
			as := n.(*ast.AssignStmt)
			if len(as.Rhs) != 1 {
				return
			}
			call, ok := as.Rhs[0].(*ast.CallExpr)
			if !ok {
				return
			}
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !inPocketBase(fn.Pkg()) || !closers[fn.Name()] {
				return
			}
			id, ok := as.Lhs[0].(*ast.Ident)
			if !ok || id.Name == "_" {
				pass.Reportf(call.Pos(), "result of %s is discarded: it holds resources that must be closed", fn.Name())
				return
			}
			obj := pass.TypesInfo.ObjectOf(id)
			var body ast.Node
			for i := len(stack) - 1; i >= 0 && body == nil; i-- {
				switch f := stack[i].(type) {
				case *ast.FuncLit:
					body = f.Body
				case *ast.FuncDecl:
					body = f.Body
				}
			}
			closed := false
			ast.Inspect(body, func(m ast.Node) bool {
				if c, ok := m.(*ast.CallExpr); ok {
					if sel, ok := c.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == "Close" {
						if x, ok := sel.X.(*ast.Ident); ok && pass.TypesInfo.Uses[x] == obj {
							closed = true
						}
					}
				}
				return !closed
			})
			if !closed {
				pass.Reportf(id.Pos(), "%s from %s is never closed: add `defer %s.Close()`", id.Name, fn.Name(), id.Name)
			}
		})
	})

// ── migratedown ──────────────────────────────────────────────────────────────

var MigrateDown = newAnalyzer("migratedown",
	"every migration registers a down function (reversibility is verified by pbg migrate-check)",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || fn.Name() != "Register" || !(pkgIs(fn.Pkg(), "migrations") || pkgIs(fn.Pkg(), "core")) || len(call.Args) < 2 {
				return
			}
			if isNil(pass.TypesInfo, call.Args[1]) {
				pass.Reportf(call.Args[1].Pos(), "migration has no down function: it cannot be reverted (write the inverse of up)")
			}
		})
	})

// ── automigrate ──────────────────────────────────────────────────────────────

var AutoMigrate = newAnalyzer("automigrate",
	"Automigrate is enabled only under `go run` (osutils.IsProbablyGoRun), never hard-coded",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CompositeLit)(nil), (*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			switch x := n.(type) {
			case *ast.CompositeLit:
				t, ok := deref(pass.TypesInfo.TypeOf(x)).(*types.Named)
				if !ok || t.Obj().Name() != "Config" || !pkgIs(t.Obj().Pkg(), "plugins/migratecmd") {
					return
				}
				for _, el := range x.Elts {
					kv, ok := el.(*ast.KeyValueExpr)
					if !ok || kv.Key.(*ast.Ident).Name != "Automigrate" {
						continue
					}
					if tv := pass.TypesInfo.Types[kv.Value]; tv.Value != nil && constant.BoolVal(tv.Value) {
						pass.Reportf(kv.Value.Pos(), "Automigrate hard-coded to true: production would generate migrations from dashboard edits — use osutils.IsProbablyGoRun()")
					}
				}
			case *ast.CallExpr:
				fn := callee(pass.TypesInfo, x)
				if fn == nil || fn.Pkg() == nil || fn.Pkg().Path() != "strings" || fn.Name() != "HasPrefix" || len(x.Args) != 2 {
					return
				}
				if sel, ok := x.Args[0].(*ast.IndexExpr); ok {
					if s, ok := sel.X.(*ast.SelectorExpr); ok && s.Sel.Name == "Args" {
						if c, ok := x.Args[1].(*ast.CallExpr); ok {
							if f := callee(pass.TypesInfo, c); f != nil && f.Name() == "TempDir" {
								pass.Reportf(x.Pos(), "hand-rolled `go run` detection is wrong since Go 1.24 (binaries live in GOCACHE): use osutils.IsProbablyGoRun()")
							}
						}
					}
				}
			}
		})
	})

// ── cronid ───────────────────────────────────────────────────────────────────

var CronID = newAnalyzer("cronid",
	"cron jobs have a stable constant id that does not use the reserved __pb prefix",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !pkgIs(fn.Pkg(), "tools/cron") || (fn.Name() != "Add" && fn.Name() != "MustAdd") || len(call.Args) == 0 {
				return
			}
			id, ok := constString(pass.TypesInfo, call.Args[0])
			switch {
			case !ok:
				pass.Reportf(call.Args[0].Pos(), "cron job id is computed at runtime: use a stable constant so the job can be replaced/removed")
			case strings.HasPrefix(id, "__pb"):
				pass.Reportf(call.Args[0].Pos(), "cron job id %q uses the reserved __pb prefix of system jobs", id)
			}
		})
	})

// ── errignored ───────────────────────────────────────────────────────────────

var ErrIgnored = newAnalyzer("errignored",
	"errors returned by PocketBase APIs are never discarded",
	func(pass *analysis.Pass) {
		check := func(call *ast.CallExpr, blankErr bool) {
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !inPocketBase(fn.Pkg()) || fn.Name() == "Next" || fn.Name() == "Close" {
				return
			}
			res := fn.Type().(*types.Signature).Results()
			if res.Len() == 0 || !types.Identical(res.At(res.Len()-1).Type(), types.Universe.Lookup("error").Type()) {
				return
			}
			if blankErr {
				pass.Reportf(call.Pos(), "error returned by %s is discarded", fn.Name())
			}
		}
		run(pass, []ast.Node{(*ast.ExprStmt)(nil), (*ast.AssignStmt)(nil)}, func(n ast.Node, _ []ast.Node) {
			switch s := n.(type) {
			case *ast.ExprStmt:
				if c, ok := s.X.(*ast.CallExpr); ok {
					check(c, true)
				}
			case *ast.AssignStmt:
				if len(s.Rhs) == 1 {
					if c, ok := s.Rhs[0].(*ast.CallExpr); ok {
						last, ok := s.Lhs[len(s.Lhs)-1].(*ast.Ident)
						check(c, ok && last.Name == "_")
					}
				}
			}
		})
	})

// ── mailersender ─────────────────────────────────────────────────────────────

var MailerSender = newAnalyzer("mailersender",
	"mail senders come from app.Settings().Meta at send time, never a literal",
	func(pass *analysis.Pass) {
		run(pass, []ast.Node{(*ast.CompositeLit)(nil)}, func(n ast.Node, _ []ast.Node) {
			cl := n.(*ast.CompositeLit)
			t, ok := deref(pass.TypesInfo.TypeOf(cl)).(*types.Named)
			if !ok || t.Obj().Name() != "Message" || !pkgIs(t.Obj().Pkg(), "tools/mailer") {
				return
			}
			for _, el := range cl.Elts {
				kv, ok := el.(*ast.KeyValueExpr)
				if !ok || kv.Key.(*ast.Ident).Name != "From" {
					continue
				}
				addr, ok := kv.Value.(*ast.CompositeLit)
				if !ok {
					continue
				}
				for _, f := range addr.Elts {
					if fkv, ok := f.(*ast.KeyValueExpr); ok && fkv.Key.(*ast.Ident).Name == "Address" {
						if _, isConst := constString(pass.TypesInfo, fkv.Value); isConst {
							pass.Reportf(fkv.Value.Pos(), "hard-coded sender address: read app.Settings().Meta.SenderAddress when sending")
						}
					}
				}
			}
		})
	})

// ── settingscache ────────────────────────────────────────────────────────────

var SettingsCache = newAnalyzer("settingscache",
	"app.Settings() is read at call time, never cached in a package variable",
	func(pass *analysis.Pass) {
		usesSettings := func(e ast.Node) bool {
			found := false
			ast.Inspect(e, func(m ast.Node) bool {
				if c, ok := m.(*ast.CallExpr); ok {
					if fn := callee(pass.TypesInfo, c); fn != nil && fn.Name() == "Settings" && pkgIs(fn.Pkg(), "core") {
						found = true
					}
				}
				return !found
			})
			return found
		}
		pkgScope := pass.Pkg.Scope()
		run(pass, []ast.Node{(*ast.AssignStmt)(nil)}, func(n ast.Node, _ []ast.Node) {
			as := n.(*ast.AssignStmt)
			if as.Tok != token.ASSIGN {
				return
			}
			for i, l := range as.Lhs {
				id, ok := l.(*ast.Ident)
				if !ok || i >= len(as.Rhs) {
					continue
				}
				if obj := pass.TypesInfo.Uses[id]; obj != nil && obj.Parent() == pkgScope && usesSettings(as.Rhs[i]) {
					pass.Reportf(id.Pos(), "settings cached in package variable %s: they change at runtime — read app.Settings() when needed", id.Name)
				}
			}
		})
	})

// ── routeauth (review) ───────────────────────────────────────────────────────

var routeMethods = map[string]bool{"GET": true, "POST": true, "PUT": true, "PATCH": true, "DELETE": true, "Any": true}

var RouteAuth = newAnalyzer("routeauth",
	"custom routes declare their auth (apis.RequireAuth/RequireSuperuserAuth/…); review finding",
	func(pass *analysis.Pass) {
		isAuthMW := func(e ast.Expr) bool {
			c, ok := e.(*ast.CallExpr)
			if !ok {
				return false
			}
			fn := callee(pass.TypesInfo, c)
			return fn != nil && pkgIs(fn.Pkg(), "apis") && strings.HasPrefix(fn.Name(), "Require")
		}
		boundGroups := map[types.Object]bool{}
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, _ []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || fn.Name() != "Bind" || !pkgIs(fn.Pkg(), "tools/router") {
				return
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok {
				return
			}
			for _, a := range call.Args {
				if isAuthMW(a) {
					if id, ok := sel.X.(*ast.Ident); ok {
						boundGroups[pass.TypesInfo.Uses[id]] = true
					}
				}
			}
		})
		run(pass, []ast.Node{(*ast.CallExpr)(nil)}, func(n ast.Node, stack []ast.Node) {
			call := n.(*ast.CallExpr)
			fn := callee(pass.TypesInfo, call)
			if fn == nil || !pkgIs(fn.Pkg(), "tools/router") || !routeMethods[fn.Name()] {
				return
			}
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
				if id, ok := sel.X.(*ast.Ident); ok && boundGroups[pass.TypesInfo.Uses[id]] {
					return
				}
			}
			// route(...).Bind(apis.Require…())
			if len(stack) >= 3 {
				if sel, ok := stack[len(stack)-2].(*ast.SelectorExpr); ok && sel.Sel.Name == "Bind" {
					if outer, ok := stack[len(stack)-3].(*ast.CallExpr); ok {
						for _, a := range outer.Args {
							if isAuthMW(a) {
								return
							}
						}
					}
				}
			}
			pass.Reportf(call.Pos(), "route has no apis.Require* middleware: confirm it is meant to be public")
		})
	})
