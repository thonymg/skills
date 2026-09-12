import os

from http_client import HttpClient


class PaymentService:
    def __init__(self):
        self._client = HttpClient(
            base_url=os.environ["PAYMENTS_URL"],
            timeout=int(os.environ.get("PAYMENTS_TIMEOUT", "5")),
        )

    def fetch(self, payment_id):
        response = self._client.get(f"/payments/{payment_id}")
        if response.status != 200:
            return None
        return response.json()
