// Shared session state + a tiny event bus so each teammate's file can react
// to the others without editing them. (Owner: shared)
//
// Events (emit / on):
//   session:start   user signed in           detail = session.user
//   session:end     user signed out
//   requests:change requests collection updated (session.requests, session.myRequest)
//   requests:error  reading requests failed  detail = message
//   origin:change   the start point for distances changed (session.origin)
//   origin:mode     list -> data: use "gps" | "home" | "custom" as start point
//   origin:set-custom  map -> data: start point picked on the map  detail = { lat, lng }
//   outgoing:change requests I sent changed  (session.outgoing)
//   area:select     a map pin was clicked    detail = areaId | null
//   map:render      list -> map: what to draw detail = { requests, selectedArea, homeArea, campus }
//   map:focus       list -> map: pan to an area detail = { areaId }
//   request-popup:open  open the "post a ride request" form

export const session = {
    user: null,          // { uid, name, email, campus, address }
    requests: [],        // every document in requests/
    myRequest: null,     // requests/{my uid}, or null
    origin: null,        // { lat, lng } start point for distances (only ever shown to me)
    originStatus: "unknown", // "pending" | "ok" | "failed"
    originMode: "gps",   // "gps" (my location) | "home" (my address) | "custom" (picked on map)
    originNote: "",      // explains a fallback, e.g. location access blocked
    outgoing: new Map(), // receiverId -> ride_requests doc I sent
};

const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

export const $ = (id) => document.getElementById(id);
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (ch) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// createdAt may be a Firestore Timestamp, a number (ms), an ISO string or null
// (null right after a local write, until the server fills it in).
export function toTime(v) {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v.toMillis === "function") return v.toMillis();
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
}

export function timeAgo(ms) {
    if (!ms) return "just now";
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? "yesterday" : days < 30 ? `${days} days ago`
        : new Date(ms).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
