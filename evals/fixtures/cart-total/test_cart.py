from api import cart_summary, checkout_preview
from cart import average_item_price, cart_total

ITEMS = [{"price": 10, "qty": 2}, {"price": 20}]


def test_average_item_price():
    assert average_item_price(ITEMS) == 15


def test_cart_total():
    assert cart_total(ITEMS) == 40


def test_cart_summary():
    assert cart_summary(ITEMS)["count"] == 2


def test_checkout_preview():
    assert checkout_preview(ITEMS)["ready"] is True


if __name__ == "__main__":
    for name, case in sorted(globals().items()):
        if name.startswith("test_"):
            case()
    print("ok")
