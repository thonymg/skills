package fsclose

import "ganigeorgiev.com/pocketbase/pocketbase/core"

func good(app core.App) error {
	fsys, err := app.NewFilesystem()
	if err != nil {
		return err
	}
	defer fsys.Close()
	r, err := fsys.GetReader("k")
	if err != nil {
		return err
	}
	defer r.Close()
	return nil
}

func bad(app core.App) error {
	fsys, err := app.NewBackupsFilesystem() // want `never closed`
	if err != nil {
		return err
	}
	_, err = fsys.GetReader("k") // want `discarded`
	return err
}
