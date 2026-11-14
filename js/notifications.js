// Bell + notifications: requests other people sent me (accept / decline) and
// answers to requests I sent. Accepting shares my contact with the sender.
// Data: ride_requests/{senderId}_{receiverId}. (Owner: requestID teammate)
import { db, collection, doc, updateDoc, query, where, onSnapshot } from "./firebase.js";
import { session, on, emit, $, escapeHtml, toTime } from "./state.js";

const bell = $("bellBtn");
const panel = $("notifPanel");
const badge = $("notifBadge");
const list = $("notifList");

let incoming = [];
let unsubIn = null, unsubOut = null;

function setOpen(open) {
    panel.hidden = !open;
    bell.setAttribute("aria-expanded", open);
}
bell.addEventListener("click", (e) => { e.stopPropagation(); setOpen(panel.hidden); });
$("closeNotifBtn").addEventListener("click", () => setOpen(false));
// Close when clicking outside. composedPath() is fixed when the click starts,
// so it still works if the clicked button was re-rendered away meanwhile.
document.addEventListener("click", (e) => {
    const path = e.composedPath();
    if (!panel.hidden && !path.includes(panel) && !path.includes(bell)) setOpen(false);
});

on("session:start", (user) => {
    incoming = [];
    session.outgoing = new Map();
    const col = collection(db, "ride_requests");

    unsubIn = onSnapshot(query(col, where("receiverId", "==", user.uid)),
        (snap) => { incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() })); render(); },
        (err) => console.warn("Incoming requests listener:", err));

    // All requests I sent: the list uses these for button states, the bell
    // shows the ones that were answered.
    unsubOut = onSnapshot(query(col, where("senderId", "==", user.uid)),
        (snap) => {
            session.outgoing = new Map(snap.docs.map((d) => [d.data().receiverId, { id: d.id, ...d.data() }]));
            emit("outgoing:change");
            render();
        },
        (err) => console.warn("Outgoing requests listener:", err));
});

on("session:end", () => {
    if (unsubIn) unsubIn();
    if (unsubOut) unsubOut();
    unsubIn = unsubOut = null;
    incoming = [];
    session.outgoing = new Map();
    setOpen(false);
    render();
});

function render() {
    const answered = [...session.outgoing.values()].filter((r) => r.status === "accepted" || r.status === "declined");
    const pending = incoming.filter((r) => r.status === "pending");
    const count = pending.length + answered.length;
    badge.hidden = count === 0;
    badge.textContent = count;
    bell.setAttribute("aria-label", count ? `Notifications, ${count} new` : "Notifications");

    const newest = (a, b) => toTime(b.createdAt) - toTime(a.createdAt);
    const items = [];

    for (const r of [...incoming].sort(newest)) {
        const dist = typeof r.distanceKm === "number" ? `<span class="notif-distance">${r.distanceKm} km away</span>` : "";
        let action = "";
        if (r.status === "pending") {
            action = `<div class="notif-actions">
                <button type="button" class="btn primary" data-decide="accepted" data-id="${escapeHtml(r.id)}">Accept and share my contact</button>
                <button type="button" class="btn quiet" data-decide="declined" data-id="${escapeHtml(r.id)}">Decline</button>
            </div>`;
        } else if (r.status === "accepted") {
            action = `<p class="notif-note ok">You accepted. ${escapeHtml(r.senderName)} now has your contact and will reach out.</p>`;
        } else if (r.status === "declined") {
            action = `<p class="notif-note">You declined this request.</p>`;
        }
        items.push(`<li class="notif-item">
            <div class="notif-top"><span class="notif-sender">${escapeHtml(r.senderName || "A student")} wants to ride with you</span>${dist}</div>
            ${r.senderComment ? `<p class="notif-comment">${escapeHtml(r.senderComment)}</p>` : ""}
            ${action}
        </li>`);
    }

    for (const r of answered.sort(newest)) {
        items.push(r.status === "accepted"
            ? `<li class="notif-item">
                 <div class="notif-top"><span class="notif-sender">${escapeHtml(r.receiverName)} accepted your request</span></div>
                 <p class="contact-box">Contact: <strong>${escapeHtml(r.receiverContact)}</strong></p>
               </li>`
            : `<li class="notif-item">
                 <div class="notif-top"><span class="notif-sender">${escapeHtml(r.receiverName)} declined your request</span></div>
               </li>`);
    }

    list.innerHTML = items.length ? items.join("") : `<li class="notif-empty">No notifications yet. When someone asks to ride with you, it shows up here.</li>`;
}

list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-decide]");
    if (!btn || !session.user) return;
    const decision = btn.dataset.decide;
    btn.disabled = true;
    try {
        await updateDoc(doc(db, "ride_requests", btn.dataset.id), {
            status: decision,
            receiverContact: decision === "accepted" ? session.user.email : "",
        });
    } catch (err) {
        console.error("Updating request failed:", err);
        btn.disabled = false;
        btn.textContent = "Couldn't save. Try again";
    }
});

render();
