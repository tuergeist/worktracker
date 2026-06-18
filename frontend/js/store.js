"use strict";

// Shared API client, global state (current user) and small DOM helpers.

export const LS_USER = "wt.currentUserId";

export const api = {
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

export const store = {
  users: [],
  currentUserId: null,
};

// Simple pub/sub so each topic view can refresh when the player changes.
const userListeners = [];
export function onUserChange(fn) { userListeners.push(fn); }
export function notifyUserChange() { userListeners.forEach((fn) => fn()); }

export function statBox(num, cap) {
  return `<div class="stat"><div class="num">${num}</div><div class="cap">${cap}</div></div>`;
}

export function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

export function show(id) { document.getElementById(id).hidden = false; }
export function hide(id) { document.getElementById(id).hidden = true; }
