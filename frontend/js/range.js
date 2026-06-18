"use strict";

import { api, store, statBox, escapeHtml, show, hide, onUserChange } from "./store.js";

const local = {
  clubs: [],
  tags: [],
  selected: null,
  editingId: null,
  pickedTags: new Set(),
};

// --------------------------------------------------------------- clubs
async function loadClubs() {
  local.clubs = await api.get("/api/clubs");
  renderClubs();
}

function renderClubs() {
  const list = document.getElementById("club-list");
  list.innerHTML = "";
  local.clubs.forEach((c) => {
    const chip = document.createElement("div");
    chip.className = "chip" + (local.selected?.id === c.id ? " active" : "");
    chip.onclick = () => selectClub(c);

    const label = document.createElement("span");
    label.textContent = `${c.abbr} · ${c.name}`;
    chip.appendChild(label);

    const edit = document.createElement("button");
    edit.className = "icon";
    edit.textContent = "✎";
    edit.title = "Schläger bearbeiten";
    edit.onclick = (e) => { e.stopPropagation(); openForm(c); };
    chip.appendChild(edit);

    if (!c.is_default) {
      const del = document.createElement("button");
      del.className = "icon";
      del.textContent = "×";
      del.title = "Schläger löschen";
      del.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(`Schläger „${c.name}" löschen?`)) return;
        await api.send(`/api/clubs/${c.id}`, "DELETE");
        if (local.selected?.id === c.id) {
          local.selected = null;
          hide("shot-panel");
          hide("club-stats-panel");
        }
        await loadClubs();
      };
      chip.appendChild(del);
    }
    list.appendChild(chip);
  });
}

function selectClub(c) {
  local.selected = c;
  renderClubs();
  document.getElementById("shot-title").textContent = `Schlag erfassen — ${c.name}`;
  resetShotForm();
  loadStats();
  show("shot-panel");
  show("club-stats-panel");
}

// --------------------------------------------------------- create/edit
function openForm(c = null) {
  local.editingId = c ? c.id : null;
  document.getElementById("club-name").value = c ? c.name : "";
  document.getElementById("club-abbr").value = c ? c.abbr : "";
  document.getElementById("club-order").value = c ? c.sort_order : 100;
  document.getElementById("club-submit").textContent = c ? "Speichern" : "Anlegen";
  document.getElementById("club-form").hidden = false;
}

function closeForm() {
  local.editingId = null;
  document.getElementById("club-form").reset();
  document.getElementById("club-order").value = 100;
  document.getElementById("club-form").hidden = true;
}

// ----------------------------------------------------------- shot tags
function renderTagToggles() {
  const wrap = document.getElementById("shot-tags");
  wrap.innerHTML = "";
  local.tags.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tag-toggle" + (local.pickedTags.has(t) ? " on" : "");
    btn.textContent = t;
    btn.onclick = () => {
      if (local.pickedTags.has(t)) local.pickedTags.delete(t);
      else local.pickedTags.add(t);
      btn.classList.toggle("on");
    };
    wrap.appendChild(btn);
  });
}

function resetShotForm() {
  document.getElementById("shot-carry").value = "";
  document.getElementById("shot-drift-dir").value = "0";
  document.getElementById("shot-drift-m").value = 0;
  document.getElementById("shot-note").value = "";
  local.pickedTags.clear();
  renderTagToggles();
}

function driftValue() {
  const dir = parseInt(document.getElementById("shot-drift-dir").value, 10);
  const m = parseFloat(document.getElementById("shot-drift-m").value) || 0;
  return dir * Math.abs(m); // -left, +right, 0 straight
}

async function saveShot() {
  if (!store.currentUserId) { alert("Bitte zuerst einen Spieler anlegen."); return; }
  const carry = parseFloat(document.getElementById("shot-carry").value);
  if (isNaN(carry) || carry < 0) { alert("Bitte eine gültige Carry-Distanz angeben."); return; }
  const note = document.getElementById("shot-note").value.trim();
  await api.send("/api/shots", "POST", {
    user_id: store.currentUserId,
    club_id: local.selected.id,
    carry_m: carry,
    drift_m: driftValue(),
    tags: [...local.pickedTags],
    note: note || null,
  });
  resetShotForm();
  document.getElementById("shot-carry").focus();
  loadStats();
}

// ----------------------------------------------------------- stats
function driftLabel(m) {
  if (Math.abs(m) < 0.5) return "gerade";
  return `${Math.abs(m)} m ${m < 0 ? "links" : "rechts"}`;
}

async function loadStats() {
  if (!local.selected || !store.currentUserId) return;
  const u = store.currentUserId;
  const c = local.selected.id;
  const stats = await api.get(`/api/clubs/${c}/stats?user_id=${u}`);
  renderStats(stats);
}

function renderStats(stats) {
  const summary = document.getElementById("club-stats-summary");
  const tagWrap = document.getElementById("club-tag-counts");
  const hist = document.getElementById("shot-history");

  if (stats.shots === 0) {
    summary.innerHTML = `<p class="empty">Noch keine Schläge — los geht's! 🏌️</p>`;
    tagWrap.innerHTML = "";
    hist.innerHTML = "";
    return;
  }

  summary.innerHTML = `
    ${statBox(stats.shots, "Schläge")}
    ${statBox(stats.avg_carry + " m", "Ø Carry")}
    ${statBox(stats.max_carry + " m", "Max Carry")}
    ${statBox(stats.min_carry + " m", "Min Carry")}
    ${statBox("± " + stats.avg_abs_drift + " m", "Ø Streuung")}
    ${statBox(driftLabel(stats.avg_drift), "Tendenz")}`;

  const tags = Object.entries(stats.tag_counts).sort((a, b) => b[1] - a[1]);
  tagWrap.innerHTML = tags.length
    ? tags.map(([t, n]) => `<span class="tag-count">${escapeHtml(t)} <b>${n}</b></span>`).join("")
    : "";

  hist.innerHTML = stats.history
    .map((s) => {
      const when = new Date(s.played_at + "Z").toLocaleString("de-DE", {
        dateStyle: "short", timeStyle: "short",
      });
      const tags = s.tags.length ? " · " + s.tags.map(escapeHtml).join(", ") : "";
      const note = s.note ? " · " + escapeHtml(s.note) : "";
      return `<div class="history-row">
        <span class="when">${when}</span>
        <span class="dist">${driftLabel(s.drift_m)}${tags}${note}</span>
        <span class="total">${s.carry_m} m</span>
      </div>`;
    })
    .join("");
}

// ----------------------------------------------------------- init
export async function initRange() {
  local.tags = await api.get("/api/shot-tags");
  renderTagToggles();

  document.getElementById("save-shot").onclick = saveShot;
  document.getElementById("add-club-btn").onclick = () => openForm(null);
  document.getElementById("cancel-club").onclick = closeForm;

  document.getElementById("club-form").onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById("club-name").value.trim(),
      abbr: document.getElementById("club-abbr").value.trim(),
      sort_order: parseInt(document.getElementById("club-order").value, 10) || 100,
    };
    if (local.editingId) {
      const updated = await api.send(`/api/clubs/${local.editingId}`, "PATCH", payload);
      if (local.selected?.id === updated.id) {
        local.selected = updated;
        document.getElementById("shot-title").textContent = `Schlag erfassen — ${updated.name}`;
      }
    } else {
      await api.send("/api/clubs", "POST", payload);
    }
    closeForm();
    await loadClubs();
  };

  onUserChange(loadStats);
  loadClubs();
}
