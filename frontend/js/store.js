"use strict";

// Shared API client, global state (authenticated user) and small DOM helpers.

// On any 401 the session is gone: drop the user and re-show the login screen.
function handleUnauthorized() {
  store.user = null;
  notifyUserChange();
  if (typeof window.__showLogin === "function") window.__showLogin();
}

export const api = {
  async get(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (r.status === 401) { handleUnauthorized(); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async send(url, method, body) {
    const r = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) { handleUnauthorized(); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  },
};

export const store = {
  user: null, // authenticated user object, or null when logged out
};

// Simple pub/sub so each topic view can refresh when the auth state changes.
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
