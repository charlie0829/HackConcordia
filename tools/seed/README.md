# Database admin tool

Wipes the CoRide Firestore database and/or fills it with mock ride requests.
Runs on your computer with an admin key, which bypasses the security rules.

## One-time setup

1. Install Node.js 18+ (nodejs.org).
2. Firebase console → ⚙ Project settings → **Service accounts** → **Generate new private key**.
   Save the downloaded file in this folder as `serviceAccountKey.json`.
   **Never commit or share it**: it gives full access to the project. `.gitignore` already excludes it.
3. In this folder: `npm install`

## Commands

| Command | What it does |
|---|---|
| `node seed.mjs --dry-run` | Preview 500 mock requests (stats + `mock-requests.preview.json`). Changes nothing. |
| `node seed.mjs --wipe --mocks 500` | Shows what it will delete/add, then stops. |
| `node seed.mjs --wipe --mocks 500 --yes` | Deletes all `users`, `requests`, `ride_requests`, then adds 500 mocks. |
| `node seed.mjs --wipe --wipe-auth --mocks 500 --yes` | Same, and also deletes every login account. |
| `node seed.mjs --wipe-mocks --yes` | Deletes only mock requests (IDs `mock_0001`…) and requests sent to them. |

Options: `--mocks N` for a different count, `--seed N` for different (but repeatable) random data.

## About the mock data

- Spread over the 26 neighbourhoods in `js/geo.js`, weighted roughly by population.
- Each person's campus favours schools close to where they live.
- Fields match the app and the security rules exactly. `startingAddress` reads
  "Mock address near …"; it is never shown, matching uses `lat`/`lng`.
- Mock people have no login account, so a request sent to them stays "pending".
  For a live demo of accepting, use two real accounts.
