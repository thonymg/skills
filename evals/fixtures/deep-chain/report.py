import sys

from parser import parse_csv
from stats import mean_amount, top


def summary(path):
    with open(path, newline="") as handle:
        rows = parse_csv(handle.read())
    best = ", ".join(name for name, _ in top(rows))
    return f"{len(rows)} sales, mean {mean_amount(rows):.2f}, top: {best}"


if __name__ == "__main__":
    print(summary(sys.argv[1]))
