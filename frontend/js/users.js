"use strict";

import { api, store, escapeHtml } from "./store.js";
import { openSheet, haptic } from "./ui.js";

let clubs = [];

async function loadClubs() {
  clubs = await api.get("/api/clubs");
}

// Tell the Range view to reload its club chips after a change here.
function refreshRangeClubs() {
  if (typeof window.__reloadClubs === "function") window.__reloadClubs();
}

// ----------------------------------------------------------- settings sheet
function buildBody() {
  const email = store.user?.email ? escapeHtml(store.user.email) : "—";

  const clubRows = clubs.map((c) => `
      <div class="sheet-row">
        <span class="sheet-row__label">${escapeHtml(c.abbr)} · ${escapeHtml(c.name)}</span>
        <button class="sheet-row__del" data-del-club="${c.id}" aria-label="Schläger löschen">✕</button>
      </div>`).join("");

  return `
    <div class="sheet-section-title">Account</div>
    <div class="sheet-row">
      <span class="sheet-row__label">${email}</span>
    </div>
    <button class="sheet-add" data-logout>Abmelden</button>
    <div class="sheet-section-title">Schläger</div>
    ${clubRows}
    <button class="sheet-add" data-add-club>+ Schläger</button>`;
}

function wireBody() {
  const body = document.getElementById("sheet-body");

  const logout = body.querySelector("[data-logout]");
  if (logout) {
    logout.onclick = async () => {
      try { await api.send("/api/auth/cookie/logout", "POST"); } catch (_) { /* ignore */ }
      window.location.reload();
    };
  }

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
  haptic("light");
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
