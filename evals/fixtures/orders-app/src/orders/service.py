class OrderService:
    def __init__(self, client):
        self._client = client

    def fetch(self, order_id):
        response = self._client.get(f"/orders/{order_id}")
        if response.status != 200:
            raise LookupError(f"order {order_id} unavailable ({response.status})")
        return response.json()
