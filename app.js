/* FLOODINTEL viewer: shows the measured outputs of our pipeline (Kerala test basin).
   Data come from data/meta.js and data/query.js, written by scripts/01_export_viewer_layers.py. */
(function () {
  "use strict";
  const M = window.META, Q = window.QUERY_GRIDS, HOT = window.HOTSPOTS;
  const G = M.grid, H = M.headline;
  const $ = (s) => document.querySelector(s);
  const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "–" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const area = (km2) => (km2 < 1 ? `${fmt(km2 * 100, 2)} ha` : `${fmt(km2, 2)} km²`);
  const pct = (v, d = 0) => fmt(v * 100, d) + " %";

  // ---------------------------------------------------------------- map
  const bounds = L.latLngBounds(G.bounds);
  const map = L.map("map", { zoomControl: true, preferCanvas: true, maxBounds: bounds.pad(0.6) });
  map.fitBounds(bounds);
  const base = {
    light: L.layerGroup([
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Base map © Esri, HERE, Garmin, © OpenStreetMap contributors" }),
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, pane: "labels" })]),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 18, attribution: "Imagery © Esri" }),
  };
  map.createPane("labels"); map.getPane("labels").style.zIndex = 450; map.getPane("labels").style.pointerEvents = "none";
  base.light.addTo(map);
  document.querySelectorAll("#basemapSeg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#basemapSeg button").forEach((x) => x.classList.toggle("on", x === b));
    Object.values(base).forEach((l) => map.removeLayer(l));
    base[b.dataset.b].addTo(map);
  }));
  L.rectangle(bounds, { color: "#475569", weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(map);

  // ---------------------------------------------------------------- layer registry
  const LAYERS = [];  // {id, group, name, source, legend, overlay, on, opacity, zIndex}
  const pane = (name, z) => { map.createPane(name); map.getPane(name).style.zIndex = z; return name; };
  pane("pD", 410); pane("pS", 420); pane("pO", 430); pane("pNdem", 440);

  function addLayer(def) {
    const L0 = Object.assign({ on: false, opacity: 0.85 }, def);
    L0.overlay = L.imageOverlay(def.png, def.bounds, { opacity: L0.opacity, pane: def.pane, className: "px", interactive: false });
    LAYERS.push(L0);
    return L0;
  }
  const byId = (id) => LAYERS.find((l) => l.id === id);
  const lay = Object.fromEntries(M.layers.map((l) => [l.id, l]));

  // Observed
  const evById = Object.fromEntries(M.events.map((e) => [e.date, e]));
  let curEvent = M.events[0];
  addLayer({ id: "flood", group: "O", pane: "pO", on: true, opacity: 0.9, name: "Flood extent (selected event)",
    source: "Sentinel-1 SAR change detection vs same-orbit dry scene; automatic quality checks",
    legend: { type: "classes", items: [["#1d4ed8", "Flooded (satellite)"]] }, png: curEvent.png, bounds: curEvent.bounds });
  addLayer({ id: "ndem", group: "O", pane: "pNdem", on: true, opacity: 1, name: "Official NDEM flood outline",
    source: "NRSC/ISRO NDEM map for the same event: the reference we validate against",
    legend: { type: "classes", items: [["#facc15", "NDEM outline"]] }, png: curEvent.ndem_png, bounds: curEvent.bounds });
  addLayer(Object.assign({}, lay.perm_water, { pane: "pO", on: true, opacity: 0.8 }));
  // Modelled
  addLayer(Object.assign({}, lay.susceptibility, { pane: "pS", on: false, opacity: 0.75 }));
  addLayer(Object.assign({}, lay.hand, { pane: "pS", on: false, opacity: 0.75 }));
  // Development
  const imp = lay.impervious;
  addLayer(Object.assign({}, imp, { pane: "pD", on: false, opacity: 0.85, png: imp.pngs["2025"] }));
  addLayer(Object.assign({}, lay.uica_ratio, { pane: "pD", on: false, opacity: 0.8 }));
  addLayer(Object.assign({}, lay.duica, { pane: "pD", on: false, opacity: 0.9 }));

  // ---------------------------------------------------------------- left panel
  function renderLayerControls() {
    ["O", "S", "D"].forEach((g) => {
      const box = $("#layers-" + g); box.innerHTML = "";
      LAYERS.filter((l) => l.group === g).forEach((l) => {
        const d = document.createElement("div"); d.className = "layer";
        d.innerHTML = `<label class="layer-row"><input type="checkbox" ${l.on ? "checked" : ""}>
          <span><span class="layer-name">${l.name}</span><span class="prov">${l.source}</span></span></label>
          <input class="opacity" type="range" min="0" max="1" step="0.05" value="${l.opacity}" aria-label="Opacity of ${l.name}">`;
        d.querySelector("input[type=checkbox]").addEventListener("change", (e) => { l.on = e.target.checked; sync(); });
        d.querySelector(".opacity").addEventListener("input", (e) => { l.opacity = +e.target.value; l.overlay.setOpacity(l.opacity); });
        box.appendChild(d);
      });
    });
  }
  function sync() {
    LAYERS.forEach((l) => { if (l.on && !map.hasLayer(l.overlay)) l.overlay.addTo(map); if (!l.on && map.hasLayer(l.overlay)) map.removeLayer(l.overlay); });
    renderLegend();
  }
  function renderLegend() {
    const el = $("#legend"); el.innerHTML = "";
    LAYERS.filter((l) => l.on).forEach((l) => {
      const g = document.createElement("div"); g.className = "lg";
      let h = `<div class="lt">${l.name}${l.id === "impervious" ? " " + curYear : ""}</div>`;
      if (l.legend.type === "classes") h += l.legend.items.map(([c, n]) => `<div class="item"><span class="sw" style="background:${c}"></span>${n}</div>`).join("");
      else h += `<div class="ramp" style="background:linear-gradient(90deg,${l.legend.colors.join(",")})"></div><div class="rl"><span>${l.legend.min}</span><span>${l.legend.max}</span></div>`;
      g.innerHTML = h; el.appendChild(g);
    });
  }

  // event selector
  const sel = $("#eventSelect");
  M.events.forEach((e) => { const o = document.createElement("option"); o.value = e.date; o.textContent = `${e.date} · ${e.platform} · ${fmt(e.flood_km2)} km² flooded`; sel.appendChild(o); });
  sel.addEventListener("change", () => setEvent(evById[sel.value]));
  function setEvent(e) {
    curEvent = e; sel.value = e.date;
    byId("flood").overlay.setUrl(e.png).setBounds(L.latLngBounds(e.bounds));
    byId("ndem").overlay.setUrl(e.ndem_png).setBounds(L.latLngBounds(e.bounds));
    $("#eventHint").textContent = `Agreement with NDEM within 40 m: ${pct(e.gti_40m)} (${fmt(e.lift_40m)}× better than a random map of the same size).`;
    renderSummary(); renderTimeline();
  }

  // imperviousness year slider
  let curYear = 2025, playTimer = null;
  function setYear(y) {
    curYear = y; $("#yearSlider").value = y; $("#yearLabel").textContent = y;
    $("#yearKm2").textContent = `${fmt(imp.km2_by_year[y])} km² paved`;
    byId("impervious").overlay.setUrl(imp.pngs[String(y)]);
    if (!byId("impervious").on) { byId("impervious").on = true; renderLayerControls(); sync(); } else renderLegend();
  }
  $("#yearSlider").addEventListener("input", (e) => setYear(+e.target.value));
  $("#playBtn").addEventListener("click", () => {
    if (playTimer) { clearInterval(playTimer); playTimer = null; $("#playBtn").textContent = "▶ Play 2017→2025"; return; }
    let y = 2017; setYear(y); $("#playBtn").textContent = "■ Stop";
    playTimer = setInterval(() => { y += 1; if (y > 2025) { clearInterval(playTimer); playTimer = null; $("#playBtn").textContent = "▶ Play 2017→2025"; return; } setYear(y); }, 900);
  });
  $("#yearKm2").textContent = `${fmt(imp.km2_by_year["2025"])} km² paved`;

  // ---------------------------------------------------------------- timeline
  function renderTimeline() {
    const tr = $("#tlTrack"); tr.innerHTML = "";
    const t0 = Date.UTC(2017, 0, 1), t1 = Date.UTC(2026, 0, 1);
    const x = (d) => ((Date.parse(d) - t0) / (t1 - t0)) * 100;
    for (let y = 2017; y <= 2025; y++) {
      const p = x(`${y}-07-01`);
      tr.insertAdjacentHTML("beforeend", `<span class="tl-year" style="left:${p}%">${y}</span><span class="tl-tick" style="left:${x(y + "-01-01")}%"></span>`);
    }
    M.timeline.forEach((t) => {
      const d = t.date || t.window[0];
      const b = document.createElement("button"); b.type = "button";
      b.className = `dot ${t.status}` + (t.event === curEvent.id ? " sel" : "");
      b.style.left = x(d) + "%";
      b.title = `${t.event} (${t.kind})\n${t.status.toUpperCase()}: ${t.reason}` + (t.flood_km2 != null ? `\nmapped water ${fmt(t.flood_km2)} km²` : "");
      b.setAttribute("aria-label", b.title);
      if (t.status === "kept") b.addEventListener("click", () => { const e = M.events.find((e) => e.id === t.event); if (e) setEvent(e); });
      tr.appendChild(b);
    });
  }

  // ---------------------------------------------------------------- right panel
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + b.dataset.tab));
    if (hotGroup) { if (b.dataset.tab === "hotspots") hotGroup.addTo(map); else if (b.dataset.tab !== "inspect") map.removeLayer(hotGroup); }
  }));
  function renderSummary() {
    const e = curEvent;
    $("#tab-summary").innerHTML = `
      <h2 style="margin-top:12px">Flood of ${new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</h2>
      <div class="stat-row">
        <div class="stat"><b>${fmt(e.flood_km2)}</b><span>km² flooded (satellite)</span></div>
        <div class="stat"><b>${pct(e.gti_40m)}</b><span>overlap with NDEM (40 m)</span></div>
      </div>
      <dl class="kv">
        <dt>Satellite</dt><dd>${e.platform}, ${e.pass.toLowerCase()} orbit ${e.orbit}</dd>
        <dt>Dry reference scene</dt><dd>${e.dry_reference}</dd>
        <dt>NDEM mapped area</dt><dd>${fmt(e.ndem_km2)} km²</dd>
        <dt>NDEM polygons</dt><dd>${e.ndem_polygons.toLocaleString("en-IN")}</dd>
        <dt>Random-map overlap</dt><dd>${pct(e.random_40m, 1)}</dd>
        <dt>Lift over random</dt><dd>${fmt(e.lift_40m)}×</dd>
      </dl>
      <p class="note">This event passed every automatic check (scene coverage, water threshold, bimodality, minimum area, agreement with NDEM). ${H.events_tested} candidate events were tested and ${H.events_kept} kept; the dots on the timeline show why the others were rejected.</p>`;
  }
  function renderAbout() {
    $("#tab-about").innerHTML = `
      <h2 style="margin-top:12px">What is validated (Kerala test basin)</h2>
      <div class="stat-row">
        <div class="stat"><b>${fmt(H.spatial_auc, 3)}</b><span>AUC on unseen 10 km regions</span></div>
        <div class="stat"><b>${fmt(H.temporal_auc_2019, 2)}</b><span>AUC on the unseen 2019 flood</span></div>
        <div class="stat"><b>${H.events_kept} / ${H.events_tested}</b><span>flood events kept after checks</span></div>
        <div class="stat"><b>${fmt(H.periyar_inflow_km2, 0)}</b><span>km² Periyar inflow (HydroRIVERS ${fmt(H.hydrorivers_km2, 0)})</span></div>
      </div>
      <dl class="kv">
        <dt>Accuracy, unseen regions</dt><dd>${pct(H.spatial_accuracy, 1)}</dd>
        <dt>NDEM agreement (40 m), kept events</dt><dd>${pct(H.gti_40m_range[0])} – ${pct(H.gti_40m_range[1])}</dd>
        <dt>HAND vs elevation (AUC)</dt><dd>${fmt(H.hand_auc, 3)} vs ${fmt(H.elevation_auc, 3)}</dd>
        <dt>Routed catchment</dt><dd>${fmt(H.catchment_km2, 0)} km²</dd>
        <dt>Paved area 2017 → 2025</dt><dd>${fmt(H.impervious_km2_2017)} → ${fmt(H.impervious_km2_2025)} km²</dd>
      </dl>
      <p class="note">We report validation on unseen regions and an unseen year, not the ~99 % a random split gives, because random test points sit next to training points.</p>
      <div class="proposed"><b>Not in this prototype</b><p>Assam pilot basin, rainfall-forecast alerts (F), hydraulic simulation (H), user accounts and the scenario drawing tool are proposed milestones M2–M6.</p></div>`;
  }
  let hotGroup = null;
  function renderHotspots() {
    const ol = $("#hotList"); ol.innerHTML = "";
    hotGroup = L.layerGroup();
    const grp = hotGroup;
    HOT.features.forEach((f) => {
      const p = f.properties, c = f.geometry.coordinates[0];
      const rect = L.rectangle([[c[0][1], c[0][0]], [c[2][1], c[2][0]]], { color: "#c2410c", weight: 1.5, fillOpacity: 0.05, interactive: true })
        .bindTooltip(`#${p.rank}: ${fmt(p.new_paved_highrisk_km2, 3)} km² newly paved on high-risk land`);
      rect.on("click", () => zoomHot(p, rect));
      grp.addLayer(rect);
      const li = document.createElement("li");
      li.innerHTML = `<span class="rk">#${p.rank}</span><span><b>${fmt(p.new_paved_highrisk_km2 * 100, 1)} ha</b> newly paved on high-risk land
        <span class="hs"><br>${p.center[0].toFixed(3)}° N, ${p.center[1].toFixed(3)}° E · high-risk land ${fmt(p.highrisk_km2, 2)} km² · paved ${fmt(p.paved_2017_km2, 2)} → ${fmt(p.paved_2025_km2, 2)} km² · flooded in kept events ${fmt(p.observed_flood_km2, 2)} km²</span></span>`;
      li.addEventListener("click", () => zoomHot(p, rect));
      ol.appendChild(li);
    });
  }
  function zoomHot(p, rect) {
    map.fitBounds(rect.getBounds(), { maxZoom: 15 });
    ["susceptibility", "impervious"].forEach((id) => { byId(id).on = true; });
    renderLayerControls(); sync();
  }

  // ---------------------------------------------------------------- click-to-inspect
  const grids = {};
  Promise.all(Object.entries(Q).map(([k, src]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
      const ctx = c.getContext("2d", { willReadFrequently: true }); ctx.drawImage(im, 0, 0);
      grids[k] = ctx.getImageData(0, 0, im.width, im.height).data; res();
    };
    im.src = src;
  })));
  const px = (k, r, c) => { const i = (r * G.width + c) * 4, d = grids[k]; return d ? [d[i], d[i + 1], d[i + 2]] : null; };
  const SUS = ["Open water", "Very Low", "Low", "Moderate", "High", "Very High"];
  let marker = null;
  map.on("click", (ev) => {
    const { lat, lng } = ev.latlng;
    const r = Math.floor((G.bounds[1][0] - lat) / G.res_deg), c = Math.floor((lng - G.bounds[0][1]) / G.res_deg);
    const out = $("#inspectOut");
    document.querySelector('.tabs button[data-tab="inspect"]').click();
    if (r < 0 || c < 0 || r >= G.height || c >= G.width || !grids.q1) { out.innerHTML = `<p class="hint">Outside the test basin.</p>`; return; }
    if (marker) marker.remove();
    marker = L.circleMarker(ev.latlng, { radius: 6, color: "#111827", weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(map);
    const [sus, hand, fb] = px("q1", r, c), [i17, i25, ur] = px("q2", r, c), [u1, u2, u3] = px("q3", r, c), [pr] = px("q5", r, c), [d1, d2, lb] = px("q4", r, c);
    const landCell = (lb & 1) === 1;
    const evs = M.events.map((e) => ({ e, sat: (fb >> e.bit) & 1, nd: (lb >> (e.bit + 1)) & 1 }));
    const row = (g, l, v, s) => `<div class="iq"><div class="lbl"><span><span class="pill ${g}">${g}</span>${l}</span><b>${v}</b></div><div class="src">${s}</div></div>`;
    let h = `<p class="hint" style="margin-top:12px">${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E · cell r${r} c${c}</p>`;
    if (!landCell) { h += row("O", "Permanent water", (fb >> 4) & 1 ? "yes" : "no", "Open water is outside the risk model domain"); out.innerHTML = h; return; }
    h += evs.map(({ e, sat, nd }) => row("O", `Flood ${e.date}`, `${sat ? "flooded" : "dry"} · NDEM ${nd ? "flooded" : "dry"}`,
      `Sentinel-1 (our map) vs NRSC/ISRO NDEM`)).join("");
    h += row("S", "Susceptibility class", SUS[sus] || "–", `Riskier than ${pr}% of land cells (LightGBM model)`);
    h += row("S", "Height above drainage", hand === 255 ? "–" : `${fmt(hand / 2, 1)} m`, "HAND, full-basin D8 routing");
    h += row("D", "Paved fraction 2017 → 2025", `${i17}% → ${i25}%`, "Hybrid GHSL + Dynamic World");
    h += row("D", "UICA 2025", area(((u1 << 16) | (u2 << 8) | u3) / 10000), `Paved area draining through this cell; ${ur === 255 ? "–" : ur + "% of its upstream area"}`);
    h += row("D", "UICA change 2017–2025", "+" + area(((d1 << 8) | d2) / 1000), "New paved area upstream since 2017");
    out.innerHTML = h;
  });


  // ---------------------------------------------------------------- critical facilities (exposure)
  const FAC = window.FACILITIES ? window.FACILITIES.features : [];
  const FSUM = M.facilities_summary || {};
  const CATCOL = { Health: "#dc2626", Education: "#7c3aed", Emergency: "#0f766e", Power: "#d97706" };
  const RISKNAME = ["Open water", "Very Low", "Low", "Moderate", "High", "Very High"];
  const facOn = { Health: false, Education: false, Emergency: false, Power: false };
  map.createPane("pFac"); map.getPane("pFac").style.zIndex = 460;
  const facGroup = L.layerGroup().addTo(map);
  function facPopup(p) {
    const fl = [...new Set([...p.flood_ours, ...p.flood_ndem])];
    return `<b>${p.name || "(unnamed " + p.kind + ")"}</b><br>${p.cat} · ${p.kind}<br>Risk class: <b>${RISKNAME[p.risk]}</b>` +
      (p.hand_m != null ? `<br>Height above drainage: ${p.hand_m} m` : "") +
      `<br>Flooded in validated events: <b>${fl.length ? fl.join(", ") : "none"}</b>` +
      (fl.length ? `<br><small>our map: ${p.flood_ours.join(", ") || "–"} · NDEM: ${p.flood_ndem.join(", ") || "–"}</small>` : "") +
      `<br><small>Source: OpenStreetMap; risk and flood from FLOODINTEL layers</small>`;
  }
  function drawFacilities() {
    facGroup.clearLayers();
    const riskOnly = document.getElementById("facRiskOnly").checked;
    FAC.forEach((f) => {
      const p = f.properties;
      if (!facOn[p.cat] || (riskOnly && p.risk < 4)) return;
      const flooded = p.flood_ours.length || p.flood_ndem.length;
      L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
        pane: "pFac", radius: flooded ? 6 : 4, color: p.risk === 5 ? "#111827" : "#ffffff", weight: p.risk === 5 ? 2 : 1,
        fillColor: CATCOL[p.cat], fillOpacity: 0.95,
      }).bindPopup(facPopup(p)).addTo(facGroup);
    });
  }
  (function facControls() {
    const box = document.getElementById("facControls");
    Object.keys(CATCOL).forEach((cat) => {
      const s = FSUM[cat] || { total: 0 };
      const row = document.createElement("label"); row.className = "facrow";
      row.innerHTML = `<input type="checkbox"><span class="facdot" style="background:${CATCOL[cat]}"></span>${cat} <span class="prov" style="margin-left:auto">${s.total}</span>`;
      row.querySelector("input").addEventListener("change", (e) => { facOn[cat] = e.target.checked; drawFacilities(); });
      box.appendChild(row);
    });
    document.getElementById("facRiskOnly").addEventListener("change", drawFacilities);
  })();
  function renderFacilitiesTab() {
    const cats = Object.keys(CATCOL);
    let h = `<h2 style="margin-top:12px">Critical facilities at risk</h2>
      <p class="hint">Hospitals, schools, police and fire stations, shelters and power substations from OpenStreetMap, checked against the risk map and the four validated flood events.</p>
      <table class="facsum"><tr><th>Type</th><th>Total</th><th>High / Very High</th><th>Very High</th><th>Flooded*</th></tr>`;
    cats.forEach((c) => { const s = FSUM[c]; if (s) h += `<tr><td><span class="facdot" style="display:inline-block;background:${CATCOL[c]};margin-right:5px"></span>${c}</td><td>${s.total}</td><td>${s.high_or_very_high}</td><td>${s.very_high}</td><td>${s.flooded_any_event}</td></tr>`; });
    h += `</table><p class="hint">*within ~30 m of flood water in at least one validated event (our Sentinel-1 map or the official NDEM map).</p>
      <h2>Facilities that flooded</h2><ol class="hotlist faclist" id="facList"></ol>`;
    document.getElementById("tab-facilities").innerHTML = h;
    const ol = document.getElementById("facList");
    FAC.filter((f) => f.properties.flood_ours.length || f.properties.flood_ndem.length)
      .sort((a, b) => b.properties.risk - a.properties.risk || (b.properties.flood_ours.length + b.properties.flood_ndem.length) - (a.properties.flood_ours.length + a.properties.flood_ndem.length))
      .forEach((f) => {
        const p = f.properties, li = document.createElement("li");
        const fl = [...new Set([...p.flood_ours, ...p.flood_ndem])];
        li.innerHTML = `<span class="facdot" style="background:${CATCOL[p.cat]};margin-top:4px"></span><span><b>${p.name || "Unnamed " + p.kind}</b><span class="hs"><br>${p.kind} · risk ${RISKNAME[p.risk]} · flooded ${fl.join(", ")}</span></span>`;
        li.addEventListener("click", () => {
          facOn[p.cat] = true; document.querySelectorAll("#facControls input")[cats.indexOf(p.cat)].checked = true; drawFacilities();
          map.setView([f.geometry.coordinates[1], f.geometry.coordinates[0]], 15);
          L.popup().setLatLng([f.geometry.coordinates[1], f.geometry.coordinates[0]]).setContent(facPopup(p)).openOn(map);
        });
        ol.appendChild(li);
      });
  }
  // ---------------------------------------------------------------- boot
  renderLayerControls(); sync(); setEvent(curEvent); renderAbout(); renderHotspots(); renderFacilitiesTab();

  // deep links for screenshots and demos, e.g.
  // ?event=2019-08-10&layers=susceptibility,impervious&year=2017&tab=hotspots&click=10.05,76.30&zoom=10.05,76.30,13
  const P = new URLSearchParams(location.search);
  if (P.get("event") && evById[P.get("event")]) setEvent(evById[P.get("event")]);
  if (P.get("layers") != null) {
    const want = P.get("layers").split(",").filter(Boolean);
    LAYERS.forEach((l) => { l.on = want.includes(l.id); });
    renderLayerControls(); sync();
  }
  if (P.get("year")) setYear(+P.get("year"));
  if (P.get("fac")) { P.get("fac").split(",").forEach((c) => { if (c in facOn) { facOn[c] = true; document.querySelectorAll("#facControls input")[Object.keys(CATCOL).indexOf(c)].checked = true; } }); if (P.get("facrisk")) document.getElementById("facRiskOnly").checked = true; drawFacilities(); }
  if (P.get("basemap")) document.querySelector(`#basemapSeg button[data-b="${P.get("basemap")}"]`)?.click();
  if (P.get("zoom")) { const [a, b, z] = P.get("zoom").split(",").map(Number); map.setView([a, b], z); }
  if (P.get("tab")) document.querySelector(`.tabs button[data-tab="${P.get("tab")}"]`)?.click();
  if (P.get("click")) {
    const [a, b] = P.get("click").split(",").map(Number);
    const fire = () => (grids.q4 ? map.fire("click", { latlng: L.latLng(a, b) }) : setTimeout(fire, 100));
    fire();
  }
})();
