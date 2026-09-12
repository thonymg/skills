from cart import average_item_price, cart_total


def cart_summary(items):
    """GET /api/cart — 500s on an empty cart."""
    return {
        "count": len(items),
        "total": cart_total(items),
        "average": average_item_price(items),
    }


def checkout_preview(items):
    """POST /api/checkout/preview — same helper, same latent crash."""
    return {
        "average": average_item_price(items),
        "ready": bool(items),
    }
