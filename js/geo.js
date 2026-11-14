// Neighbourhoods, campuses, distances and address lookup. (Owner: map / you)
import { isNum } from "./state.js";

// Neighbourhood landmarks. Requests are always shown at their landmark,
// never at the precise address.
export const AREAS = [
    { id: "kirkland",      name: "Kirkland",                lat: 45.4500, lng: -73.8667 },
    { id: "ile-bizard",    name: "Île-Bizard",              lat: 45.4950, lng: -73.8900 },
    { id: "pierrefonds",   name: "Pierrefonds-Roxboro",     lat: 45.4897, lng: -73.8467 },
    { id: "ddo",           name: "Dollard-des-Ormeaux",     lat: 45.4944, lng: -73.8247 },
    { id: "pointe-claire", name: "Pointe-Claire",           lat: 45.4486, lng: -73.8167 },
    { id: "beaconsfield",  name: "Beaconsfield",            lat: 45.4314, lng: -73.8650 },
    { id: "sainte-anne",   name: "Sainte-Anne-de-Bellevue", lat: 45.4039, lng: -73.9525 },
    { id: "dorval",        name: "Dorval",                  lat: 45.4475, lng: -73.7500 },
    { id: "saint-laurent", name: "Saint-Laurent",           lat: 45.5076, lng: -73.6950 },
    { id: "ahuntsic",      name: "Ahuntsic-Cartierville",   lat: 45.5500, lng: -73.6700 },
    { id: "lachine",       name: "Lachine",                 lat: 45.4400, lng: -73.6800 },
    { id: "lasalle",       name: "LaSalle",                 lat: 45.4300, lng: -73.6300 },
    { id: "verdun",        name: "Verdun",                  lat: 45.4580, lng: -73.5700 },
    { id: "ndg",           name: "Côte-des-Neiges–NDG",     lat: 45.4800, lng: -73.6200 },
    { id: "westmount",     name: "Westmount",               lat: 45.4850, lng: -73.5960 },
    { id: "mont-royal",    name: "Mount Royal",             lat: 45.5160, lng: -73.6430 },
    { id: "outremont",     name: "Outremont",               lat: 45.5150, lng: -73.6080 },
    { id: "downtown",      name: "Downtown",                lat: 45.5017, lng: -73.5673 },
    { id: "plateau",       name: "Plateau",                 lat: 45.5225, lng: -73.5800 },
    { id: "rosemont",      name: "Rosemont",                lat: 45.5450, lng: -73.5850 },
    { id: "villeray",      name: "Villeray",                lat: 45.5450, lng: -73.6250 },
    { id: "hochelaga",     name: "Hochelaga",               lat: 45.5470, lng: -73.5400 },
    { id: "montreal-nord", name: "Montréal-Nord",           lat: 45.6000, lng: -73.6300 },
    { id: "saint-leonard", name: "Saint-Léonard",           lat: 45.5850, lng: -73.5950 },
    { id: "laval",         name: "Laval",                   lat: 45.5700, lng: -73.7200 },
    { id: "longueuil",     name: "Longueuil",               lat: 45.5310, lng: -73.5180 },
];
export const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]));

// Approximate campus locations, keyed by the exact names in the sign-up form.
const CAMPUS_LIST = {
    "McGill University": [45.5048, -73.5772],
    "Concordia University": [45.4973, -73.5790],
    "Université de Montréal (UdeM)": [45.5017, -73.6153],
    "UQAM (Université du Québec à Montréal)": [45.5130, -73.5600],
    "Polytechnique Montréal": [45.5045, -73.6130],
    "HEC Montréal": [45.5030, -73.6210],
    "ÉTS (École de technologie supérieure)": [45.4946, -73.5622],
    "John Abbott College": [45.4065, -73.9425],
    "Marianopolis College": [45.4790, -73.6040],
    "Collège Jean-de-Brébeuf": [45.5050, -73.6260],
    "Dawson College": [45.4890, -73.5860],
    "Vanier College": [45.5140, -73.6750],
    "Cégep du Vieux Montréal": [45.5140, -73.5620],
    "Collège de Maisonneuve": [45.5520, -73.5420],
    "Cégep Saint-Laurent": [45.5145, -73.6780],
    "Collège Ahuntsic": [45.5520, -73.6400],
    "Collège André-Grasset": [45.5490, -73.6280],
    "Cégep Marie-Victorin": [45.6180, -73.6060],
    "Collège Montmorency": [45.5600, -73.7200],
    "Cégep Édouard-Montpetit": [45.5360, -73.5100],
};

// "Île-Bizard" -> "ile bizard"
export function norm(s) {
    return String(s || "").toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

export const CAMPUS_NAMES = Object.keys(CAMPUS_LIST);
const CAMPUS_BY_NORM = new Map(Object.entries(CAMPUS_LIST).map(([k, v]) => [norm(k), v]));
export const campusCoords = (name) => CAMPUS_BY_NORM.get(norm(name)) || null;

export function distanceKm(aLat, aLng, bLat, bLng) {
    const R = 6371, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearest landmark, or null if the point is far outside Montreal.
export function nearestArea(lat, lng) {
    let best = null, bestD = Infinity;
    for (const a of AREAS) {
        const d = distanceKm(lat, lng, a.lat, a.lng);
        if (d < bestD) { best = a; bestD = d; }
    }
    return bestD <= 25 ? best : null;
}

// Which landmark a request belongs to: the stored area id, else its lat/lng.
export function assignArea(r) {
    if (r && r.area && AREA_BY_ID.has(r.area)) return AREA_BY_ID.get(r.area);
    if (r && isNum(r.lat) && isNum(r.lng)) return nearestArea(r.lat, r.lng);
    return null;
}

// Address -> { lat, lng, precision } using free OpenStreetMap lookups.
//   precision "street": the address itself was found
//   precision "area":   only the town/borough was found (approximate point)
// Returns { error: "not-found" } or { error: "service" } when it fails.
// Results are cached in this browser.
const CACHE_KEY = "carpool.geocache.v3";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch {}

const VIEWBOX = "-74.10,45.75,-73.35,45.35";   // Greater Montreal, as a preference
const POSTAL = /\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/g;
const TAIL = /,?\s*(qc|qu[eé]bec|canada)\.?\s*$/i;

// "1104 Rue Bellevue, L'Île-Bizard–Sainte-Geneviève, QC H9C 1A1, Canada"
//   -> street "1104 Rue Bellevue", place "L'Île-Bizard–Sainte-Geneviève"
function splitAddress(address) {
    let a = address.replace(POSTAL, " ").replace(/\s+/g, " ").trim();
    for (let i = 0; i < 3; i++) a = a.replace(TAIL, "").trim();
    const parts = a.split(",").map((x) => x.trim()).filter(Boolean);
    return { clean: parts.join(", "), street: parts[0] || "", place: parts[1] || "" };
}

// Nominatim allows about 1 request per second.
let lastNominatim = 0;
async function nominatim(params) {
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&viewbox="
        + VIEWBOX + "&" + new URLSearchParams(params);
    const res = await fetch(url, { headers: { "Accept-Language": "en,fr" } });
    if (!res.ok) throw new Error("Nominatim " + res.status);
    const data = await res.json();
    return data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
}

// Photon (komoot): a second free OpenStreetMap lookup, more forgiving with typos.
async function photon(q) {
    const res = await fetch("https://photon.komoot.io/api/?limit=1&lat=45.50&lon=-73.65&q=" + encodeURIComponent(q));
    if (!res.ok) throw new Error("Photon " + res.status);
    const f = (await res.json()).features?.[0];
    return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null;
}

export async function geocode(address) {
    const key = norm(address);
    if (!key) return { error: "not-found" };
    if (cache[key]) return cache[key];

    const { clean, street, place } = splitAddress(address);
    // Try the most exact versions first, stop at the first hit.
    const attempts = [
        () => nominatim({ q: address }),
        () => clean !== address ? nominatim({ q: clean }) : null,
        () => street && place ? nominatim({ street, city: place }) : null,
        () => street ? nominatim({ q: `${street}, Montréal` }) : null,   // boroughs inside the City of Montreal
        () => photon(clean || address),
    ];
    let serviceErrors = 0, tried = 0;
    for (const attempt of attempts) {
        try {
            const p = attempt();
            if (!p) continue;
            tried++;
            const hit = await p;
            if (hit) return remember(key, { ...hit, precision: "street" });
        } catch (err) {
            serviceErrors++;
            console.warn("Address lookup failed:", err);
        }
    }
    // Last resort: just the town / borough, so the request still lands on the right pin.
    if (place) {
        try {
            tried++;
            const hit = await nominatim({ q: place });
            if (hit) return remember(key, { ...hit, precision: "area" });
        } catch (err) {
            serviceErrors++;
        }
    }
    return { error: serviceErrors === tried ? "service" : "not-found" };
}

function remember(key, value) {
    cache[key] = value;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
    return value;
}
