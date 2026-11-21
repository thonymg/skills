def mean_amount(rows):
    return sum(amount for _, amount in rows) / len(rows)


def top(rows, n=3):
    return sorted(rows, key=lambda row: row[1], reverse=True)[:n]
