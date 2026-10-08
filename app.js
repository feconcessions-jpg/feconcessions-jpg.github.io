/* Fiesta fairgoer app prototype. All data comes from data.js (built by build.py). */
(function () {
  "use strict";
  const DATA = window.FAIR_DATA;
  const standsById = Object.fromEntries(DATA.stands.map((s) => [s.id, s]));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const $ = (id) => document.getElementById(id);
  const COPY = {
    comingSoon: "Menu coming soon. Check back shortly.",
    couponLine: (document.getElementById("coupon-line") || {}).textContent || "",
  };
  const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const sheet = $("sheet"), body = $("sheet-body"), sw = $("stand-switch"), peek = $("peek");

  function photoSlug(name) {
    return String(name || "").toLowerCase().replace(/®/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "item";
  }
  function photoSrc(name) {
    return "images/menu/" + photoSlug(name) + ".jpg";
  }

  // Red star (default) / green star (selected) — SVG fill controlled by CSS .star-fill
  const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="star-fill" d="M12 2.5l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.8 6.1 20.8l1.2-6.6L2.4 9.5l6.7-.9L12 2.5z"/></svg>`;

  // ---------- map: OSM tiles, muted via CSS greyscale so red/green stars stand out ----------
  // Carto Positron now requires an API key; greyscale OSM is the free muted alternative.
  // Production still needs a licensed tile provider for heavy public traffic.
  const map = L.map("map", { zoomControl: false, maxZoom: 19 });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);

  const pinName = (pin) => pin.stands.map((id) => standsById[id].name).join(" + ");

  const markers = {};
  DATA.pins.forEach((pin) => {
    const icon = L.divIcon({
      className: "",
      iconSize: [28, 28], iconAnchor: [14, 14],
      html: `<div class="pin" data-pin="${esc(pin.id)}"><span class="star">${STAR_SVG}</span><span class="lbl right">${esc(pinName(pin))}</span></div>`,
    });
    const m = L.marker([pin.lat, pin.lng], { icon, title: pinName(pin), keyboard: true, riseOnHover: true }).addTo(map);
    m.on("click", () => openPin(pin.id));
    markers[pin.id] = m;
  });

  const bounds = L.latLngBounds(DATA.pins.map((p) => [p.lat, p.lng]));
  function fitAll() {
    map.fitBounds(bounds, { paddingTopLeft: [70, 60], paddingBottomRight: [70, peek.offsetHeight + 40], maxZoom: 18 });
  }
  fitAll();

  const SIDES = ["right", "left", "top", "bottom"];
  const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  function layoutLabels() {
    const els = DATA.pins.map((p) => document.querySelector(`.pin[data-pin="${p.id}"]`)).filter(Boolean);
    const dots = els.map((el) => (el.querySelector(".star") || el).getBoundingClientRect());
    const placed = [];
    const mapRect = document.getElementById("map").getBoundingClientRect();
    const view = { left: mapRect.left, right: mapRect.right, top: mapRect.top,
      bottom: sheet.hidden ? mapRect.bottom - peek.offsetHeight : sheet.getBoundingClientRect().top };
    const inView = (r) => r.left >= view.left + 4 && r.right <= view.right - 4 && r.top >= view.top + 4 && r.bottom <= view.bottom - 4;
    const order = els.map((el, i) => i).sort((i, j) => crowd(j) - crowd(i));
    function crowd(i) { return dots.filter((d, k) => k !== i && Math.hypot(d.x - dots[i].x, d.y - dots[i].y) < 120).length; }
    order.forEach((i) => {
      const lbl = els[i].querySelector(".lbl");
      let chosen = SIDES[0];
      for (const side of SIDES) {
        lbl.className = "lbl " + side;
        const r = lbl.getBoundingClientRect();
        const pad = { left: r.left - 3, right: r.right + 3, top: r.top - 3, bottom: r.bottom + 3 };
        if (inView(r) && !placed.some((q) => hit(pad, q)) && !dots.some((d, k) => k !== i && hit(pad, d))) { chosen = side; break; }
      }
      lbl.className = "lbl " + chosen;
      placed.push(lbl.getBoundingClientRect());
    });
  }
  map.on("moveend", layoutLabels);
  requestAnimationFrame(layoutLabels);

  // ---------- quick-pick chips ----------
  function renderChips() {
    $("chips").innerHTML = DATA.pins.map((p) => {
      const active = current.pin && current.pin.id === p.id;
      return `<button class="chip${active ? " active" : ""}" role="listitem" data-pin="${esc(p.id)}">${esc(pinName(p))}</button>`;
    }).join("");
  }
  let current = { pin: null, stand: null, tab: 0 };
  renderChips();
  $("chips").addEventListener("click", (e) => { const b = e.target.closest("[data-pin]"); if (b) openPin(b.dataset.pin); });

  // ---------- sheet ----------
  function setActive(pinId) {
    document.querySelectorAll(".pin").forEach((el) => el.classList.toggle("active", el.dataset.pin === pinId));
    renderChips();
  }

  function openPin(pinId, standId) {
    const pin = DATA.pins.find((p) => p.id === pinId);
    if (!pin) return;
    current = { pin, stand: standId && pin.stands.includes(standId) ? standId : pin.stands[0], tab: 0 };
    setActive(pin.id);
    peek.hidden = true;
    sheet.hidden = false;
    document.body.classList.add("location-open");
    renderSwitch();
    renderStand();
    focusPin(pin);
    history.replaceState(null, "", "#" + current.stand);
  }

  const NEIGHBOUR_M = 120;
  function meters(a, b) {
    const toR = Math.PI / 180, x = (b.lng - a.lng) * toR * Math.cos(((a.lat + b.lat) / 2) * toR), y = (b.lat - a.lat) * toR;
    return Math.hypot(x, y) * 6371000;
  }
  function focusPin(pin) {
    const group = DATA.pins.filter((p) => p === pin || meters(p, pin) <= NEIGHBOUR_M);
    const b = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
    const mapH = $("map").clientHeight, sheetH = sheet.offsetHeight;
    const bottomPad = Math.min(sheetH + 28, mapH - 120);
    map.fitBounds(b, { paddingTopLeft: [90, 40], paddingBottomRight: [90, bottomPad], maxZoom: 18, animate: false });
    layoutLabels();
  }

  function closeSheet() {
    sheet.hidden = true; peek.hidden = false; current = { pin: null, stand: null, tab: 0 }; setActive(null);
    document.body.classList.remove("location-open");
    fitAll();
    history.replaceState(null, "", location.pathname + location.search);
  }
  $("sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

  function renderSwitch() {
    const ids = current.pin.stands;
    if (ids.length < 2) { sw.hidden = true; sw.innerHTML = ""; return; }
    sw.hidden = false;
    sw.innerHTML = ids.map((id) => `<button role="tab" data-stand="${esc(id)}" aria-selected="${id === current.stand}">${esc(standsById[id].name)}</button>`).join("");
    sw.onclick = (e) => {
      const b = e.target.closest("[data-stand]"); if (!b) return;
      current.stand = b.dataset.stand; current.tab = 0;
      renderSwitch(); renderStand();
      history.replaceState(null, "", "#" + current.stand);
    };
  }

  function priceHtml(it) {
    return `<span class="price ${esc(it.kind)}">${it.price ? esc(it.price) : ""}</span>`;
  }

  function itemHtml(it) {
    const src = photoSrc(it.name);
    return `
      <div class="item">
        <img class="item-photo" src="${esc(src)}" alt="" loading="lazy" width="72" height="54"
             onerror="this.style.visibility='hidden'">
        <div class="item-body">
          <div class="item-name">${esc(it.name)}</div>
          ${it.desc ? `<div class="item-desc">${esc(it.desc)}</div>` : ""}
          ${it.pending ? `<div class="item-soon">${esc(COPY.comingSoon)}</div>` : ""}
        </div>
        ${priceHtml(it)}
      </div>`;
  }

  function groupsHtml(groups, tabName) {
    return groups.map((g) => {
      const showHeading = !(tabName && norm(g.name) === norm(tabName));
      return `
      <div class="group">
        ${showHeading ? `<h3>${esc(g.name)}</h3>` : ""}
        ${g.note ? `<p class="group-note">${esc(g.note)}</p>` : ""}
        ${g.items.map(itemHtml).join("")}
      </div>`;
    }).join("");
  }

  function renderStand() {
    const s = standsById[current.stand];
    const shared = current.pin.stands.length > 1;
    let html = `
      <div class="stand-head">
        <h2 class="stand-name" id="sheet-title">${esc(s.name)}</h2>
        ${s.locationLabel ? `<div class="location-label">${esc(s.locationLabel)}</div>` : ""}
        <div class="booth">Booth ${esc(s.booth)}${shared ? " · shares this spot with " + esc(current.pin.stands.filter((x) => x !== s.id).map((x) => standsById[x].name).join(", ")) : ""}</div>
        <div class="actions">
          <a class="btn" href="${esc(s.directions)}" target="_blank" rel="noopener">Directions</a>
        </div>
        ${s.status !== "pending" ? `<p class="coupon-note">${esc(COPY.couponLine)}</p>` : ""}
      </div>`;

    if (s.status === "pending") {
      html += `<div class="coming-soon"><strong>${esc(COPY.comingSoon)}</strong></div>`;
    } else if (s.submenus.length > 1) {
      html += `<div class="tabs" role="tablist">${s.submenus.map((sm, i) =>
        `<button class="tab" role="tab" data-tab="${i}" aria-selected="${i === current.tab}">${esc(sm.name)}</button>`).join("")}</div>`;
      const sm = s.submenus[current.tab];
      html += `<div role="tabpanel">${groupsHtml(sm.groups, sm.name)}</div>`;
    } else {
      html += groupsHtml(s.submenus[0].groups, s.submenus[0].name);
    }
    body.innerHTML = html;
    body.scrollTop = 0;
    body.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => {
      current.tab = Number(b.dataset.tab); renderStand();
      body.querySelector(`.tab[data-tab="${current.tab}"]`).scrollIntoView({ inline: "center", block: "nearest" });
    }));
  }

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!standsById[id] || id === current.stand) return;
    const pin = DATA.pins.find((p) => p.stands.includes(id));
    openPin(pin.id, id);
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
  window.FAIR_APP = { openPin, closeSheet, fitAll };
})();
