import os
import yaml
import json

with open('providers.yml') as f:
    data = yaml.load(f, Loader=yaml.FullLoader)
    with open('docs/providers.json', 'w') as f:
        f.write(json.dumps(data, indent=4))
