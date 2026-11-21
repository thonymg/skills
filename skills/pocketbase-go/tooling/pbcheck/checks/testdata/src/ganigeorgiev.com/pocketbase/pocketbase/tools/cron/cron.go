package cron

type Cron struct{}

func (c *Cron) Add(jobId string, cronExpr string, fn func()) error { return nil }
func (c *Cron) MustAdd(jobId string, cronExpr string, fn func())     {}
