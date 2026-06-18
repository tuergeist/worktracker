"use strict";

import { api, store, notifyUserChange, LS_USER } from "./store.js";

async function loadUsers() {
  store.users = await api.get("/api/users");
  const stored = parseInt(localStorage.getItem(LS_USER), 10);
  const valid = store.users.some((u) => u.id === stored);
  store.currentUserId = valid ? stored : store.users[0]?.id ?? null;
  renderUsers();
}

function renderUsers() {
  const sel = document.getElementById("user-select");
  sel.innerHTML = "";
  store.users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === store.currentUserId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setUser(id) {
  store.currentUserId = id;
  localStorage.setItem(LS_USER, String(id));
  notifyUserChange();
}

export async function initUsers() {
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
    const u = store.users.find((x) => x.id === store.currentUserId);
    if (!u) return;
    if (store.users.length <= 1) {
      alert("Der letzte Spieler kann nicht gelöscht werden.");
      return;
    }
    if (!confirm(`Spieler „${u.name}" und alle seine Daten löschen?`)) return;
    await api.send(`/api/users/${u.id}`, "DELETE");
    await loadUsers();
    notifyUserChange();
  };

  await loadUsers();
}
