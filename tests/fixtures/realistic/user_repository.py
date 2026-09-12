class UserRepository:
    def fetch_user_list(self, limit: int) -> list:
        return self.session.query(User).limit(limit).all()

    def calculate_order_total(self, order_list: list) -> float:
        return sum(order.price for order in order_list)
