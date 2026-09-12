class InvoiceService:
    def __init__(self, client):
        self._client = client

    def fetch(self, invoice_id):
        response = self._client.get(f"/invoices/{invoice_id}")
        if response.status != 200:
            raise LookupError(f"invoice {invoice_id} unavailable ({response.status})")
        return response.json()
