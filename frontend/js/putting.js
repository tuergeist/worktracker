"use strict";

import { api, store, statBox, escapeHtml, show, hide, onUserChange } from "./store.js";
import { lineChart } from "./chart.js";

function chartLabel(playedAt) {
  return new Date(playedAt + "Z").toLocaleDateString("de-DE", {
    day: "2-digit", month: "2-digit",
  });
}

const BUCKETS = ["1", "2", "3", "4+"];

const local = {
  exercises: [],
  selected: null,
  dist: { "1": 0, "2": 0, "3": 0, "4+": 0 },
  editingId: null,
};

// ----------------------------------------------------------- exercises
async function loadExercises() {
  local.exercises = await api.get("/api/exercises");
  renderExercises();
}

function renderExercises() {
  const list = document.getElementById("exercise-list");
  list.innerHTML = "";
  local.exercises.forEach((ex) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (local.selected?.id === ex.id ? " active" : "");
    chip.onclick = () => selectExercise(ex);

    const label = document.createElement("span");
    label.textContent = `${ex.name} · ${ex.num_balls} Bälle`;
    chip.appendChild(label);

    const edit = document.createElement("button");
    edit.className = "icon";
    edit.textContent = "✎";
    edit.title = "Übung bearbeiten";
    edit.onclick = (e) => { e.stopPropagation(); openForm(ex); };
    chip.appendChild(edit);

    if (!ex.is_default) {
      const del = document.createElement("button");
      del.className = "icon";
      del.textContent = "×";
      del.title = "Übung löschen";
      del.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Übung „${ex.name}" löschen?`)) return;
        await api.send(`/api/exercises/${ex.id}`, "DELETE");
        if (local.selected?.id === ex.id) {
          local.selected = null;
          hide("record-panel");
          hide("stats-panel");
        }
        await loadExercises();
      };
      chip.appendChild(del);
    }
    list.appendChild(chip);
  });
}

function selectExercise(ex) {
  local.selected = ex;
  local.dist = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  renderExercises();
  renderRecorder();
  loadStats();
  show("record-panel");
  show("stats-panel");
}

// ------------------------------------------------- create/edit exercise
function openForm(ex = null) {
  local.editingId = ex ? ex.id : null;
  document.getElementById("ex-name").value = ex ? ex.name : "";
  document.getElementById("ex-distance").value = ex ? ex.distance_m : "";
  document.getElementById("ex-balls").value = ex ? ex.num_balls : 10;
  document.getElementById("ex-submit").textContent = ex ? "Speichern" : "Anlegen";
  document.getElementById("exercise-form").hidden = false;
}

function closeForm() {
  local.editingId = null;
  document.getElementById("exercise-form").reset();
  document.getElementById("ex-balls").value = 10;
  document.getElementById("exercise-form").hidden = true;
}

// ----------------------------------------------------------- recorder
function renderRecorder() {
  document.getElementById("record-title").textContent =
    `Session erfassen — ${local.selected.name}`;
  const wrap = document.getElementById("balls");
  wrap.innerHTML = "";

  const labels = { "1": "1-Putt", "2": "2-Putts", "3": "3-Putts", "4+": "4+-Putts" };
  BUCKETS.forEach((bucket) => {
    const ball = document.createElement("div");
    ball.className = "ball";
    ball.innerHTML = `
      <div class="label">${labels[bucket]}</div>
      <div class="stepper">
        <button type="button" data-d="-1">−</button>
        <span class="value">${local.dist[bucket]}</span>
        <button type="button" data-d="1">+</button>
      </div>`;
    ball.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        const d = parseInt(btn.dataset.d, 10);
        const next = local.dist[bucket] + d;
        if (next < 0) return;
        const total = BUCKETS.reduce((s, b) => s + local.dist[b], 0);
        if (d > 0 && total >= local.selected.num_balls) return;
        local.dist[bucket] = next;
        ball.querySelector(".value").textContent = local.dist[bucket];
        renderLiveSummary();
      };
    });
    wrap.appendChild(ball);
  });
  renderLiveSummary();
}

function totalPutts() {
  return BUCKETS.reduce((s, b) => s + (b === "4+" ? 4 : parseInt(b)) * local.dist[b], 0);
}

function renderLiveSummary() {
  const assigned = BUCKETS.reduce((s, b) => s + local.dist[b], 0);
  const remaining = local.selected.num_balls - assigned;
  const putts = totalPutts();
  document.getElementById("live-summary").innerHTML = `
    ${statBox(putts, "Putts gesamt")}
    ${statBox(local.dist["1"], "1-Putts")}
    ${statBox(local.dist["2"], "2-Putts")}
    ${statBox(local.dist["3"], "3-Putts")}
    ${statBox(local.dist["4+"], "4+-Putts")}
    ${remaining > 0 ? statBox(remaining, "offen") : ""}`;
}

async function saveSession() {
  if (!store.currentUserId) { alert("Bitte zuerst einen Spieler anlegen."); return; }
  const assigned = BUCKETS.reduce((s, b) => s + local.dist[b], 0);
  if (assigned !== local.selected.num_balls) {
    alert(`Bitte alle ${local.selected.num_balls} Bälle vergeben (aktuell: ${assigned}).`);
    return;
  }
  // Reconstruct per-ball array for API (order irrelevant for stats)
  const results = [];
  BUCKETS.forEach((b) => {
    const v = b === "4+" ? 4 : parseInt(b);
    for (let i = 0; i < local.dist[b]; i++) results.push(v);
  });
  const note = document.getElementById("session-note").value.trim();
  await api.send("/api/sessions", "POST", {
    user_id: store.currentUserId,
    exercise_id: local.selected.id,
    results,
    note: note || null,
  });
  document.getElementById("session-note").value = "";
  local.dist = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  renderRecorder();
  loadStats();
}

// ----------------------------------------------------------- stats
async function loadStats() {
  if (!local.selected || !store.currentUserId) return;
  const u = store.currentUserId;
  const ex = local.selected.id;
  const stats = await api.get(`/api/exercises/${ex}/stats?user_id=${u}`);
  const sessions = await api.get(`/api/sessions?exercise_id=${ex}&user_id=${u}`);
  renderStats(stats, sessions);
}

function renderStats(stats, sessions) {
  const summary = document.getElementById("stats-summary");
  if (stats.sessions === 0) {
    summary.innerHTML = `<p class="empty">Noch keine Sessions — leg los! 🏌️</p>`;
  } else {
    summary.innerHTML = `
      ${statBox(stats.sessions, "Sessions")}
      ${statBox(stats.best_total_putts, "Bestwert (Putts)")}
      ${statBox(stats.avg_total_putts, "Ø Putts")}
      ${statBox(stats.last_total_putts, "Letzte")}
      ${statBox(stats.avg_one_putt_pct + "%", "Ø 1-Putt-Quote")}`;
  }

  // Trend: total putts per session over time (history is oldest -> newest)
  const chart = document.getElementById("putt-chart");
  const points = stats.history.map((h) => ({
    label: chartLabel(h.played_at),
    value: h.total_putts,
  }));
  chart.innerHTML = points.length >= 2
    ? lineChart(points)
    : `<p class="empty">Mehr Daten für einen Trend nötig.</p>`;

  const hist = document.getElementById("history");
  hist.innerHTML = sessions
    .map((s) => {
      const d = s.stats.distribution;
      const when = new Date(s.played_at + "Z").toLocaleString("de-DE", {
        dateStyle: "medium", timeStyle: "short",
      });
      return `<div class="history-row">
        <span class="when">${when}${s.note ? " · " + escapeHtml(s.note) : ""}</span>
        <span class="dist">1:${d["1"]} 2:${d["2"]} 3:${d["3"]} 4+:${d["4+"]}</span>
        <span class="total">${s.stats.total_putts} Putts</span>
      </div>`;
    })
    .join("");
}

// ----------------------------------------------------------- init
export function initPutting() {
  document.getElementById("save-session").onclick = saveSession;
  document.getElementById("add-exercise-btn").onclick = () => openForm(null);
  document.getElementById("cancel-exercise").onclick = closeForm;

  document.getElementById("exercise-form").onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("ex-name").value.trim(),
      distance_cm: Math.round(parseFloat(document.getElementById("ex-distance").value) * 100),
      num_balls: parseInt(document.getElementById("ex-balls").value, 10),
    };
    if (local.editingId) {
      const updated = await api.send(`/api/exercises/${local.editingId}`, "PATCH", payload);
      if (local.selected?.id === updated.id) {
        local.selected = updated;
        local.results = new Array(updated.num_balls).fill(1);
        renderRecorder();
      }
    } else {
      await api.send("/api/exercises", "POST", { category: "putting", ...payload });
    }
    closeForm();
    await loadExercises();
  };

  onUserChange(loadStats);
  loadExercises();
}
