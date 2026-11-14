// The map: neighbourhood pins with a count of matching requests (precise
// locations of other people are never drawn), plus the user's own start point
// and search radius. Draws what list.js sends via "map:render"; clicking a pin
// sends "area:select" back. (Owner: map / you)
import { on, emit, escapeHtml, $ } from "./state.js";
import { AREA_BY_ID, assignArea, campusCoords } from "./geo.js";

let map = null, pinLayer, campusLayer, originMarker = null, radiusCircle = null;
let view = { requests: [], selectedArea: null, homeArea: null, campus: null, origin: null, originMode: "gps", radiusKm: null };
let fitted = false;
let focused = null;

const ORIGIN_LABEL = { gps: "You are here", home: "Home", custom: "Start point" };

function init() {
    map = L.map("map", { zoomControl: false }).setView([45.48, -73.75], 11);
    L.control.zoom({ position: "bottomleft" }).addTo(map);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    campusLayer = L.layerGroup().addTo(map);
    pinLayer = L.layerGroup().addTo(map);
    const syncZoom = () => map.getContainer().classList.toggle("zoomed-out", map.getZoom() < 13);
    map.on("zoomend", syncZoom);
    syncZoom();

    // In "a point on the map" mode, clicking empty map moves the start point.
    // (Clicks on pins don't reach here, so pins still work.)
    map.on("click", (e) => {
        if (view.originMode === "custom") emit("origin:set-custom", { lat: e.latlng.lat, lng: e.latlng.lng });
    });
    window.addEventListener("resize", () => map.invalidateSize());
}

on("session:start", () => {
    if (!map) init();
    else requestAnimationFrame(() => map.invalidateSize());
    fitted = false;
    focused = null;
});

on("session:end", () => {
    if (originMarker) { originMarker.remove(); originMarker = null; }
    if (radiusCircle) { radiusCircle.remove(); radiusCircle = null; }
});

on("map:render", (d) => {
    const modeChanged = d.originMode !== view.originMode;
    const prevOrigin = view.origin;
    view = d;
    if (!map) return;
    draw();
    drawOrigin();

    if (!fitted && (d.requests.length || d.origin)) {
        fitted = true;
        const pts = [...new Set(d.requests.map((r) => assignArea(r)).filter(Boolean))].map((a) => [a.lat, a.lng]);
        const c = d.campus && campusCoords(d.campus);
        if (c) pts.push(c);
        if (d.origin) pts.push([d.origin.lat, d.origin.lng]);
        const pad = map.getSize().x < 500 ? 30 : 80;
        if (pts.length > 1) map.fitBounds(pts, { padding: [pad, pad], maxZoom: 12 });
        else if (pts.length) map.setView(pts[0], 12);
    } else if (d.origin && (modeChanged || (!prevOrigin && d.origin)) && d.originMode !== "custom") {
        // Switched to "my location" / "home": bring the new start point into view.
        if (!map.getBounds().contains([d.origin.lat, d.origin.lng])) map.panTo([d.origin.lat, d.origin.lng]);
    }
});

on("map:focus", ({ areaId }) => {
    const a = AREA_BY_ID.get(areaId);
    if (!a || !map) return;
    focused = areaId;
    draw();
    map.flyTo([a.lat, a.lng], Math.max(map.getZoom(), 12), { duration: 0.6 });
});

function draw() {
    const groups = new Map();
    for (const r of view.requests) {
        const a = assignArea(r);
        if (!a) continue;
        if (!groups.has(a.id)) groups.set(a.id, { area: a, n: 0 });
        groups.get(a.id).n++;
    }
    const max = Math.max(1, ...[...groups.values()].map((g) => g.n));

    pinLayer.clearLayers();
    for (const { area, n } of groups.values()) {
        const size = Math.round(30 + 18 * Math.sqrt(n / max));   // 30–48 px
        const cls = ["lm"];
        if (area.id === view.selectedArea) cls.push("is-selected");
        else if (view.selectedArea) cls.push("is-dim");
        if (area.id === view.homeArea) cls.push("is-home");
        if (area.id === focused) cls.push("is-focused");
        const label = `${area.name}: ${n} ${n === 1 ? "request" : "requests"}`;
        const marker = L.marker([area.lat, area.lng], {
            icon: L.divIcon({
                className: "",
                iconSize: null,
                html: `<div class="${cls.join(" ")}" style="--size:${size}px">
                         <span class="lm-count">${n}</span>
                         <span class="lm-name">${escapeHtml(area.name)}</span>
                       </div>`
            }),
            title: label,
            alt: label,
            keyboard: true,
            riseOnHover: true,
            zIndexOffset: area.id === view.selectedArea ? 1000 : n,
        });
        marker.on("click", () => emit("area:select", area.id === view.selectedArea ? null : area.id));
        marker.addTo(pinLayer);
    }

    campusLayer.clearLayers();
    const c = view.campus && campusCoords(view.campus);
    if (c) {
        L.marker(c, {
            icon: L.divIcon({ className: "", iconSize: null, html: `<div class="campus-pin">${escapeHtml(view.campus)}</div>` }),
            interactive: false,
        }).addTo(campusLayer);
    }
}

// The user's own start point: a marker (draggable in custom mode) and a
// dashed circle for the "Within" distance. Only this user ever sees it.
function drawOrigin() {
    const o = view.origin;
    const custom = view.originMode === "custom";
    $("mapHint").hidden = !custom;
    map.getContainer().classList.toggle("picking", custom);

    if (!o) {
        if (originMarker) { originMarker.remove(); originMarker = null; }
        if (radiusCircle) { radiusCircle.remove(); radiusCircle = null; }
        return;
    }
    const ll = [o.lat, o.lng];
    const icon = L.divIcon({
        className: "",
        iconSize: null,
        html: `<div class="origin-pin${custom ? " is-custom" : ""}">
                 <span class="origin-dot"></span>
                 <span class="origin-label">${ORIGIN_LABEL[view.originMode] || "Start point"}</span>
               </div>`
    });

    if (!originMarker) {
        originMarker = L.marker(ll, { icon, draggable: custom, zIndexOffset: -1000, keyboard: false, title: "Your start point" }).addTo(map);
        originMarker.on("dragend", () => {
            const p = originMarker.getLatLng();
            emit("origin:set-custom", { lat: p.lat, lng: p.lng });
        });
    } else {
        originMarker.setLatLng(ll);
        originMarker.setIcon(icon);
        if (custom) originMarker.dragging.enable(); else originMarker.dragging.disable();
    }

    if (view.radiusKm) {
        const opts = { radius: view.radiusKm * 1000, color: "#18303F", weight: 2, dashArray: "6 6", fillColor: "#FFC21A", fillOpacity: 0.08, interactive: false };
        if (!radiusCircle) radiusCircle = L.circle(ll, opts).addTo(map);
        else { radiusCircle.setLatLng(ll); radiusCircle.setRadius(opts.radius); }
    } else if (radiusCircle) {
        radiusCircle.remove();
        radiusCircle = null;
    }
}
