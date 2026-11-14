// Live data from Firestore (every ride request) and the start point used for
// distances: the user's current location, home address, or a point picked on
// the map. (Owner: map / you)
import { db, collection, onSnapshot } from "./firebase.js";
import { session, on, emit, isNum } from "./state.js";
import { geocode } from "./geo.js";

const MONTREAL = { lat: 45.5017, lng: -73.5673 };
let unsub = null;
let profilePromise = null;   // geocode of the profile address, done once per session
let gen = 0;                 // ignores late answers after the mode changed again

on("session:start", (user) => {
    session.requests = [];
    session.myRequest = null;
    profilePromise = null;
    setMode("gps");

    unsub = onSnapshot(collection(db, "requests"),
        (snap) => {
            const before = session.myRequest;
            session.requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            session.myRequest = session.requests.find((r) => r.id === user.uid) || null;
            emit("requests:change");
            // "home" prefers the address of my posted request, so refresh it when that changes
            const moved = before?.lat !== session.myRequest?.lat || before?.lng !== session.myRequest?.lng;
            if (session.originMode === "home" && moved) setMode("home");
        },
        (err) => {
            console.error("Reading requests failed:", err);
            emit("requests:error", err.code === "permission-denied"
                ? "The database refused to share ride requests. Check the Firestore rules."
                : "Couldn't load ride requests. Check your connection and refresh.");
        });
});

on("session:end", () => {
    if (unsub) unsub();
    unsub = null;
    gen++;
    session.requests = [];
    session.myRequest = null;
    session.origin = null;
    session.originStatus = "unknown";
    session.originNote = "";
});

on("origin:mode", (mode) => setMode(mode));
on("origin:set-custom", ({ lat, lng }) => {
    gen++;
    session.originMode = "custom";
    session.originNote = "";
    setOrigin({ lat, lng });
});

async function setMode(mode) {
    const my = ++gen;
    session.originMode = mode;
    session.originNote = "";

    if (mode === "custom") {
        // Start from wherever the start point currently is; the user then moves it.
        setOrigin(session.origin || MONTREAL);
        return;
    }

    session.originStatus = "pending";
    emit("origin:change");

    if (mode === "gps") {
        const here = await currentLocation();
        if (my !== gen) return;
        if (here) return setOrigin(here);
        // No permission or no GPS: fall back to the home address.
        session.originMode = "home";
        session.originNote = "Location access is off, so distances are measured from your home address.";
    }

    const home = await homeLocation();
    if (my !== gen) return;
    if (home) return setOrigin(home);
    session.origin = null;
    session.originStatus = "failed";
    session.originNote = "We couldn't find your home address. Pick a start point on the map instead.";
    emit("origin:change");
}

function currentLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 10000, maximumAge: 5 * 60 * 1000 });
    });
}

// Home = my posted request's address if I have one, otherwise my profile address.
async function homeLocation() {
    const mine = session.myRequest;
    if (mine && isNum(mine.lat) && isNum(mine.lng)) return { lat: mine.lat, lng: mine.lng };
    if (!profilePromise) profilePromise = geocode(session.user?.address || "");
    const hit = await profilePromise;
    return hit && !hit.error ? { lat: hit.lat, lng: hit.lng } : null;
}

function setOrigin(p) {
    session.origin = p;
    session.originStatus = "ok";
    emit("origin:change");
}
