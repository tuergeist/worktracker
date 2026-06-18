"use strict";

import { api, store, onUserChange, escapeHtml } from "./store.js";
import { openSheet, closeSheet, haptic } from "./ui.js";
import { lineChart } from "./chart.js";

const BUCKETS = ["1", "2", "3", "4+"];
const LABELS = { "1": "1-Putt", "2": "2-Putts", "3": "3-Putts", "4+": "4+-Putts" };

const local = {
  exercises: [],
  selected: null,
  dist: { "1": 0, "2": 0, "3": 0, "4+": 0 },
  lastBucket: null, // most recently incremented bucket (for --active)
};

function $(id) { return document.getElementById(id); }

function resetDist() {
  local.dist = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  local.lastBucket = null;
}

function assigned() {
  return BUCKETS.reduce((s, b) => s + local.dist[b], 0);
}

// short date like "18.06.26"
function shortDate(playedAt) {
  return new Date(playedAt + "Z").toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  });
}

// chart axis label
function chartLabel(playedAt) {
  return new Date(playedAt + "Z").toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit",
  });
}

// ----------------------------------------------------------- exercises
async function loadExercises() {
  local.exercises = await api.get("/api/exercises");
  if (!local.selected || !local.exercises.some((e) => e.id === local.selected.id)) {
    local.selected = local.exercises[0] || null;
    resetDist();
  } else {
    // keep selection in sync with fresh data (e.g. after edit)
    local.selected = local.exercises.find((e) => e.id === local.selected.id);
  }
  renderPickerLabel();
  renderGrid();
}

function renderPickerLabel() {
  const label = $("putten-picker-label");
  if (!local.selected) {
    label.textContent = "Keine Übung";
    return;
  }
  label.textContent = `${local.selected.name} · ${local.selected.num_balls} Bälle`;
}

function selectExercise(ex) {
  local.selected = ex;
  resetDist();
  renderPickerLabel();
  renderGrid();
  loadStats();
}

// ----------------------------------------------------------- counter grid
function renderGrid() {
  const grid = $("putten-grid");
  if (!local.selected) { grid.innerHTML = ""; renderProgress(); return; }

  const total = assigned();
  const atMax = total >= local.selected.num_balls;

  grid.innerHTML = BUCKETS.map((bucket) => {
    const v = local.dist[bucket];
    const cls =
      bucket === local.lastBucket ? "counter-cell counter-cell--active"
      : v === 0 ? "counter-cell counter-cell--zero"
      : "counter-cell";
    const minusDis = v === 0 ? " disabled" : "";
    const plusDis = atMax ? " disabled" : "";
    return `
      <div class="${cls}" role="group" aria-label="${LABELS[bucket]}, ${v} mal">
        <div class="counter-cell__dot"></div>
        <span class="counter-cell__label">${LABELS[bucket]}</span>
        <div class="counter-cell__controls">
          <button class="counter-btn counter-btn--minus" data-bucket="${bucket}" data-d="-1" aria-label="Weniger"${minusDis}>−</button>
          <span class="counter-cell__value">${v}</span>
          <button class="counter-btn counter-btn--plus" data-bucket="${bucket}" data-d="1" aria-label="Mehr"${plusDis}>+</button>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".counter-btn").forEach((btn) => {
    btn.onclick = () => step(btn.dataset.bucket, parseInt(btn.dataset.d, 10));
  });

  renderProgress();
}

function step(bucket, d) {
  const next = local.dist[bucket] + d;
  if (next < 0) return;
  if (d > 0 && assigned() >= local.selected.num_balls) {
    haptic("warning");
    return;
  }
  local.dist[bucket] = next;
  if (d > 0) local.lastBucket = bucket;
  haptic("light");
  renderGrid();
}

function renderProgress() {
  const row = $("putten-progress");
  if (!local.selected) { row.innerHTML = ""; updateSaveBtn(); return; }

  const total = assigned();
  const num = local.selected.num_balls;
  const pct = num > 0 ? Math.min(100, Math.round((total / num) * 100)) : 0;
  const complete = total === num;

  row.innerHTML = `
    <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
    <span class="progress-label${complete ? " progress-label--complete" : ""}">${total} / ${num} Bälle</span>
    ${complete ? `<span class="progress-checkmark">✓</span>` : ""}`;

  updateSaveBtn();
}

function updateSaveBtn() {
  const btn = $("putten-save");
  const ready = local.selected && assigned() === local.selected.num_balls;
  btn.disabled = !ready;
}

// ----------------------------------------------------------- exercise picker
function openPicker() {
  const rows = local.exercises.map((ex) => {
    const current = local.selected && ex.id === local.selected.id;
    const canDelete = !ex.is_default;
    return `
      <div class="sheet-row" data-id="${ex.id}">
        <span class="sheet-row__label">${escapeHtml(ex.name)} · ${ex.num_balls} Bälle</span>
        ${current ? '<span class="sheet-row__check">✓</span>' : ""}
        ${canDelete ? `<button class="sheet-row__del" data-del="${ex.id}" aria-label="Übung löschen">✕</button>` : ""}
      </div>`;
  }).join("");

  openSheet({
    title: "Übung",
    bodyHtml: `${rows}<button class="sheet-add" data-add>+ Neue Übung</button>`,
  });

  const body = $("sheet-body");

  body.querySelectorAll(".sheet-row").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest("[data-del]")) return;
      const id = parseInt(row.dataset.id, 10);
      const ex = local.exercises.find((x) => x.id === id);
      if (!ex) return;
      haptic("light");
      closeSheet();
      selectExercise(ex);
    };
  });

  body.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.del, 10);
      const ex = local.exercises.find((x) => x.id === id);
      if (!ex) return;
      if (!confirm(`Übung „${ex.name}“ löschen?`)) return;
      await api.send(`/api/exercises/${id}`, "DELETE");
      if (local.selected && local.selected.id === id) local.selected = null;
      await loadExercises();
      loadStats();
      openPicker(); // refresh the sheet contents
    };
  });

  const add = body.querySelector("[data-add]");
  if (add) add.onclick = () => createExercise();
}

async function createExercise() {
  const name = prompt("Name der Übung:");
  if (!name || !name.trim()) return;
  const distRaw = prompt("Distanz in Metern:", "2");
  if (distRaw === null) return;
  const ballsRaw = prompt("Anzahl Bälle:", "10");
  if (ballsRaw === null) return;

  const distance_cm = Math.round((parseFloat(distRaw) || 0) * 100);
  const num_balls = parseInt(ballsRaw, 10) || 10;

  const ex = await api.send("/api/exercises", "POST", {
    category: "putting",
    name: name.trim(),
    distance_cm,
    num_balls,
  });
  await loadExercises();
  selectExercise(ex);
  closeSheet();
}

// ----------------------------------------------------------- save
async function saveSession() {
  if (!local.selected) return;
  if (!store.currentUserId) {
    alert("Bitte zuerst einen Spieler anlegen.");
    return;
  }
  if (assigned() !== local.selected.num_balls) {
    haptic("warning");
    return;
  }

  // Reconstruct per-ball results array (4+ -> value 4).
  const results = [];
  BUCKETS.forEach((b) => {
    const v = b === "4+" ? 4 : parseInt(b, 10);
    for (let i = 0; i < local.dist[b]; i++) results.push(v);
  });

  await api.send("/api/sessions", "POST", {
    user_id: store.currentUserId,
    exercise_id: local.selected.id,
    results,
    note: null,
  });

  haptic("success");
  resetDist();
  renderGrid();
  loadStats();
}

// ----------------------------------------------------------- stats
async function loadStats() {
  if (typeof window.__renderPuttenStats === "function") {
    await window.__renderPuttenStats();
  }
}

async function renderStats() {
  const cards = $("putten-stats-cards");
  const chart = $("putten-chart");
  const hist = $("putten-history");

  if (!local.selected || !store.currentUserId) {
    cards.innerHTML = "";
    chart.innerHTML = "";
    hist.innerHTML = `<div class="empty">Noch keine Sessions — leg los! 🏌️</div>`;
    return;
  }

  const u = store.currentUserId;
  const ex = local.selected.id;
  const stats = await api.get(`/api/exercises/${ex}/stats?user_id=${u}`);
  const sessions = await api.get(`/api/sessions?exercise_id=${ex}&user_id=${u}`);

  // cards
  cards.innerHTML = [
    statCard(stats.sessions, "Sessions"),
    statCard(stats.best_total_putts, "Bestwert (Putts)", true),
    statCard(stats.avg_total_putts, "Ø Putts pro Session"),
    statCard(stats.avg_one_putt_pct + " %", "1-Putt-Quote", true),
  ].join("");

  // chart (history oldest -> newest)
  const points = (stats.history || []).map((h) => ({
    label: chartLabel(h.played_at),
    value: h.total_putts,
  }));
  chart.innerHTML = points.length >= 2
    ? `<div class="chart-card">${lineChart(points)}</div>`
    : `<div class="chart-card"><p class="empty">Mehr Daten für einen Trend nötig.</p></div>`;

  // history
  if (!sessions.length) {
    hist.innerHTML = `<div class="empty">Noch keine Sessions — leg los! 🏌️</div>`;
    return;
  }
  hist.innerHTML = `<div class="history-card">${sessions.map(historyRow).join("")}</div>`;
}

function statCard(num, label, highlight = false) {
  return `<div class="stat-card${highlight ? " highlight" : ""}"><div class="stat-card__number">${num}</div><div class="stat-card__label">${label}</div></div>`;
}

function historyRow(s) {
  const d = s.stats.distribution;
  const chips = BUCKETS
    .map((b) => `<span class="dist-chip">${d[b]} <span class="chip-label">${b === "4+" ? "4+" : b + "×"}</span></span>`)
    .join("");
  return `
    <div class="history-row">
      <div class="history-row__date">${shortDate(s.played_at)}</div>
      <div class="history-row__dist">${chips}</div>
      <div class="history-row__total">${s.stats.total_putts} <span>Putts</span></div>
    </div>`;
}

// ----------------------------------------------------- green photo analysis
function initPhoto() {
  const input = $("putten-photo-input");
  $("putten-photo").onclick = () => input.click();
  input.onchange = () => {
    const file = input.files && input.files[0];
    input.value = ""; // allow re-picking the same file
    if (file) analyzePhoto(file);
  };
}

async function analyzePhoto(file) {
  haptic("light");
  openSheet({
    title: "Green-Analyse",
    bodyHtml: `<div class="analyze-loading"><div class="spinner"></div><p>Foto wird ausgewertet …</p></div>`,
  });
  try {
    const fd = new FormData();
    fd.append("photo", file);
    const r = await fetch("/api/analyze-putt", { method: "POST", body: fd });
    if (!r.ok) throw new Error(await r.text());
    showAnalysis(await r.json());
    haptic("success");
  } catch (e) {
    let msg = String(e.message || e);
    try { msg = JSON.parse(msg).detail || msg; } catch (_) { /* keep raw */ }
    openSheet({
      title: "Green-Analyse",
      bodyHtml: `<p class="analyze-error">Analyse fehlgeschlagen.</p>
                 <p class="analyze-error__detail">${escapeHtml(msg)}</p>`,
    });
    haptic("warning");
  }
}

function showAnalysis(d) {
  let body = `<img class="analyze-img" src="data:image/png;base64,${d.annotated_png_b64}" alt="Annotiertes Green" />`;
  body += `<div class="analyze-summary">`;
  body += `<div class="analyze-line"><b>${d.total}</b> Bälle auf dem Grün`
        + (d.balls_in_hole ? `, ${d.balls_in_hole} im Loch` : "") + `</div>`;
  if (d.zones) {
    const t = d.tendency, disp = d.dispersion;
    const longTxt = `${Math.abs(t.long_cm)} cm ${t.long_cm >= 0 ? "zu kurz" : "zu lang"}`;
    const latTxt = `${Math.abs(t.lat_cm)} cm ${t.lat_cm >= 0 ? "rechts" : "links"}`;
    body += `<div class="analyze-zones">
      <span class="zone zone--good">${d.zones.good} gut</span>
      <span class="zone zone--bad">${d.zones.bad} schlecht</span>
      <span class="zone zone--mist">${d.zones.mist} Mist</span>
    </div>`;
    body += `<div class="analyze-line">Tendenz: ${longTxt}, ${latTxt}</div>`;
    body += `<div class="analyze-line analyze-line--muted">Streuung: längs ±${disp.long_cm} cm, quer ±${disp.lat_cm} cm</div>`;
  } else {
    body += `<div class="analyze-line analyze-line--muted">${d.within}/${d.total} innerhalb ${d.radius_m} m (keine Putterachse erkannt)</div>`;
  }
  body += `</div>`;
  openSheet({ title: "Green-Analyse", bodyHtml: body });
}

// ----------------------------------------------------------- init
export function initPutting() {
  $("putten-picker").onclick = () => openPicker();
  $("putten-save").onclick = () => saveSession();
  initPhoto();

  // main.js drives stats navigation; we just (re)render into the containers.
  window.__renderPuttenStats = () => renderStats();

  onUserChange(() => loadStats());

  loadExercises();
}
