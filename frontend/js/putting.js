"use strict";

import { api, store, onUserChange, escapeHtml } from "./store.js";
import { openSheet, closeSheet, haptic, withSaveFeedback } from "./ui.js";
import { lineChart } from "./chart.js";

const BUCKETS = ["1", "2", "3", "4+"];
const LABELS = { "1": "1-Putt", "2": "2-Putts", "3": "3-Putts", "4+": "4+ Putts" };

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

function remaining() {
  return local.selected ? Math.max(0, local.selected.num_balls - assigned()) : 0;
}

// "18.06. 14:30" within the last 11 months, "18.06.24 14:30" once older
// (the year is only worth showing once the date gets ambiguous).
function shortDate(playedAt) {
  const d = new Date(playedAt + "Z");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 11);
  const dateOpts = d < cutoff
    ? { day: "2-digit", month: "2-digit", year: "2-digit" }
    : { day: "2-digit", month: "2-digit" };
  const date = d.toLocaleDateString("de-DE", dateOpts);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

// chart axis label
function chartLabel(playedAt) {
  return new Date(playedAt + "Z").toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit",
  });
}

// "2026-06-20" -> "20.06"
function dayLabel(date) {
  return date.slice(5).split("-").reverse().join(".");
}

function fmt2(v) {
  return v == null ? "–" : Number(v).toFixed(2);
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
  const text = local.selected
    ? `${local.selected.name} · ${local.selected.num_balls} Bälle`
    : "Keine Übung";
  // Record view chip + Statistik tab chip share the same selection.
  const a = $("putten-picker-label");
  const b = $("stats-putten-picker-label");
  if (a) a.textContent = text;
  if (b) b.textContent = text;
}

function selectExercise(ex) {
  local.selected = ex;
  resetDist();
  renderPickerLabel();
  renderGrid();
  loadStats();
}

// ----------------------------------------------------------- counter grid
// One cell per putt count. Besides ±1 each cell can absorb every ball that is
// still unassigned ("Rest +8") — the common case is a handful of misses and
// the remainder as 1-Putts, which otherwise means tapping "+" eight times.
function renderGrid() {
  const grid = $("putten-grid");
  if (!local.selected) { grid.innerHTML = ""; renderProgress(); return; }

  const rest = remaining();
  const atMax = rest === 0;

  grid.innerHTML = BUCKETS.map((bucket) => {
    const v = local.dist[bucket];
    const cls =
      bucket === local.lastBucket ? "counter-cell counter-cell--active"
      : v === 0 ? "counter-cell counter-cell--zero"
      : "counter-cell";
    const minusDis = v === 0 ? " disabled" : "";
    const plusDis = atMax ? " disabled" : "";
    // Kept in the layout when there is no remainder so finishing the last ball
    // doesn't shift the grid (and with it the Speichern button) under the thumb.
    const restHidden = atMax ? ' style="visibility:hidden"' : "";
    return `
      <div class="${cls}" role="group" aria-label="${LABELS[bucket]}, ${v} mal">
        <div class="counter-cell__dot"></div>
        <span class="counter-cell__label">${LABELS[bucket]}</span>
        <div class="counter-cell__controls">
          <button class="counter-btn counter-btn--minus" data-bucket="${bucket}" data-d="-1" aria-label="${LABELS[bucket]} verringern"${minusDis}>−</button>
          <span class="counter-cell__value">${v}</span>
          <button class="counter-btn counter-btn--plus" data-bucket="${bucket}" data-d="1" aria-label="${LABELS[bucket]} erhöhen"${plusDis}>+</button>
        </div>
        <button class="counter-cell__rest" data-rest="${bucket}"${restHidden}
                aria-label="Alle ${rest} restlichen Bälle als ${LABELS[bucket]}">Rest +${rest}</button>
      </div>`;
  }).join("");

  grid.querySelectorAll(".counter-btn").forEach((btn) => {
    btn.onclick = () => step(btn.dataset.bucket, parseInt(btn.dataset.d, 10));
  });
  grid.querySelectorAll("[data-rest]").forEach((btn) => {
    btn.onclick = () => fillRest(btn.dataset.rest);
  });

  renderProgress();
}

function step(bucket, d) {
  const next = local.dist[bucket] + d;
  if (next < 0) return;
  if (d > 0 && remaining() === 0) {
    haptic("warning");
    return;
  }
  local.dist[bucket] = next;
  if (d > 0) local.lastBucket = bucket;
  haptic("light");
  renderGrid();
}

function fillRest(bucket) {
  const rest = remaining();
  if (rest === 0) return;
  local.dist[bucket] += rest;
  local.lastBucket = bucket;
  haptic("medium");
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

// Any ball count can be saved, not just a full set: stats are normalised per
// ball, and a session cut short (weather, course closing) is still data worth
// keeping — requiring exactly num_balls just meant losing it.
function updateSaveBtn() {
  const btn = $("putten-save");
  const total = assigned();
  btn.disabled = !local.selected || total === 0;
  btn.textContent = local.selected && total > 0 && total !== local.selected.num_balls
    ? `${total} Bälle speichern`
    : "Speichern";
}

// ----------------------------------------------------------- exercise picker
// Reused by both the record-view chip and the Statistik tab chip.
function openPicker() {
  const sorted = [...local.exercises].sort((a, b) =>
    a.name.localeCompare(b.name, "de", { numeric: true }));
  const rows = sorted.map((ex) => {
    const current = local.selected && ex.id === local.selected.id;
    const canDelete = !ex.is_default;
    const n = ex.session_count || 0;
    return `
      <div class="sheet-row" data-id="${ex.id}">
        <span class="sheet-row__label">${escapeHtml(ex.name)} · ${ex.num_balls} Bälle</span>
        <span class="sheet-row__count" title="${n} gespeicherte Sessions">${n}</span>
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
      const { ok } = await withSaveFeedback(
        () => api.send(`/api/exercises/${id}`, "DELETE"),
        { ok: "Übung gelöscht", fail: "Löschen fehlgeschlagen." },
      );
      if (!ok) return;
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

  const { ok, result: ex } = await withSaveFeedback(
    () => api.send("/api/exercises", "POST", {
      category: "putting",
      name: name.trim(),
      distance_cm,
      num_balls,
    }),
    { ok: "Übung angelegt", fail: "Anlegen fehlgeschlagen." },
  );
  if (!ok) return;
  await loadExercises();
  selectExercise(ex);
  closeSheet();
}

// ----------------------------------------------------------- save
async function saveSession() {
  if (!local.selected || assigned() === 0) {
    haptic("warning");
    return;
  }

  // Reconstruct per-ball results array (4+ -> value 4).
  const results = [];
  BUCKETS.forEach((b) => {
    const v = b === "4+" ? 4 : parseInt(b, 10);
    for (let i = 0; i < local.dist[b]; i++) results.push(v);
  });

  const { ok } = await withSaveFeedback(
    () => api.send("/api/sessions", "POST", {
      exercise_id: local.selected.id,
      results,
      note: null,
    }),
    { ok: `Gespeichert · ${results.length} Bälle` },
  );
  if (!ok) return; // keep the entered counts so the user can retry

  haptic("success");
  resetDist();
  renderGrid(); // ready for the next round
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

  if (!local.selected) {
    cards.innerHTML = "";
    chart.innerHTML = "";
    hist.innerHTML = `<div class="empty">Noch keine Sessions — leg los! 🏌️</div>`;
    return;
  }

  const ex = local.selected.id;
  const stats = await api.get(`/api/exercises/${ex}/stats`);
  const sessions = await api.get(`/api/sessions?exercise_id=${ex}`);

  // no sessions yet → clean empty state, no "null" cards
  if (!stats.sessions) {
    cards.innerHTML = "";
    chart.innerHTML = "";
    hist.innerHTML = `<div class="empty">Noch keine Sessions — leg los! 🏌️</div>`;
    return;
  }

  // cards — normalised to putts per ball (lower = better)
  cards.innerHTML = [
    statCard(stats.sessions, "Sessions"),
    statCard(fmt2(stats.best_ppb), "Bestwert (Putts/Ball)", true),
    statCard(fmt2(stats.avg_ppb), "Ø Putts/Ball"),
    statCard(stats.avg_one_putt_pct + " %", "1-Putt-Quote", true),
  ].join("");

  // chart: per-day consolidated putts/ball, with 95% CI whiskers when >2/day
  const points = (stats.daily || []).map((d) => ({
    label: dayLabel(d.date),
    value: d.avg_ppb,
    ciLow: d.ci != null ? d.avg_ppb - d.ci : undefined,
    ciHigh: d.ci != null ? d.avg_ppb + d.ci : undefined,
  }));
  // Putts/Ball improves downwards, which reads as a slump unless it says so.
  chart.innerHTML = points.length >= 2
    ? `<div class="chart-card">${lineChart(points, { decimals: 2 })}<p class="chart-hint">weniger ist besser</p></div>`
    : `<div class="chart-card"><p class="empty">Mehr Daten für einen Trend nötig.</p></div>`;

  // history
  if (!sessions.length) {
    hist.innerHTML = `<div class="empty">Noch keine Sessions — leg los! 🏌️</div>`;
    return;
  }
  hist.innerHTML = `<div class="history-card">${sessions.map(historyRow).join("")}</div>`;

  hist.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.del, 10);
      if (!confirm("Diese Session löschen?")) return;
      haptic("light");
      const { ok } = await withSaveFeedback(
        () => api.send(`/api/sessions/${id}`, "DELETE"),
        { ok: "Session gelöscht", fail: "Löschen fehlgeschlagen." },
      );
      if (ok) loadStats();
    };
  });

  hist.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => editSessionDate(parseInt(btn.dataset.edit, 10), btn.dataset.at);
  });
}

// Tap a history date -> native date/time picker. Stored value is UTC text
// ("YYYY-MM-DD HH:MM:SS"); the picker works in local time, so convert both ways.
function editSessionDate(id, playedAt) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(playedAt + "Z");
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  input.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.appendChild(input);
  input.onchange = async () => {
    if (input.value) {
      const t = new Date(input.value); // parsed as local time
      const utc = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
        + ` ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
      haptic("light");
      const { ok } = await withSaveFeedback(
        () => api.send(`/api/sessions/${id}`, "PATCH", { played_at: utc }),
        { ok: "Datum geändert", fail: "Änderung fehlgeschlagen." },
      );
      if (ok) loadStats();
    }
    input.remove();
  };
  if (input.showPicker) input.showPicker();
  else input.focus();
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
      <button class="history-row__date" data-edit="${s.id}" data-at="${s.played_at}" aria-label="Datum ändern">${shortDate(s.played_at)}</button>
      <div class="history-row__dist">${chips}</div>
      <div class="history-row__total">${fmt2(s.stats.avg_putts_per_ball)} <span>Putts/Ball</span></div>
      <button class="history-row__del" data-del="${s.id}" aria-label="Session löschen">✕</button>
    </div>`;
}

// ----------------------------------------------------------- init
export function initPutting() {
  $("putten-picker").onclick = () => openPicker();
  $("stats-putten-picker").onclick = () => openPicker();
  $("putten-save").onclick = () => saveSession();

  // main.js drives stats navigation; we just (re)render into the containers.
  window.__renderPuttenStats = () => renderStats();

  onUserChange(() => loadStats());

  loadExercises();
}
