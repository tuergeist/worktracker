"use strict";

import { api, store, notifyUserChange, LS_USER, escapeHtml } from "./store.js";
import { openSheet, closeSheet, haptic } from "./ui.js";

let clubs = [];

// ----------------------------------------------------------- data
async function loadUsers() {
  store.users = await api.get("/api/users");
  const stored = parseInt(localStorage.getItem(LS_USER), 10);
  const valid = store.users.some((u) => u.id === stored);
  store.currentUserId = valid ? stored : store.users[0]?.id ?? null;
}

async function loadClubs() {
  clubs = await api.get("/api/clubs");
}

function setUser(id) {
  store.currentUserId = id;
  localStorage.setItem(LS_USER, String(id));
  notifyUserChange();
}

// Tell the Range view to reload its club chips after a change here.
function refreshRangeClubs() {
  if (typeof window.__reloadClubs === "function") window.__reloadClubs();
}

// ----------------------------------------------------------- settings sheet
function buildBody() {
  const playerRows = store.users.map((u) => {
    const current = u.id === store.currentUserId;
    const canDelete = store.users.length > 1;
    return `
      <div class="sheet-row" data-user="${u.id}">
        <span class="sheet-row__label">${escapeHtml(u.name)}</span>
        ${current ? '<span class="sheet-row__check">✓</span>' : ""}
        ${canDelete ? `<button class="sheet-row__del" data-del-user="${u.id}" aria-label="Spieler löschen">✕</button>` : ""}
      </div>`;
  }).join("");

  const clubRows = clubs.map((c) => `
      <div class="sheet-row">
        <span class="sheet-row__label">${escapeHtml(c.abbr)} · ${escapeHtml(c.name)}</span>
        <button class="sheet-row__del" data-del-club="${c.id}" aria-label="Schläger löschen">✕</button>
      </div>`).join("");

  return `
    <div class="sheet-section-title">Spieler</div>
    ${playerRows}
    <button class="sheet-add" data-add-user>+ Spieler</button>
    <div class="sheet-section-title">Schläger</div>
    ${clubRows}
    <button class="sheet-add" data-add-club>+ Schläger</button>`;
}

function wireBody() {
  const body = document.getElementById("sheet-body");

  // --- players ---
  body.querySelectorAll(".sheet-row[data-user]").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest("[data-del-user]")) return;
      const id = parseInt(row.dataset.user, 10);
      if (id === store.currentUserId) return;
      haptic("light");
      setUser(id);
      renderSheet();
    };
  });
  body.querySelectorAll("[data-del-user]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.delUser, 10);
      const u = store.users.find((x) => x.id === id);
      if (!u || !confirm(`Spieler „${u.name}“ und alle seine Daten löschen?`)) return;
      await api.send(`/api/users/${id}`, "DELETE");
      const wasCurrent = id === store.currentUserId;
      await loadUsers();
      if (wasCurrent) notifyUserChange();
      renderSheet();
    };
  });
  const addUser = body.querySelector("[data-add-user]");
  if (addUser) addUser.onclick = () => addPlayer();

  // --- clubs ---
  body.querySelectorAll("[data-del-club]").forEach((btn) => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.delClub, 10);
      const c = clubs.find((x) => x.id === id);
      if (!c || !confirm(`Schläger „${c.abbr} · ${c.name}“ löschen?`)) return;
      await api.send(`/api/clubs/${id}`, "DELETE");
      await loadClubs();
      refreshRangeClubs();
      renderSheet();
    };
  });
  const addClub = body.querySelector("[data-add-club]");
  if (addClub) addClub.onclick = () => addClubFlow();
}

async function addPlayer() {
  const name = prompt("Name des Spielers:");
  if (!name || !name.trim()) return;
  const user = await api.send("/api/users", "POST", { name: name.trim() });
  await loadUsers();
  setUser(user.id);
  renderSheet();
}

async function addClubFlow() {
  const abbr = prompt("Kürzel (z. B. 7i, Dr, PW):");
  if (!abbr || !abbr.trim()) return;
  const name = prompt("Bezeichnung (optional):", abbr.trim());
  const sort = clubs.length ? Math.max(...clubs.map((c) => c.sort_order)) + 10 : 100;
  await api.send("/api/clubs", "POST", {
    name: (name && name.trim()) || abbr.trim(),
    abbr: abbr.trim(),
    sort_order: sort,
  });
  await loadClubs();
  refreshRangeClubs();
  renderSheet();
}

function renderSheet() {
  openSheet({ title: "Einstellungen", bodyHtml: buildBody() });
  wireBody();
}

// Public: open the settings sheet (called by main.js).
export async function openSettings() {
  await loadClubs();
  renderSheet();
}

// ----------------------------------------------------------- init
export async function initUsers() {
  await loadUsers();
  // First launch / no players: prompt to add one.
  if (store.users.length === 0) {
    await loadClubs();
    renderSheet();
    await addPlayer();
    closeSheet();
  }
}
