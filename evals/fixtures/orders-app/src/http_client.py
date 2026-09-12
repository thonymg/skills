class HttpClient:
    def __init__(self, base_url, timeout=5):
        self.base_url = base_url
        self.timeout = timeout

    def get(self, path):
        raise NotImplementedError("wired by the composition root")
