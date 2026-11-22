"""Push opportunity rows into the Amplifier Client Ledger (Firestore project amplifier-ledger).

Usage:
  python3 ledger_sync.py --key KEY.json --rows rows.json [--delete id1,id2]

rows.json is a JSON array, one object per company:
  {"id": "the-ark-group", "name": "The Ark Group", "stage": "advanced", "owner": "Amit / Jeremy",
   "status": "...", "next": "...", "contact": "...", "origin": "email|gtm|drive",
   "drive": "https://drive.google.com/...", "proposals": [{"name": "...", "url": "...", "t": 1793642400000}],
   "threads": [{"id": "<gmail thread id>", "s": "<subject>", "d": "out|in|int|cal", "t": <epoch ms>}]}

Only the fields present in a row are written (Firestore updateMask), so fields set by hand on the
dashboard (pipeline, dismissed, dismissedAt, pipelineAt) are never overwritten. Threads and
proposals are merged with what is already stored, by id/url, never dropped.
stage is the Notion stage key: active, advanced, early, proposal, partner, stalled, target.
"""
import argparse, json, sys, time
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

PROJECT = "amplifier-ledger"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
WRITABLE = ["name", "stage", "owner", "status", "next", "contact", "origin", "drive", "domains", "threads", "proposals"]
EXCLUDED = {"saleseq"}


def enc(v):
    if v is None: return {"nullValue": None}
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    if isinstance(v, str): return {"stringValue": v}
    if isinstance(v, list): return {"arrayValue": {"values": [enc(x) for x in v]}}
    if isinstance(v, dict): return {"mapValue": {"fields": {k: enc(x) for k, x in v.items()}}}
    raise TypeError(type(v))


def dec(v):
    k, x = next(iter(v.items()))
    if k == "integerValue": return int(x)
    if k == "arrayValue": return [dec(i) for i in x.get("values", [])]
    if k == "mapValue": return {a: dec(b) for a, b in x.get("fields", {}).items()}
    if k == "nullValue": return None
    return x


def merge_list(old, new, key):
    seen = {i.get(key): i for i in (old or []) if isinstance(i, dict)}
    for i in new or []: seen[i.get(key)] = {**seen.get(i.get(key), {}), **i}
    return sorted(seen.values(), key=lambda i: -(i.get("t") or 0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True); ap.add_argument("--rows", required=True); ap.add_argument("--delete", default="")
    a = ap.parse_args()
    creds = service_account.Credentials.from_service_account_file(a.key, scopes=["https://www.googleapis.com/auth/datastore"])
    s = AuthorizedSession(creds)
    rows = json.load(open(a.rows))
    writes, skipped = [], []
    for r in rows:
        rid = r.get("id")
        if not rid or rid in EXCLUDED: skipped.append(rid); continue
        cur = s.get(f"{BASE}/opportunities/{rid}")
        old = {k: dec(v) for k, v in cur.json().get("fields", {}).items()} if cur.status_code == 200 else {}
        doc = {k: r[k] for k in WRITABLE if k in r}
        if "threads" in doc: doc["threads"] = merge_list(old.get("threads"), doc["threads"], "id")
        if "proposals" in doc: doc["proposals"] = merge_list(old.get("proposals"), doc["proposals"], "url")
        doc["syncedAt"] = int(time.time() * 1000)
        writes.append({"update": {"name": f"projects/{PROJECT}/databases/(default)/documents/opportunities/{rid}",
                                  "fields": {k: enc(v) for k, v in doc.items()}},
                       "updateMask": {"fieldPaths": list(doc.keys())}})
    for rid in [x for x in a.delete.split(",") if x] + [x for x in EXCLUDED]:
        writes.append({"delete": f"projects/{PROJECT}/databases/(default)/documents/opportunities/{rid}"})
    for i in range(0, len(writes), 400):
        res = s.post(f"{BASE}:commit", json={"writes": writes[i:i + 400]})
        if res.status_code != 200: sys.exit(f"Firestore commit failed ({res.status_code}): {res.text[:400]}")
    print(json.dumps({"written": len(rows) - len(skipped), "skipped": skipped, "deleted": [w["delete"].rsplit("/", 1)[1] for w in writes if "delete" in w]}))


if __name__ == "__main__":
    main()
