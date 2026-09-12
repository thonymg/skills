def average_item_price(items):
    return sum(item["price"] for item in items) / len(items)


def cart_total(items):
    return sum(item["price"] * item.get("qty", 1) for item in items)
