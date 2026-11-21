def parse_csv(text):
    """(name, amount) rows of a 'name,amount' CSV, header skipped."""
    rows = []
    for line in text.split("\n")[1:]:
        parts = line.split(",")
        if len(parts) != 2 or not parts[1].isdigit():
            continue
        rows.append((parts[0], int(parts[1])))
    return rows
