class UserRepository:
    def fetch_user_list(self):
        return []

    def is_email_valid(self, email):
        return False


MAX_RETRY_COUNT = 3
timeout_in_ms = 5000
