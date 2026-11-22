# Amplifier Client Ledger

Served at https://amplifier.athemventures.com (GitHub Pages, custom domain via `CNAME`; DNS is a CNAME record `amplifier -> bdo811.github.io` in Squarespace Domains).

- `index.html`: the built page. It holds no client data. It signs in with Google and reads the `opportunities` collection in Firebase project `amplifier-ledger`.
- `src/`: source inlined into `index.html`.
- Access is enforced by Firestore security rules (two allowed Google accounts, verified email). The Firebase web config in the page is a public identifier, not a secret.
- Firebase Auth authorized domains must include amplifier.athemventures.com.
- Data: the Notion database "Amplifier Opportunities", synced nightly from Gmail, Slack and Notion.
