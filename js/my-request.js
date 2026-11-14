// Post / remove the user's ride request: at most one per account, stored at
// requests/{uid}. (Owner: requestID teammate)
import { db, doc, setDoc, deleteDoc, serverTimestamp } from "./firebase.js";
import { session, on, $ } from "./state.js";
import { geocode, nearestArea } from "./geo.js";

const popup = $("requestPopup");
const form = $("requestForm");
const submitBtn = $("submitReqBtn");
const removeBtn = $("removePostBtn");
const feedback = $("feedbackMsg");
const fields = ["startingAddressInput", "commentInput", "genderInput"].map($);

function open() {
    popup.hidden = false;
    renderState();
    (session.myRequest ? $("closePopupBtn") : $("startingAddressInput")).focus();
}
function close() {
    popup.hidden = true;
    $("openPopupBtn").focus();
}

$("openPopupBtn").addEventListener("click", open);
$("closePopupBtn").addEventListener("click", close);
popup.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
on("request-popup:open", open);

function say(kind, text) {
    feedback.className = "status " + kind;
    feedback.textContent = text;
}

// Switch between "post" and "you already have a request" states.
let hadRequest = false;
function renderState() {
    const mine = session.myRequest;
    if (mine) {
        $("startingAddressInput").value = mine.startingAddress || "";
        $("commentInput").value = mine.comment || "";
        $("genderInput").value = mine.gender || "";
        fields.forEach((f) => (f.disabled = true));
        submitBtn.hidden = true;
        removeBtn.hidden = false;
        $("popupSubtext").textContent = "Your request is on the map. Remove it if you want to post a new one.";
        $("openPopupBtn").textContent = "Your ride request";
    } else {
        if (hadRequest) form.reset();
        fields.forEach((f) => (f.disabled = false));
        submitBtn.hidden = false;
        removeBtn.hidden = true;
        $("popupSubtext").textContent = "Only your name, neighbourhood, campus and comment are shown. Your exact address is used for matching and never displayed.";
        $("openPopupBtn").textContent = "Post a ride request";
    }
    hadRequest = !!mine;
}
on("requests:change", renderState);
on("session:start", () => { hadRequest = true; renderState(); popup.hidden = true; say("", ""); });

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = session.user;
    if (!user) return;
    const address = $("startingAddressInput").value.trim();
    const comment = $("commentInput").value.trim();
    const gender = $("genderInput").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Finding your address…";
    say("", "");
    try {
        const coords = await geocode(address);
        if (coords.error === "service") {
            say("err", "The address lookup service isn't responding. Wait a minute and try again.");
            return;
        }
        if (coords.error) {
            say("err", "We couldn't find that address. Check the spelling and use the format: street number and name, city (e.g. 12 Rue Mercier, Kirkland).");
            return;
        }
        const area = nearestArea(coords.lat, coords.lng);
        if (!area) {
            say("err", "That address is outside the Montreal area this app covers.");
            return;
        }
        submitBtn.textContent = "Posting…";
        const data = {
            name: user.name,                 // shown
            campus: user.campus,             // shown
            comment,                         // shown
            area: area.id,                   // shown as the neighbourhood pin
            startingAddress: address,        // match-making only, never shown
            lat: coords.lat,                 // match-making only, never shown
            lng: coords.lng,                 // match-making only, never shown
            createdAt: serverTimestamp(),
        };
        if (gender) data.gender = gender;    // optional, used by the gender filter
        await setDoc(doc(db, "requests", user.uid), data);   // same ID = max one per account
        say("ok", coords.precision === "area"
            ? `Posted. We couldn't pinpoint the street, so we used the centre of ${area.name}. Distances to you will be approximate.`
            : `Posted. You now count toward the ${area.name} pin.`);
        setTimeout(() => { if (!popup.hidden) close(); say("", ""); }, coords.precision === "area" ? 5000 : 1600);
    } catch (err) {
        console.error("Posting request failed:", err);
        say("err", err.code === "permission-denied"
            ? "The database refused this request. Make sure the latest firestore.rules are published in the Firebase console."
            : "Couldn't post your request. Check your connection and try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Post request";
    }
});

removeBtn.addEventListener("click", async () => {
    if (!session.user) return;
    if (!confirm("Remove your ride request from the map?")) return;
    removeBtn.disabled = true;
    removeBtn.textContent = "Removing…";
    try {
        await deleteDoc(doc(db, "requests", session.user.uid));
        say("ok", "Your request was removed.");
    } catch (err) {
        console.error("Removing request failed:", err);
        say("err", "Couldn't remove your request. Try again.");
    } finally {
        removeBtn.disabled = false;
        removeBtn.textContent = "Remove my request";
    }
});
