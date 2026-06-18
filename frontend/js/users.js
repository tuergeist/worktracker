"use strict";

import { api, store, notifyUserChange, LS_USER, escapeHtml } from "./store.js";
import { openSheet, closeSheet, haptic } from "./ui.js";

// ----------------------------------------------------------- data
async function loadUsers() {
  store.users = await api.get("/api/users");
  const stored = parseInt(localStorage.getItem(LS_USER), 10);
  const valid = store.users.some((u) => u.id === stored);
  store.currentUserId = valid ? stored : store.users[0]?.id ?? null;
}

function setUser(id) {
  store.currentUserId = id;
  localStorage.setItem(LS_USER, String(id));
  notifyUserChange();
}

// ----------------------------------------------------------- settings sheet
function buildBody() {
  const rows = store.users.map((u) => {
    const current = u.id === store.currentUserId;
    const canDelete = store.users.length > 1;
    return `
      <div class="sheet-row" data-id="${u.id}">
        <span class="sheet-row__label">${escapeHtml(u.name)}</span>
        ${current ? '<span class="sheet-row__check">✓</span>' : ""}
        ${canDelete ? `<button class="sheet-row__del" data-del="${u.id}" aria-label="Spieler löschen">✕</button>` : ""}
      </div>`;
  }).join("");
  return `${rows}<button class="sheet-add" data-add>+ Spieler</button>`;
}

function wireBody() {
  const body = document.getElementById("sheet-body");

  body.querySelectorAll(".sheet-row").forEach((row) => {
    row.onclick = (e) => {
      if (e.target.closest("[data-del]")) return; // delete handled separately
      const id = parseInt(row.dataset.id, 10);
      if (id === store.currentUserId) return;
      haptic("light");
      setUser(id);
      renderSheet();
    };
  });

  body.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.del, 10);
      const u = store.users.find((x) => x.id === id);
      if (!u) return;
      if (!confirm(`Spieler „${u.name}“ und alle seine Daten löschen?`)) return;
      await api.send(`/api/users/${id}`, "DELETE");
      const wasCurrent = id === store.currentUserId;
      await loadUsers();
      if (wasCurrent) notifyUserChange();
      renderSheet();
    };
  });

  const add = body.querySelector("[data-add]");
  if (add) add.onclick = () => addPlayer();
}

async function addPlayer() {
  const name = prompt("Name des Spielers:");
  if (!name || !name.trim()) return;
  const user = await api.send("/api/users", "POST", { name: name.trim() });
  await loadUsers();
  setUser(user.id);
  renderSheet();
}

function renderSheet() {
  openSheet({ title: "Spieler", bodyHtml: buildBody() });
  wireBody();
}

// Public: open the settings/player sheet (called by main.js).
export function openSettings() {
  renderSheet();
}

// ----------------------------------------------------------- init
export async function initUsers() {
  await loadUsers();
  // First launch / no players: prompt to add one.
  if (store.users.length === 0) {
    renderSheet();
    await addPlayer();
    closeSheet();
  }
}
