"use strict";

import { api, store, escapeHtml } from "./store.js";
import { haptic } from "./ui.js";

let clubs = [];

async function loadClubs() {
  clubs = await api.get("/api/clubs");
}

// Tell the Range view to reload its club chips after a change here.
function refreshRangeClubs() {
  if (typeof window.__reloadClubs === "function") window.__reloadClubs();
}

// ----------------------------------------------------------- settings page
function renderEmail() {
  const el = document.getElementById("settings-email");
  if (el) el.textContent = store.user?.email ? store.user.email : "—";
}

function renderClubs() {
  const wrap = document.getElementById("settings-clubs");
  if (!wrap) return;
  wrap.innerHTML = clubs.map((c) => `
      <div class="settings-row">
        <span class="settings-row__label">${escapeHtml(c.abbr)} · ${escapeHtml(c.name)}</span>
        <button class="sheet-row__del" data-del-club="${c.id}" aria-label="Schläger löschen">✕</button>
      </div>`).join("");

  wrap.querySelectorAll("[data-del-club]").forEach((btn) => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.delClub, 10);
      const c = clubs.find((x) => x.id === id);
      if (!c || !confirm(`Schläger „${c.abbr} · ${c.name}“ löschen?`)) return;
      await api.send(`/api/clubs/${id}`, "DELETE");
      await loadClubs();
      refreshRangeClubs();
      renderClubs();
    };
  });
}

function wirePage() {
  const logout = document.getElementById("settings-logout");
  if (logout) {
    logout.onclick = async () => {
      try { await api.send("/api/auth/cookie/logout", "POST"); } catch (_) { /* ignore */ }
      window.location.reload();
    };
  }

  const addClub = document.getElementById("settings-add-club");
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
  renderClubs();
}

// Public: populate the settings page (main.js then switches to the view).
export async function showSettings() {
  renderEmail();
  wirePage();
  await loadClubs();
  renderClubs();
}
