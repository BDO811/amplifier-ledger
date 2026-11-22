# Amplifier Client Ledger

Served at https://amplifier.athemventures.com (GitHub Pages, custom domain via `CNAME`; DNS is a CNAME record `amplifier -> bdo811.github.io` in Squarespace Domains).

- `index.html`: the built page. It holds no client data. It signs in with Google and reads the `opportunities` collection in Firebase project `amplifier-ledger`.
- `src/`: source inlined into `index.html`.
- Access is enforced by Firestore security rules (two allowed Google accounts, verified email). The Firebase web config in the page is a public identifier, not a secret.
- Firebase Auth authorized domains must include amplifier.athemventures.com.
- Data: the Notion database "Amplifier Opportunities", synced nightly from Gmail, Slack and Notion.

## Proposal PDFs (private)

The /amplifier-proposal skill stores each proposal PDF with `sync/upload_proposal.py`, in this project's Firebase Storage under `proposals/<opportunity id>/`, and lists it on the company's card with url `fbs:<path>`. The card's PDF link fetches it with the signed-in viewer's Firebase token, so only the accounts allowed by `storage.rules` can open it; there is no public link. One-time setup in the Firebase console (project amplifier-ledger):

1. Storage › Get started (bucket `amplifier-ledger.firebasestorage.app`), then Storage › Rules: paste `storage.rules` and Publish. Make the email list match the Firestore rules.
2. Project settings › Service accounts › Generate new private key. Give that service account the roles Cloud Datastore User and Storage Object Admin (Google Cloud console › IAM). Save the JSON in Google Drive as `amplifier-ledger-sync-key.json` (the nightly sync and the proposal skill read it from there; never commit it).
