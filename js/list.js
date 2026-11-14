// Filters, best-match sorting, the request list, and sending ride requests.
// (Owner: ListFilter teammate)
import { db, doc, setDoc, serverTimestamp } from "./firebase.js";
import { session, on, emit, $, escapeHtml, isNum, toTime, timeAgo } from "./state.js";
import { assignArea, nearestArea, distanceKm, norm, AREA_BY_ID } from "./geo.js";

const filters = { search: "", gender: "", radius: 5, sameCampus: true, area: null };
let openCard = null;
let loadError = null;
const listEl = $("matchList");

// --- Filter controls ---
$("filterSearch").addEventListener("input", (e) => { filters.search = e.target.value.trim().toLowerCase(); render(); });
$("filterGender").addEventListener("change", (e) => { filters.gender = e.target.value; render(); });
$("filterFrom").addEventListener("change", (e) => emit("origin:mode", e.target.value));
$("filterRadius").addEventListener("change", (e) => { filters.radius = Number(e.target.value); render(); });
$("filterCampus").addEventListener("change", (e) => { filters.sameCampus = e.target.checked; render(); });
$("areaChip").addEventListener("click", () => { filters.area = null; render(); });

on("area:select", (id) => { filters.area = id; openCard = null; render(); });
on("session:start", () => { openCard = null; loadError = null; filters.area = null; render(); });
on("requests:change", () => { loadError = null; render(); });
on("requests:error", (msg) => { loadError = msg; render(); });
on("origin:change", render);
on("outgoing:change", render);

function withMeta(r) {
    const o = session.origin;
    const dist = o && isNum(r.lat) && isNum(r.lng) ? distanceKm(o.lat, o.lng, r.lat, r.lng) : null;
    return { ...r, _area: assignArea(r), _dist: dist };
}

function passes(r, me) {
    if (filters.search) {
        const hay = `${r.name || ""} ${r.comment || ""}`.toLowerCase();
        if (!hay.includes(filters.search)) return false;
    }
    if (filters.gender && r.gender !== filters.gender) return false;
    if (session.origin && filters.radius < 500 && (r._dist === null || r._dist > filters.radius)) return false;
    if (filters.sameCampus && me.campus && norm(r.campus) !== norm(me.campus)) return false;
    return true;
}

// Best match first: closest start point, then same campus, then newest.
function byBestMatch(a, b, me) {
    const da = a._dist ?? Infinity, db_ = b._dist ?? Infinity;
    if (da !== db_) return da - db_;
    const ca = norm(a.campus) === norm(me.campus), cb = norm(b.campus) === norm(me.campus);
    if (ca !== cb) return ca ? -1 : 1;
    return toTime(b.createdAt) - toTime(a.createdAt);
}

function render() {
    const me = session.user;
    if (!me) return;

    const others = session.requests.filter((r) => r.id !== me.uid).map(withMeta);
    const matching = others.filter((r) => passes(r, me));
    const mine = session.myRequest ? withMeta(session.myRequest) : null;

    // Map shows every request that passes the filters (area filter aside), plus mine.
    const homeArea = mine?._area?.id
        || (session.origin ? nearestArea(session.origin.lat, session.origin.lng)?.id : null)
        || null;
    emit("map:render", {
        requests: mine ? [...matching, mine] : matching,
        selectedArea: filters.area,
        homeArea,
        campus: filters.sameCampus ? me.campus : null,
        origin: session.origin,
        originMode: session.originMode,
        radiusKm: session.origin && filters.radius < 500 ? filters.radius : null,
    });

    const visible = (filters.area ? matching.filter((r) => r._area?.id === filters.area) : matching)
        .sort((a, b) => byBestMatch(a, b, me));

    // Area chip in the filter bar
    const chip = $("areaChip");
    chip.hidden = !filters.area;
    if (filters.area) chip.querySelector("span").textContent = `Only ${AREA_BY_ID.get(filters.area)?.name || "this area"}`;

    // Start point + radius
    $("filterFrom").value = session.originMode;
    $("filterRadius").disabled = !session.origin;

    $("listSummary").textContent = loadError ? loadError : summary(visible.length, others.length);
    $("listSummary").classList.toggle("err", !!loadError);

    const cards = [];
    if (mine) cards.push(card(mine, true));
    cards.push(...visible.map((r) => card(r, false)));
    if (!visible.length && !loadError) cards.push(`<p class="no-matches">${emptyText(others.length)}</p>`);
    listEl.innerHTML = cards.join("");
}

function summary(n, total) {
    const from = { gps: "your location", home: "your home address", custom: "the point you picked" }[session.originMode];
    const head = `${n} of ${total} ${total === 1 ? "request matches" : "requests match"} your filters`;
    if (session.originStatus === "pending") return `${head}. Finding your location…`;
    if (session.originStatus === "failed") return `${head}. ${session.originNote}`;
    return `${head}, closest to ${from} first.${session.originNote ? " " + session.originNote : ""}`;
}

function emptyText(total) {
    if (!total) return "No one has posted a ride request yet. Post yours with the button on the map.";
    if (filters.area) return "No matching requests in this area. Clear the area filter to see others.";
    return "No requests match these filters. Try a larger radius or turn off Same campus.";
}

function card(r, own) {
    const open = openCard === r.id;
    const badge = own ? `<span class="badge own">Your request</span>`
        : r._dist !== null ? `<span class="badge">${r._dist.toFixed(1)} km away</span>` : "";
    const where = r._area ? r._area.name : "Area unknown";
    return `<article class="card${open ? " open" : ""}${own ? " own" : ""}" data-id="${escapeHtml(r.id)}">
        <button type="button" class="card-head" aria-expanded="${open}">
            <span class="card-name">${escapeHtml(r.name || "Student")}</span>${badge}
        </button>
        <p class="card-meta">${escapeHtml(where)}, posted ${timeAgo(toTime(r.createdAt))}</p>
        <div class="card-body"${open ? "" : " hidden"}>
            <p class="card-dest">Going to ${escapeHtml(r.campus || "a campus not given")}</p>
            ${r.comment ? `<p class="card-comment">${escapeHtml(r.comment)}</p>` : ""}
            ${own ? `<button type="button" class="btn quiet" data-action="edit">Edit or remove</button>` : action(r)}
        </div>
    </article>`;
}

function action(r) {
    const sent = session.outgoing.get(r.id);
    if (!sent) return `<button type="button" class="btn primary" data-action="send">Ask to ride together</button>`;
    if (sent.status === "accepted") return `<p class="contact-box">${escapeHtml(r.name)} accepted. Contact: <strong>${escapeHtml(sent.receiverContact)}</strong></p>`;
    if (sent.status === "declined") return `<p class="status-note">${escapeHtml(r.name)} declined your request.</p>`;
    return `<p class="status-note">Request sent. Their contact appears here once they accept.</p>`;
}

listEl.addEventListener("click", async (e) => {
    const cardEl = e.target.closest(".card");
    if (!cardEl) return;
    const id = cardEl.dataset.id;
    const r = session.requests.find((x) => x.id === id);

    if (e.target.closest(".card-head")) {
        openCard = openCard === id ? null : id;
        render();
        const area = r && assignArea(r);
        if (openCard && area) emit("map:focus", { areaId: area.id });
        return;
    }
    const btn = e.target.closest("[data-action]");
    if (!btn || !r) return;
    if (btn.dataset.action === "edit") return emit("request-popup:open");
    if (btn.dataset.action === "send") {
        btn.disabled = true;
        btn.textContent = "Sending…";
        try {
            await sendRideRequest(withMeta(r));
        } catch (err) {
            console.error("Sending request failed:", err);
            btn.disabled = false;
            btn.textContent = "Couldn't send. Try again";
        }
    }
});

// One ride request per sender/receiver pair: ride_requests/{senderId}_{receiverId}.
// The notifications listener picks up the new doc and updates the button.
export async function sendRideRequest(target) {
    const me = session.user;
    await setDoc(doc(db, "ride_requests", `${me.uid}_${target.id}`), {
        senderId: me.uid,
        senderName: me.name,
        senderComment: session.myRequest?.comment || "Hi! I'm heading the same way and would like to carpool.",
        receiverId: target.id,
        receiverName: target.name || "Student",
        receiverContact: "",
        distanceKm: target._dist !== null ? Math.round(target._dist * 10) / 10 : null,
        status: "pending",
        createdAt: serverTimestamp(),
    });
}
