"use strict";

import { api, store, escapeHtml, onUserChange } from "./store.js";
import { lineChart } from "./chart.js";
import { haptic } from "./ui.js";

// Typical amateur carry centres (metres) keyed by club abbreviation.
const CLUB_CENTERS = {
  Dr: 200, "3W": 180, "5W": 165,
  "2i": 185, "3i": 175, "4i": 165, "5i": 150, "6i": 140,
  "7i": 130, "8i": 120, "9i": 110,
  PW: 95, GW: 80, SW: 65, LW: 50,
};
const FALLBACK_CENTER = 120;

const DIRECTIONS = [
  { key: "links", label: "← Links", drift: -1 },
  { key: "gerade", label: "Gerade", drift: 0 },
  { key: "rechts", label: "Rechts →", drift: 1 },
];

const local = {
  clubs: [],
  tags: [],
  club: null,           // selected club object
  stats: null,          // last loaded stats for selected club
  buckets: [],          // [{label, mid}]
  bucketIdx: null,      // selected bucket index
  override: null,       // exact carry override in metres
  pickedTags: new Set(),
  direction: "gerade",
};

// ----------------------------------------------------------- helpers
function round5(n) {
  return Math.round(n / 5) * 5;
}

function centerFor(club) {
  return CLUB_CENTERS[club.abbr] ?? FALLBACK_CENTER;
}

// Build 5 buckets of 30 m width centred on the club's typical carry centre.
function buildBuckets(club) {
  const c = centerFor(club);
  const e1 = round5(c - 45);
  const e2 = round5(c - 15);
  const e3 = round5(c + 15);
  const e4 = round5(c + 45);
  return [
    { label: `< ${e1}`, mid: round5(c - 60) },
    { label: `${e1} – ${e2}`, mid: round5(c - 30) },
    { label: `${e2} – ${e3}`, mid: round5(c) },
    { label: `${e3} – ${e4}`, mid: round5(c + 30) },
    { label: `> ${e4}`, mid: round5(c + 60) },
  ];
}

// Current carry: override wins, else selected bucket midpoint, else null.
function currentCarry() {
  if (local.override != null) return local.override;
  if (local.bucketIdx != null) return local.buckets[local.bucketIdx].mid;
  return null;
}

function tendencyLabel(avgDrift) {
  if (avgDrift < -0.1) return "links";
  if (avgDrift > 0.1) return "rechts";
  return "gerade";
}

function driftLabel(driftM) {
  if (driftM < 0) return "links";
  if (driftM > 0) return "rechts";
  return "gerade";
}

// ----------------------------------------------------------- clubs
async function loadClubs() {
  local.clubs = await api.get("/api/clubs");
  // Keep the current selection if it still exists, else fall back to the first.
  const stillThere = local.club && local.clubs.some((c) => c.id === local.club.id);
  if (!stillThere) local.club = local.clubs[0] || null;
  renderClubs();
  renderBuckets();
  updateSaveState();
}

// Record view + Statistik tab share the same club selection; render both rows.
function renderClubs() {
  ["range-club-row", "stats-range-club-row"].forEach((id) => {
    const row = document.getElementById(id);
    if (!row) return;
    row.innerHTML = "";
    local.clubs.forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "club-chip" + (local.club?.id === c.id ? " club-chip--selected" : "");
      btn.textContent = c.abbr;            // short label only, e.g. "7i"
      btn.title = c.name;                  // full name on hover / a11y
      btn.onclick = () => selectClub(c);
      row.appendChild(btn);
    });
  });
}

function selectClub(c) {
  local.club = c;
  renderClubs();
  resetShot();         // rebuilds buckets/exact/tags/direction for the new club
  renderRangeStats();  // refresh inline summary + Statistik tab containers
  haptic("light");
}

// ----------------------------------------------------------- buckets
function renderBuckets() {
  local.buckets = local.club ? buildBuckets(local.club) : [];
  const wrap = document.getElementById("range-buckets");
  wrap.innerHTML = "";
  local.buckets.forEach((b, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const muted = local.override != null ? " bucket--muted" : ""; // slider active
    btn.className = "bucket" + (local.bucketIdx === i ? " bucket--selected" : "") + muted;
    btn.textContent = `${b.label} m`;
    btn.onclick = () => {
      local.bucketIdx = i;
      local.override = null; // selecting a bucket clears the override
      renderBuckets();
      renderExact();
      updateSliderDisabled(); // grey out the slider while a bucket is active
      updateSaveState();
      haptic("light");
    };
    wrap.appendChild(btn);
  });
}

// ----------------------------------------------------------- exact override
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function renderExact() {
  const span = document.getElementById("range-exact-value");
  const carry = currentCarry();
  span.textContent = carry != null ? `${carry} m` : "–";
}

// Reveal/hide the inline slider for an exact carry value.
function toggleSlider() {
  const wrap = document.getElementById("range-slider-wrap");
  const chip = document.getElementById("range-exact");
  const open = wrap.hidden;
  wrap.hidden = !open;
  chip.setAttribute("aria-expanded", String(open));
  if (!open) return;

  const slider = document.getElementById("range-slider");
  const center = local.club ? centerFor(local.club) : FALLBACK_CENTER;
  slider.min = clamp(round5(center - 90), 30, 350);
  slider.max = clamp(round5(center + 90), 60, 400);
  slider.value = currentCarry() ?? center;
  // Commit the shown value immediately so Speichern is ready without dragging.
  local.override = parseInt(slider.value, 10);
  local.bucketIdx = null;
  syncSliderOut(slider.value);
  renderExact();
  renderBuckets();          // buckets get greyed while slider is active
  updateSliderDisabled();   // slider itself is active → enabled
  updateSaveState();
  haptic("light");
}

// Slider is greyed (but still draggable) while a bucket is the active input.
// Dragging it switches back to slider mode. Buckets behave the same way.
function updateSliderDisabled() {
  const wrap = document.getElementById("range-slider-wrap");
  wrap.classList.toggle("slider-wrap--muted", local.bucketIdx != null);
}

function syncSliderOut(v) {
  document.getElementById("range-slider-out").textContent = `${v} m`;
}

function onSliderInput(e) {
  const v = parseInt(e.target.value, 10);
  local.override = v;        // override wins
  local.bucketIdx = null;    // clear bucket selection
  syncSliderOut(v);
  renderExact();
  renderBuckets();           // keep buckets greyed while sliding
  updateSliderDisabled();
  updateSaveState();
}

function hideSlider() {
  const wrap = document.getElementById("range-slider-wrap");
  if (wrap) wrap.hidden = true;
  const chip = document.getElementById("range-exact");
  if (chip) chip.setAttribute("aria-expanded", "false");
}

// ----------------------------------------------------------- tags
function renderTags() {
  const wrap = document.getElementById("range-tags");
  wrap.innerHTML = "";
  local.tags.forEach((t) => {
    const pill = document.createElement("span");
    pill.className = "tag-pill" + (local.pickedTags.has(t) ? " active" : "");
    pill.textContent = t;
    pill.onclick = () => {
      if (local.pickedTags.has(t)) local.pickedTags.delete(t);
      else local.pickedTags.add(t);
      pill.classList.toggle("active");
      haptic("light");
    };
    wrap.appendChild(pill);
  });
}

// ----------------------------------------------------------- direction
function renderDirection() {
  const wrap = document.getElementById("range-direction");
  wrap.innerHTML = "";
  DIRECTIONS.forEach((d) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dir-btn" + (local.direction === d.key ? " dir-btn--selected" : "");
    btn.textContent = d.label;
    btn.onclick = () => {
      local.direction = d.key;
      renderDirection();
      haptic("light");
    };
    wrap.appendChild(btn);
  });
}

// ----------------------------------------------------------- save
function updateSaveState() {
  const btn = document.getElementById("range-save");
  const ready = !!local.club && currentCarry() != null;
  btn.disabled = !ready;
}

function resetShot() {
  local.bucketIdx = null;
  local.override = null;
  local.pickedTags.clear();
  local.direction = "gerade";
  hideSlider();
  renderBuckets();
  renderExact();
  renderTags();
  renderDirection();
  updateSaveState();
}

async function saveShot() {
  if (!local.club) return;
  const carry = currentCarry();
  if (carry == null) return;

  const dir = DIRECTIONS.find((d) => d.key === local.direction) || DIRECTIONS[1];
  await api.send("/api/shots", "POST", {
    club_id: local.club.id,
    carry_m: carry,
    drift_m: dir.drift,
    tags: [...local.pickedTags],
    note: null,
  });

  haptic("success");
  resetShot();
  loadStats();
}

// ----------------------------------------------------------- stats
async function loadStats() {
  if (!local.club) return;
  const stats = await api.get(`/api/clubs/${local.club.id}/stats`);
  local.stats = stats;
  renderSummary();
}

// Inline summary on the record view for the selected club.
function renderSummary() {
  const el = document.getElementById("range-summary");
  const s = local.stats;
  if (!s || s.shots === 0) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = `${s.shots} Schläge · Ø ${s.avg_carry} m`;
}

function statCard(num, label, highlight) {
  return `<div class="stat-card${highlight ? " highlight" : ""}">
    <div class="stat-card__number">${num}</div>
    <div class="stat-card__label">${label}</div>
  </div>`;
}

function renderStats() {
  const cards = document.getElementById("range-stats-cards");
  const chart = document.getElementById("range-chart");
  const hist = document.getElementById("range-history");
  const s = local.stats;

  if (!s || s.shots === 0) {
    cards.innerHTML = "";
    chart.innerHTML = "";
    hist.innerHTML = `<div class="empty">Noch keine Schläge — los geht's! 🏌️</div>`;
    return;
  }

  cards.innerHTML = [
    statCard(s.shots, "Schläge", false),
    statCard(s.avg_carry + " m", "Ø Carry", true),
    statCard(s.max_carry + " m", "Max Carry", false),
    statCard(tendencyLabel(s.avg_drift), "Tendenz", false),
  ].join("");

  const points = (s.carry_trend || []).map((d) => ({
    label: d.date.slice(5).split("-").reverse().join("."), // YYYY-MM-DD -> DD.MM
    value: d.avg_carry,
  }));
  chart.innerHTML = points.length >= 2
    ? `<div class="chart-card">${lineChart(points, { unit: "m" })}</div>`
    : `<div class="chart-card"><p class="empty">Mehr Daten für einen Trend nötig.</p></div>`;

  const rows = (s.history || []).map((shot) => {
    const when = new Date(shot.played_at + "Z").toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const tags = shot.tags && shot.tags.length
      ? " · " + shot.tags.map(escapeHtml).join(", ")
      : "";
    return `<div class="history-row">
      <div class="history-row__date">${when}</div>
      <div class="history-row__dist">${driftLabel(shot.drift_m)}${tags}</div>
      <div class="history-row__total">${shot.carry_m} <span>m</span></div>
    </div>`;
  }).join("");
  hist.innerHTML = `<div class="history-card">${rows}</div>`;
}

// Re-fetch stats for the selected club, then render the stats view.
async function renderRangeStats() {
  await loadStats();
  renderStats();
}

// ----------------------------------------------------------- init
export async function initRange() {
  local.tags = await api.get("/api/shot-tags");
  renderTags();
  renderDirection();

  document.getElementById("range-exact").onclick = toggleSlider;
  document.getElementById("range-slider").addEventListener("input", onSliderInput);
  document.getElementById("range-save").onclick = saveShot;

  window.__renderRangeStats = renderRangeStats;
  // Settings (users.js) calls this after a club is added/deleted.
  window.__reloadClubs = () => loadClubs();

  onUserChange(() => { loadStats(); });

  await loadClubs();
  renderBuckets();
  renderExact();
  updateSaveState();
  loadStats();
}
