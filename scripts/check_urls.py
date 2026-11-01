"""Check that every provider's search and docs URL is still reachable.

Hits third-party sites, so this is deliberately not part of CI. Several
providers sit behind bot protection and answer 403/521 to a plain request --
those are reported as BLOCKED rather than failures. A 404 is a real problem:
that is how onyphe's move to search.onyphe.io was spotted.
"""
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (compatible; transl8-linkcheck/1.0)"
BLOCKED = {401, 403, 429, 503, 520, 521, 522}


def check(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, ""
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return None, type(e).__name__


def main():
    providers = json.load(open(os.path.join(ROOT, "data", "providers.json")))
    dead = []
    for p in providers:
        for kind in ("prefix", "docs"):
            url = p[kind]
            # prefix is a query URL stub; give it something to search for
            target = url + "ip%3A%221.1.1.1%22" if kind == "prefix" else url
            code, err = check(target)
            if code == 200:
                state = "ok"
            elif code in BLOCKED:
                state = "BLOCKED (bot protection, not necessarily broken)"
            elif code is None:
                state = f"UNREACHABLE ({err})"
            else:
                state = "DEAD"
                dead.append((p["name"], kind, url, code))
            print(f"  {p['name']:18} {kind:7} {str(code or '---'):5} {state}")

    if dead:
        print("\ndead URLs needing attention:")
        for name, kind, url, code in dead:
            print(f"  {name} {kind} -> HTTP {code}  {url}")
        return 1
    print("\nno dead URLs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
