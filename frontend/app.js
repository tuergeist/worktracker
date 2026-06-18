"use strict";

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async send(url, method, body) {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  },
};

const LS_USER = "wt.currentUserId";

const state = {
  users: [],
  currentUserId: null,
  exercises: [],
  selected: null, // exercise object
  results: [],    // putts per ball for current recording
  editingId: null, // exercise id being edited, or null
};

// --------------------------------------------------------------- users
async function loadUsers() {
  state.users = await api.get("/api/users");
  const stored = parseInt(localStorage.getItem(LS_USER), 10);
  const valid = state.users.some((u) => u.id === stored);
  state.currentUserId = valid ? stored : state.users[0]?.id ?? null;
  renderUsers();
}

function renderUsers() {
  const sel = document.getElementById("user-select");
  sel.innerHTML = "";
  state.users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === state.currentUserId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setUser(id) {
  state.currentUserId = id;
  localStorage.setItem(LS_USER, String(id));
  if (state.selected) loadStats(); // refresh stats for the new player
}

// ----------------------------------------------------------- exercises
async function loadExercises() {
  state.exercises = await api.get("/api/exercises");
  renderExercises();
}

function renderExercises() {
  const list = document.getElementById("exercise-list");
  list.innerHTML = "";
  state.exercises.forEach((ex) => {
    const chip = document.createElement("div");
    chip.className = "exercise-chip" + (state.selected?.id === ex.id ? " active" : "");
    chip.onclick = () => selectExercise(ex);

    const label = document.createElement("span");
    label.textContent = `${ex.name} · ${ex.num_balls} Bälle`;
    chip.appendChild(label);

    const edit = document.createElement("button");
    edit.className = "icon";
    edit.textContent = "✎";
    edit.title = "Übung bearbeiten";
    edit.onclick = (e) => {
      e.stopPropagation();
      openExerciseForm(ex);
    };
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
        if (state.selected?.id === ex.id) {
          state.selected = null;
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
  state.selected = ex;
  state.results = new Array(ex.num_balls).fill(1);
  renderExercises();
  renderRecorder();
  loadStats();
  show("record-panel");
  show("stats-panel");
}

// ------------------------------------------------- exercise create/edit
function openExerciseForm(ex = null) {
  state.editingId = ex ? ex.id : null;
  document.getElementById("ex-name").value = ex ? ex.name : "";
  document.getElementById("ex-distance").value = ex ? ex.distance_m : "";
  document.getElementById("ex-balls").value = ex ? ex.num_balls : 10;
  document.getElementById("ex-submit").textContent = ex ? "Speichern" : "Anlegen";
  document.getElementById("exercise-form").hidden = false;
}

function closeExerciseForm() {
  state.editingId = null;
  document.getElementById("exercise-form").reset();
  document.getElementById("ex-balls").value = 10;
  document.getElementById("exercise-form").hidden = true;
}

// ----------------------------------------------------------- recorder
function renderRecorder() {
  const ex = state.selected;
  document.getElementById("record-title").textContent =
    `Session erfassen — ${ex.name}`;
  const wrap = document.getElementById("balls");
  wrap.innerHTML = "";
  state.results.forEach((putts, i) => {
    const ball = document.createElement("div");
    ball.className = "ball";
    ball.innerHTML = `
      <div class="label">Ball ${i + 1}</div>
      <div class="stepper">
        <button type="button" data-d="-1">−</button>
        <span class="value">${putts}</span>
        <button type="button" data-d="1">+</button>
      </div>`;
    ball.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        const d = parseInt(btn.dataset.d, 10);
        state.results[i] = Math.max(1, state.results[i] + d);
        ball.querySelector(".value").textContent = state.results[i];
        renderLiveSummary();
      };
    });
    wrap.appendChild(ball);
  });
  renderLiveSummary();
}

function computeStats(results) {
  const dist = { "1": 0, "2": 0, "3": 0, "4+": 0 };
  results.forEach((p) => {
    dist[p <= 3 ? String(p) : "4+"] += 1;
  });
  const total = results.reduce((a, b) => a + b, 0);
  return { total, dist, num: results.length };
}

function renderLiveSummary() {
  const s = computeStats(state.results);
  document.getElementById("live-summary").innerHTML = `
    ${statBox(s.total, "Putts gesamt")}
    ${statBox(s.dist["1"], "1-Putts")}
    ${statBox(s.dist["2"], "2-Putts")}
    ${statBox(s.dist["3"], "3-Putts")}
    ${statBox(s.dist["4+"], "4+-Putts")}`;
}

function statBox(num, cap) {
  return `<div class="stat"><div class="num">${num}</div><div class="cap">${cap}</div></div>`;
}

async function saveSession() {
  if (!state.currentUserId) {
    alert("Bitte zuerst einen Spieler anlegen.");
    return;
  }
  const note = document.getElementById("session-note").value.trim();
  await api.send("/api/sessions", "POST", {
    user_id: state.currentUserId,
    exercise_id: state.selected.id,
    results: state.results,
    note: note || null,
  });
  document.getElementById("session-note").value = "";
  state.results = new Array(state.selected.num_balls).fill(1);
  renderRecorder();
  loadStats();
}

// ----------------------------------------------------------- stats
async function loadStats() {
  if (!state.selected || !state.currentUserId) return;
  const u = state.currentUserId;
  const ex = state.selected.id;
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
      ${bigStat(stats.sessions, "Sessions")}
      ${bigStat(stats.best_total_putts, "Bestwert (Putts)")}
      ${bigStat(stats.avg_total_putts, "Ø Putts")}
      ${bigStat(stats.last_total_putts, "Letzte")}
      ${bigStat(stats.avg_one_putt_pct + "%", "Ø 1-Putt-Quote")}`;
  }

  const hist = document.getElementById("history");
  if (!sessions.length) {
    hist.innerHTML = "";
    return;
  }
  hist.innerHTML = sessions
    .map((s) => {
      const d = s.stats.distribution;
      const when = new Date(s.played_at + "Z").toLocaleString("de-DE", {
        dateStyle: "medium",
        timeStyle: "short",
      });
      return `<div class="history-row">
        <span class="when">${when}${s.note ? " · " + escapeHtml(s.note) : ""}</span>
        <span class="dist">1:${d["1"]} 2:${d["2"]} 3:${d["3"]} 4+:${d["4+"]}</span>
        <span class="total">${s.stats.total_putts} Putts</span>
      </div>`;
    })
    .join("");
}

function bigStat(num, cap) {
  return `<div class="stat"><div class="num">${num}</div><div class="cap">${cap}</div></div>`;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ----------------------------------------------------------- helpers
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

// ----------------------------------------------------------- wiring
document.getElementById("user-select").onchange = (e) =>
  setUser(parseInt(e.target.value, 10));

document.getElementById("add-user-btn").onclick = async () => {
  const name = prompt("Name des Spielers:");
  if (!name || !name.trim()) return;
  const user = await api.send("/api/users", "POST", { name: name.trim() });
  await loadUsers();
  setUser(user.id);
  renderUsers();
};

document.getElementById("del-user-btn").onclick = async () => {
  const u = state.users.find((x) => x.id === state.currentUserId);
  if (!u) return;
  if (state.users.length <= 1) {
    alert("Der letzte Spieler kann nicht gelöscht werden.");
    return;
  }
  if (!confirm(`Spieler „${u.name}" und alle seine Sessions löschen?`)) return;
  await api.send(`/api/users/${u.id}`, "DELETE");
  await loadUsers();
  renderUsers();
  if (state.selected) loadStats();
};

document.getElementById("save-session").onclick = saveSession;

document.getElementById("add-exercise-btn").onclick = () => openExerciseForm(null);
document.getElementById("cancel-exercise").onclick = closeExerciseForm;

document.getElementById("exercise-form").onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById("ex-name").value.trim();
  const meters = parseFloat(document.getElementById("ex-distance").value);
  const balls = parseInt(document.getElementById("ex-balls").value, 10);
  const payload = {
    name,
    distance_cm: Math.round(meters * 100),
    num_balls: balls,
  };
  if (state.editingId) {
    const updated = await api.send(`/api/exercises/${state.editingId}`, "PATCH", payload);
    if (state.selected?.id === updated.id) {
      // keep selection in sync (e.g. ball count may have changed)
      state.selected = updated;
      state.results = new Array(updated.num_balls).fill(1);
      renderRecorder();
    }
  } else {
    await api.send("/api/exercises", "POST", { category: "putting", ...payload });
  }
  closeExerciseForm();
  await loadExercises();
};

// ----------------------------------------------------------- init
(async function init() {
  await loadUsers();
  await loadExercises();
})();
