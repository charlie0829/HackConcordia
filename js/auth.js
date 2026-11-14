// Sign up / log in / log out, and the signed-in user's profile.
// (Owner: requestID teammate)
import {
    auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
    onAuthStateChanged, doc, setDoc, getDoc, serverTimestamp
} from "./firebase.js";
import { session, emit, $ } from "./state.js";

const authView = $("authView");
const appView = $("appView");
const registerForm = $("registerForm");
const loginForm = $("loginForm");

// --- Tabs ---
function showTab(which) {
    const reg = which === "register";
    $("tabRegister").setAttribute("aria-selected", reg);
    $("tabLogin").setAttribute("aria-selected", !reg);
    registerForm.hidden = !reg;
    loginForm.hidden = reg;
    $("regStatusMsg").textContent = "";
    $("loginStatusMsg").textContent = "";
}
$("tabRegister").addEventListener("click", () => showTab("register"));
$("tabLogin").addEventListener("click", () => showTab("login"));

function passwordError(pw) {
    if (pw.length < 8) return "Use at least 8 characters.";
    if (!/[A-Z]/.test(pw)) return "Add at least one uppercase letter.";
    if (!/[a-z]/.test(pw)) return "Add at least one lowercase letter.";
    return null;
}

// --- Create account: Firebase Auth + private profile in users/{uid} ---
let registering = false;

registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("regStatusMsg");
    const pwMsg = $("regPasswordError");
    msg.textContent = "";
    pwMsg.textContent = "";

    const email = $("regEmail").value.trim();
    const password = $("regPassword").value;
    const name = $("fullName").value.trim();
    const address = $("address").value.trim();
    const campus = $("campus").value;

    const pwErr = passwordError(password);
    if (pwErr) { pwMsg.textContent = pwErr; $("regPassword").focus(); return; }
    if (password !== $("regConfirmPassword").value) {
        msg.textContent = "The two passwords don't match.";
        $("regConfirmPassword").focus();
        return;
    }

    const btn = $("regSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Creating account…";
    registering = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const profile = { name, email, address, campus, createdAt: serverTimestamp() };
        await setDoc(doc(db, "users", cred.user.uid), profile);
        startSession(cred.user.uid, profile);
    } catch (err) {
        console.error("Registration error:", err);
        msg.textContent =
            err.code === "auth/email-already-in-use" ? "This email already has an account. Log in instead." :
            err.code === "auth/invalid-email" ? "Enter a valid email address." :
            err.code === "auth/weak-password" ? "Choose a stronger password." :
            "Couldn't create the account. Check your connection and try again.";
    } finally {
        registering = false;
        btn.disabled = false;
        btn.textContent = "Create account";
    }
});

// --- Log in (onAuthStateChanged below opens the app) ---
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginSubmitBtn");
    $("loginStatusMsg").textContent = "";
    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
        await signInWithEmailAndPassword(auth, $("loginEmail").value.trim(), $("loginPassword").value);
    } catch (err) {
        console.error("Login failed:", err);
        $("loginStatusMsg").textContent = "Wrong email or password. Try again.";
    } finally {
        btn.disabled = false;
        btn.textContent = "Log in";
    }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

// --- Session: also restores a signed-in user after a page refresh ---
onAuthStateChanged(auth, async (user) => {
    document.body.classList.remove("booting");
    if (!user) return endSession();
    if (registering) return;   // the register handler starts the session itself
    let profile = null;
    try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) profile = snap.data();
    } catch (err) {
        console.warn("Couldn't load profile:", err);
    }
    startSession(user.uid, profile || { name: user.email.split("@")[0], email: user.email });
});

function startSession(uid, p) {
    if (session.user && session.user.uid === uid) return;
    session.user = {
        uid,
        name: p.name || "Student",
        email: p.email || auth.currentUser?.email || "",
        campus: p.campus || "",
        address: p.address || "",
    };
    $("activeUserName").textContent = session.user.name;
    authView.hidden = true;
    appView.hidden = false;
    emit("session:start", session.user);
}

function endSession() {
    const wasIn = !!session.user;
    session.user = null;
    appView.hidden = true;
    authView.hidden = false;
    registerForm.reset();
    loginForm.reset();
    if (wasIn) emit("session:end");
}
