"""Store a proposal PDF in the ledger's private Firebase Storage and list it on the company's card.

Usage:
  python3 upload_proposal.py --key KEY.json --pdf Amplifier_and_X_Proposal.pdf --id <opportunity id> [--name "Company"]

The file goes to gs://amplifier-ledger.firebasestorage.app/proposals/<id>/<file name>. Storage rules
(storage.rules) let only the dashboard's signed-in admin accounts read it; the card's PDF link opens it
with the viewer's own token. Nothing is public. The Firestore row gets
{"name": <file name>, "url": "fbs:proposals/<id>/<file name>", "t": <now ms>} merged into proposals.
"""
import argparse, json, os, subprocess, sys, tempfile, time, urllib.parse
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession

BUCKET = "amplifier-ledger.firebasestorage.app"

ap = argparse.ArgumentParser()
ap.add_argument("--key", required=True); ap.add_argument("--pdf", required=True)
ap.add_argument("--id", required=True); ap.add_argument("--name")
a = ap.parse_args()

fname = os.path.basename(a.pdf)
path = f"proposals/{a.id}/{fname}"
creds = service_account.Credentials.from_service_account_file(a.key, scopes=["https://www.googleapis.com/auth/devstorage.read_write"])
s = AuthorizedSession(creds)
url = f"https://storage.googleapis.com/upload/storage/v1/b/{BUCKET}/o?uploadType=media&name={urllib.parse.quote(path, safe='')}"
with open(a.pdf, "rb") as f:
    r = s.post(url, data=f.read(), headers={"Content-Type": "application/pdf"})
if r.status_code != 200:
    sys.exit(f"Upload failed ({r.status_code}): {r.text[:300]}")

row = {"id": a.id, "proposals": [{"name": fname, "url": f"fbs:{path}", "t": int(time.time() * 1000)}]}
if a.name: row["name"] = a.name
with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
    json.dump([row], t)
here = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, os.path.join(here, "ledger_sync.py"), "--key", a.key, "--rows", t.name], check=True)
os.unlink(t.name)
print(json.dumps({"stored": f"gs://{BUCKET}/{path}", "listed_on": a.id}))
