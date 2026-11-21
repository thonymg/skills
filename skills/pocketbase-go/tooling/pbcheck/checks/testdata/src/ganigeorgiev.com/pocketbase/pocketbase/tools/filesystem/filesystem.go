package filesystem

type Reader struct{}

func (r *Reader) Close() error { return nil }

type System struct{}

func (s *System) Close() error                        { return nil }
func (s *System) GetReader(key string) (*Reader, error) { return nil, nil }
