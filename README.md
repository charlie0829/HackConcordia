# CoRide

Student carpool matching for Montreal. Plain HTML/CSS/JS with Firebase (Auth + Firestore) and Leaflet/OpenStreetMap.

## Run it

ES modules need a real web server (not double-clicking the file):

- VS Code: right-click `index.html` → **Open with Live Server**, or
- `python3 -m http.server 8000` in this folder, then open http://localhost:8000

GitHub Pages works as-is (https).

## Who owns what

Each file has one owner, so you can work in parallel without merge conflicts.

| File | Owner | What it does |
|---|---|---|
| `js/auth.js` | requestID | Sign up, log in, log out, restore session after refresh |
| `js/my-request.js` | requestID | Post / remove your one ride request (`requests/{uid}`) |
| `js/notifications.js` | requestID | Bell, accept/decline, contact sharing |
| `js/list.js` | ListFilter | Filters, best-match sorting, match list, sending ride requests |
| `js/map.js` | Map | Neighbourhood pins (never precise locations) |
| `js/data.js` | Map | Live `requests` feed, your start point for distances |
| `js/geo.js` | Map | Neighbourhood list, campus list, distances, address lookup |
| `js/firebase.js`, `js/state.js` | Shared | Firebase setup (one SDK version) and the event bus |
| `index.html`, `css/styles.css` | Shared | Page structure and styles |
| `firestore.rules` | Shared | Paste into Firebase console → Firestore → Rules |

Files talk to each other through events in `js/state.js` (list at the top of that file), not by calling into each other.

## Data

```
users/{uid}                    private, owner only
  name, email, address, campus, createdAt

requests/{uid}                 at most one per account; no document = no pin
  name, campus, comment        shown
  area                         shown as the neighbourhood pin (id from js/geo.js)
  startingAddress, lat, lng    matching only, never displayed
  gender                       optional, for the gender filter
  createdAt

ride_requests/{senderId}_{receiverId}   only sender and receiver can read
  senderId, senderName, senderComment,
  receiverId, receiverName,
  receiverContact              filled in by the receiver when they accept
  distanceKm, status (pending | accepted | declined), createdAt
```
