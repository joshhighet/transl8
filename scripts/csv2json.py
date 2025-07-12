import csv
import json
import sys

def nullstr(value):
    if isinstance(value, str) and value.strip() == "":
        return None
    return value

def csv_to_json(csv_file, json_file):
    data = []
    with open(csv_file, "r") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            data.append({k: nullstr(v) for k, v in row.items()})
    with open(json_file, "w") as jsonfile:
        json.dump(data, jsonfile, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    csv_to_json(sys.argv[1], sys.argv[2])  # Use sys.argv