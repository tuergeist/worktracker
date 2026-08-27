"use strict";

import { api, store, escapeHtml, onUserChange, newIdempotencyKey } from "./store.js";
import { lineChart, hasWhiskers } from "./chart.js";
import { haptic, withSaveFeedback, submitOnce } from "./ui.js";

// Starting guesses only — used until the club has enough of its own shots.
// Calibrated for a mid-handicap club golfer, not a long hitter: the previous
// table (Driver 200 m carry, 7i 130) put a typical 45-year-old permanently in
// the bottom bucket.
const CLUB_CENTERS = {
  Dr: 185, "3W": 165, "5W": 155,
  "2i": 170, "3i": 160, "4i": 150, "5i": 140, "6i": 130,
  "7i": 120, "8i": 110, "9i": 100,
  PW: 88, GW: 78, SW: 65, LW: 50,
};
const FALLBACK_CENTER = 120;

// Shots needed before the club's own average replaces the table guess. Three is
// enough to be closer than a generic number without chasing a single outlier.
const CENTER_FROM_HISTORY_MIN = 3;

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
  statsClubId: null,    // which club local.stats belongs to (it arrives async)
  pickedTags: new Set(),
  direction: "gerade",
  idemKey: null,        // minted on the first save attempt, kept across retries
};

// ----------------------------------------------------------- helpers
function round5(n) {
  return Math.round(n / 5) * 5;
}

// Where to centre the distance buckets, and how confident we are about it.
//   "history" — the club's own average carry
//   "table"   — the guess above, for a club we know but have no shots for
//   "unknown" — a self-added club (hybrid, 52°) we have nothing on at all
function centerFor(club) {
  const s = local.stats;
  const fromHistory = s && s.shots >= CENTER_FROM_HISTORY_MIN && s.avg_carry != null
    && local.statsClubId === club.id;
  if (fromHistory) return { center: round5(s.avg_carry), source: "history" };
  const table = CLUB_CENTERS[club.abbr];
  if (table != null) return { center: table, source: "table" };
  return { center: FALLBACK_CENTER, source: "unknown" };
}

// Bucket width follows how well we know the club. 30 m everywhere was the old
// behaviour and useless for gapping — "155–185 m" spans three clubs. Once the
// centre comes from the player's own shots, 10 m steps are the point of the
// exercise; without history the net has to stay wide enough to catch the ball.
const WIDTH_BY_SOURCE = { history: 10, table: 20, unknown: 30 };

// Five buckets: three explicit ones of `w` around the centre, plus an
// open-ended bucket at each end.
function buildBuckets(club) {
  const { center: c, source } = centerFor(club);
  const w = WIDTH_BY_SOURCE[source];
  const lo = round5(c - w * 1.5);
  const loMid = round5(c - w / 2);
  const hiMid = round5(c + w / 2);
  const hi = round5(c + w * 1.5);
  return [
    { label: `< ${lo}`, mid: round5(c - w * 2) },
    { label: `${lo} – ${loMid}`, mid: round5(c - w) },
    { label: `${loMid} – ${hiMid}`, mid: round5(c) },
    { label: `${hiMid} – ${hi}`, mid: round5(c + w) },
    { label: `> ${hi}`, mid: round5(c + w * 2) },
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
  const center = local.club ? centerFor(local.club).center : FALLBACK_CENTER;
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
  local.idemKey = null; // a cleared form is a different shot
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
  if (!local.idemKey) local.idemKey = newIdempotencyKey();
  const key = local.idemKey;
  const { ok } = await submitOnce(document.getElementById("range-save"), "Speichert …", () =>
    withSaveFeedback(
      () => api.send("/api/shots", "POST", {
        club_id: local.club.id,
        carry_m: carry,
        drift_m: dir.drift,
        tags: [...local.pickedTags],
        note: null,
      }, { idempotencyKey: key }),
      { ok: `${local.club.abbr} · ${carry} m gespeichert` },
    ));
  if (!ok) return; // shot and key stay so a retry reuses the key

  haptic("success");
  resetShot();
  loadStats();
}

async function deleteShot(id) {
  if (!confirm("Diesen Schlag löschen?")) return;
  const { ok } = await withSaveFeedback(
    () => api.send(`/api/shots/${id}`, "DELETE"),
    { ok: "Schlag gelöscht", fail: "Löschen fehlgeschlagen." },
  );
  if (ok) renderRangeStats();
}

// ----------------------------------------------------------- stats
async function loadStats() {
  if (!local.club) return;
  const clubId = local.club.id;
  const stats = await api.get(`/api/clubs/${clubId}/stats`);
  if (local.club?.id !== clubId) return; // user switched clubs mid-request
  local.stats = stats;
  local.statsClubId = clubId;
  renderSummary();
  // The buckets are centred on this club's average, so they can only be built
  // once the stats land. Rebuilding under an existing selection would silently
  // change what that selection means, so leave an in-progress entry alone.
  if (local.bucketIdx == null && local.override == null) renderBuckets();
}

// Inline summary on the record view. Also says where the distance buckets come
// from — the ranges look wrong until you know they are still generic guesses.
function renderSummary() {
  const el = document.getElementById("range-summary");
  const s = local.stats;
  el.hidden = false;
  if (!s || s.shots === 0) {
    el.textContent = "Noch keine Schläge · Bereiche sind Richtwerte";
    return;
  }
  if (s.shots < CENTER_FROM_HISTORY_MIN) {
    el.textContent = `${s.shots} Schläge · Ø ${s.avg_carry} m · Bereiche sind Richtwerte`;
    return;
  }
  el.textContent = `${s.shots} Schläge · Ø ${s.avg_carry} m · Bereiche aus deinen Schlägen`;
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
    ciLow: d.ci != null ? d.avg_carry - d.ci : undefined,
    ciHigh: d.ci != null ? d.avg_carry + d.ci : undefined,
  }));
  const hint = hasWhiskers(points)
    ? `<p class="chart-hint">Striche: Schwankung an Tagen mit mehreren Schlägen</p>` : "";
  chart.innerHTML = points.length >= 2
    ? `<div class="chart-card">${lineChart(points, { unit: "m" })}${hint}</div>`
    : `<div class="chart-card"><p class="empty">Mehr Daten für einen Trend nötig.</p></div>`;

  const rows = (s.history || []).map((shot) => {
    const when = new Date(shot.played_at + "Z").toLocaleString("de-DE", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    const tags = shot.tags && shot.tags.length
      ? " · " + shot.tags.map(escapeHtml).join(", ")
      : "";
    // Plain text, not .history-row__date — that class is styled as a tappable
    // date editor (dotted underline), which range rows do not offer.
    return `<div class="history-row">
      <div class="history-row__when">${when}</div>
      <div class="history-row__dist">${driftLabel(shot.drift_m)}${tags}</div>
      <div class="history-row__total">${shot.carry_m} <span>m</span></div>
      <button class="history-row__del" data-del="${shot.id}" aria-label="Schlag löschen">✕</button>
    </div>`;
  }).join("");
  hist.innerHTML = `<div class="history-card">${rows}</div>`;

  hist.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => deleteShot(parseInt(btn.dataset.del, 10));
  });
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
