import json

from parser import parse_csv
from stats import mean_amount


def to_json(path):
    with open(path, newline="") as handle:
        rows = parse_csv(handle.read())
    return json.dumps({"count": len(rows), "mean": mean_amount(rows)})
