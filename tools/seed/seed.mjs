#!/usr/bin/env node
// Admin tool: wipe the CoRide database and/or fill it with mock ride requests.
// Runs on your computer with a Firebase service account key, which bypasses
// the security rules. Never commit the key. See README.md in this folder.
//
//   node seed.mjs --dry-run                 preview the mock data, touches nothing
//   node seed.mjs --wipe --mocks 500        wipe Firestore, then add 500 mocks
//   node seed.mjs --wipe-mocks              delete only mock requests (mock_*)
//   node seed.mjs --wipe --wipe-auth        also delete every login account
//
// Destructive runs show what will happen and stop unless you add --yes.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { AREAS, CAMPUS_NAMES, campusCoords, distanceKm, nearestArea } from "../../js/geo.js";

// ---------------- options ----------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const opts = {
    dryRun: flag("--dry-run"),
    wipe: flag("--wipe"),
    wipeMocks: flag("--wipe-mocks"),
    wipeAuth: flag("--wipe-auth"),
    mocks: flag("--mocks") ? Number(value("--mocks", 500)) : 0,
    seed: Number(value("--seed", 2026)),
    key: value("--key", new URL("./serviceAccountKey.json", import.meta.url).pathname),
    yes: flag("--yes"),
};
if (opts.dryRun && !opts.mocks) opts.mocks = 500;
if (!opts.dryRun && !opts.wipe && !opts.wipeMocks && !opts.wipeAuth && !opts.mocks) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).join("\n").replace(/^\/\/ ?/gm, ""));
    process.exit(0);
}

// ---------------- mock data ----------------
// Small seeded random generator so every run produces the same data.
function rng(seed) {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}
const rand = rng(opts.seed);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
function weighted(items, weightOf) {
    const ws = items.map(weightOf);
    let r = rand() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i];
    return items[items.length - 1];
}

// How many people live in each neighbourhood (relative), and how spread out it is (km).
const AREA_WEIGHT = {
    kirkland: 2, "ile-bizard": 1, pierrefonds: 3, ddo: 2.5, "pointe-claire": 2.5, beaconsfield: 1.5,
    "sainte-anne": 1, dorval: 1.5, "saint-laurent": 4, ahuntsic: 4, lachine: 2, lasalle: 3, verdun: 3,
    ndg: 5, westmount: 1, "mont-royal": 1, outremont: 1, downtown: 3, plateau: 4, rosemont: 4,
    villeray: 4, hochelaga: 3, "montreal-nord": 3, "saint-leonard": 2.5, laval: 6, longueuil: 5,
};
const AREA_SPREAD = { laval: 3.2, longueuil: 2.6, pierrefonds: 1.4, "saint-laurent": 1.3, ahuntsic: 1.3 };

// Relative size of each school.
const CAMPUS_SIZE = {
    "McGill University": 5, "Concordia University": 5, "Université de Montréal (UdeM)": 5,
    "UQAM (Université du Québec à Montréal)": 4, "Polytechnique Montréal": 1.5, "HEC Montréal": 1.5,
    "ÉTS (École de technologie supérieure)": 1.5, "John Abbott College": 2.5, "Marianopolis College": 1,
    "Collège Jean-de-Brébeuf": 1, "Dawson College": 3, "Vanier College": 2.5, "Cégep du Vieux Montréal": 2.5,
    "Collège de Maisonneuve": 2.5, "Cégep Saint-Laurent": 1, "Collège Ahuntsic": 2.5, "Collège André-Grasset": 1,
    "Cégep Marie-Victorin": 1, "Collège Montmorency": 2.5, "Cégep Édouard-Montpetit": 2.5,
};

const FIRST = ["Alex", "Camille", "Maya", "Noah", "Léa", "Omar", "Chloé", "Samuel", "Inès", "Gabriel", "Emma", "Thomas",
    "Sofia", "William", "Amélie", "Mohamed", "Jade", "Raphaël", "Yasmine", "Félix", "Aïcha", "Liam", "Rosalie", "Ethan",
    "Mia", "Antoine", "Zoé", "Nathan", "Laurence", "Kevin", "Priya", "Arjun", "Mei", "Wei", "Daniela", "Mateo", "Fatima",
    "Youssef", "Olivia", "Jacob", "Charlotte", "Xavier", "Élodie", "Hugo", "Sarah", "Adam", "Clara", "Louis", "Anaïs",
    "Victor", "Malik", "Nadia", "Benjamin", "Juliette", "Ali", "Hana", "Lucas", "Maëlle", "Marc-Antoine", "Justine"];
const LAST = ["Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "Gauthier", "Morin", "Lavoie", "Fortin", "Gagné",
    "Ouellet", "Pelletier", "Bélanger", "Lévesque", "Bergeron", "Leblanc", "Paquette", "Girard", "Simard", "Boucher",
    "Nguyen", "Tran", "Chen", "Wang", "Patel", "Singh", "Khan", "Haddad", "Benali", "Diallo", "Rossi", "Russo",
    "Silva", "Santos", "Martinez", "Garcia", "Smith", "Brown", "Wilson", "Kowalski", "Papadopoulos", "Joseph", "Pierre",
    "Jean-Baptiste", "Dubois", "Lefebvre", "Mercier", "Poirier", "Cohen", "Kim"];
const SCHEDULE = ["Weekdays around 7:30 AM", "Mon/Wed/Fri, 8 AM classes", "Tue/Thu, first class at 10 AM",
    "Monday to Friday, around 8 AM", "Mornings at 9, back home after 5 PM", "Mon/Tue/Thu, evening classes until 9 PM",
    "Wed and Fri only, around 11 AM", "Every weekday, flexible hours", "Afternoons, leaving around 1 PM",
    "Early mornings, 7 AM labs on Tuesdays"];
const EXTRA = ["Can chip in for gas.", "I have a car and can drive twice a week.", "Happy to split a taxi.",
    "Non-smoker, quiet rides preferred.", "Looking for a regular carpool for the semester.", "Can pick people up on the way.",
    "Need a ride back too if possible.", "First year, would love to meet people from my area.", "", ""];

function makeMock(i) {
    const area = weighted(AREAS, (a) => AREA_WEIGHT[a.id] || 1);
    const spread = AREA_SPREAD[area.id] || 0.9;
    // Scatter around the neighbourhood centre (km -> degrees at Montreal's
    // latitude). Re-draw until the point still belongs to this neighbourhood,
    // so wide areas like Laval don't spill across the river into Montreal.
    let lat = area.lat, lng = area.lng;
    for (let tries = 0; tries < 20; tries++) {
        const tLat = area.lat + (gauss() * spread) / 111;
        const tLng = area.lng + (gauss() * spread) / 78;
        if (nearestArea(tLat, tLng)?.id === area.id) { lat = tLat; lng = tLng; break; }
    }
    const home = area;
    // Closer schools are much more likely (people commute to what's near).
    const campus = weighted(CAMPUS_NAMES, (c) => {
        const [clat, clng] = campusCoords(c);
        return (CAMPUS_SIZE[c] || 1) * Math.exp(-distanceKm(lat, lng, clat, clng) / 9);
    });
    const extra = pick(EXTRA);
    const gender = weighted(["Female", "Male", "Other", null], (g) => ({ Female: 44, Male: 40, Other: 4 })[g] ?? 12);
    const doc = {
        name: `${pick(FIRST)} ${pick(LAST)}`,
        campus,
        comment: extra ? `${pick(SCHEDULE)}. ${extra}` : `${pick(SCHEDULE)}.`,
        area: home.id,
        startingAddress: `Mock address near ${home.name}, QC`,   // never displayed; lat/lng drive matching
        lat: Math.round(lat * 1e5) / 1e5,
        lng: Math.round(lng * 1e5) / 1e5,
        createdAt: Date.now() - Math.floor(rand() * 14 * 24 * 3600 * 1000),   // within the last 2 weeks
    };
    if (gender) doc.gender = gender;
    return { id: `mock_${String(i + 1).padStart(4, "0")}`, data: doc };
}

const mocks = Array.from({ length: opts.mocks }, (_, i) => makeMock(i));

function stats() {
    const count = (key) => mocks.reduce((m, { data }) => m.set(data[key] ?? "(none)", (m.get(data[key] ?? "(none)") || 0) + 1), new Map());
    const show = (title, m) => {
        console.log(`\n${title}`);
        [...m.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
    };
    show("Requests per neighbourhood", count("area"));
    show("Requests per campus", count("campus"));
    show("Gender", count("gender"));
}

// ---------------- dry run ----------------
if (opts.dryRun) {
    stats();
    const out = new URL("./mock-requests.preview.json", import.meta.url).pathname;
    writeFileSync(out, JSON.stringify(mocks, null, 2));
    console.log(`\nDry run: nothing was changed. ${mocks.length} mock requests written to ${out} for review.`);
    process.exit(0);
}

// ---------------- connect ----------------
if (!existsSync(opts.key)) {
    console.error(`No service account key found at ${opts.key}\nDownload it from Firebase console > Project settings > Service accounts > Generate new private key, and save it there (or pass --key path).`);
    process.exit(1);
}
let initializeApp, cert, getFirestore, Timestamp, getAuth;
try {
    ({ initializeApp, cert } = await import("firebase-admin/app"));
    ({ getFirestore, Timestamp } = await import("firebase-admin/firestore"));
    ({ getAuth } = await import("firebase-admin/auth"));
} catch {
    console.error("firebase-admin isn't installed. Run `npm install` in this folder first.");
    process.exit(1);
}
const key = JSON.parse(readFileSync(opts.key, "utf8"));
initializeApp({ credential: cert(key) });
const db = getFirestore();
const auth = getAuth();
const COLLECTIONS = ["users", "requests", "ride_requests"];

// ---------------- plan + confirmation ----------------
const counts = {};
for (const c of COLLECTIONS) counts[c] = (await db.collection(c).count().get()).data().count;
const mockCount = (await db.collection("requests").where("__name__", ">=", "mock_").where("__name__", "<", "mock`").count().get()).data().count;

console.log(`\nProject: ${key.project_id}`);
console.log(`Currently: ${COLLECTIONS.map((c) => `${counts[c]} ${c}`).join(", ")} (${mockCount} of the requests are mocks)\n`);
console.log("This run will:");
if (opts.wipe) console.log(`  - DELETE every document in ${COLLECTIONS.join(", ")}`);
else if (opts.wipeMocks) console.log(`  - DELETE the ${mockCount} mock requests (IDs starting with mock_) and ride requests sent to them`);
if (opts.wipeAuth) console.log("  - DELETE every login account in Firebase Authentication");
if (opts.mocks) console.log(`  - ADD ${opts.mocks} mock requests (seed ${opts.seed})`);
if (!opts.yes) {
    console.log("\nNothing changed yet. Run the same command again with --yes to do it.");
    process.exit(0);
}

// ---------------- do it ----------------
if (opts.wipe) {
    for (const c of COLLECTIONS) {
        await db.recursiveDelete(db.collection(c));
        console.log(`Deleted ${counts[c]} documents from ${c}`);
    }
} else if (opts.wipeMocks) {
    const snap = await db.collection("requests").where("__name__", ">=", "mock_").where("__name__", "<", "mock`").get();
    const toMocks = await db.collection("ride_requests").get();
    const w = db.bulkWriter();
    snap.docs.forEach((d) => w.delete(d.ref));
    toMocks.docs.filter((d) => String(d.data().receiverId).startsWith("mock_")).forEach((d) => w.delete(d.ref));
    await w.close();
    console.log(`Deleted ${snap.size} mock requests`);
}

if (opts.wipeAuth) {
    let total = 0, pageToken;
    do {
        const page = await auth.listUsers(1000, pageToken);
        if (page.users.length) {
            await auth.deleteUsers(page.users.map((u) => u.uid));
            total += page.users.length;
        }
        pageToken = page.pageToken;
    } while (pageToken);
    console.log(`Deleted ${total} login accounts`);
}

if (opts.mocks) {
    const w = db.bulkWriter();
    for (const { id, data } of mocks) {
        w.set(db.collection("requests").doc(id), { ...data, createdAt: Timestamp.fromMillis(data.createdAt) });
    }
    await w.close();
    console.log(`Added ${mocks.length} mock requests`);
}
console.log("Done.");
process.exit(0);
