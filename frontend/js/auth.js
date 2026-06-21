"use strict";

// Auth gate: cookie-based session via fastapi-users + Google login.
// On startup we ask the backend who we are; if nobody, show the login screen.

import { api, store, notifyUserChange } from "./store.js";

const APP = () => document.getElementById("app");
const LOGIN = () => document.getElementById("view-login");

// Show the full-screen login overlay, hide the app shell.
function showLogin() {
  store.user = null;
  LOGIN().hidden = false;
  APP().hidden = true;
}

// Hide the login overlay, reveal the app shell.
function showApp() {
  LOGIN().hidden = true;
  APP().hidden = false;
}

// Kick off the Google OAuth dance.
async function startGoogleLogin() {
  const btn = document.getElementById("login-google");
  if (btn) btn.disabled = true;
  try {
    const data = await api.get("/api/auth/google/authorize");
    window.location.href = data.authorization_url;
  } catch (e) {
    if (btn) btn.disabled = false;
    const err = document.getElementById("login-error");
    if (err) err.hidden = false;
  }
}

function wireLogin() {
  const btn = document.getElementById("login-google");
  if (btn) btn.onclick = () => startGoogleLogin();
}

// Run before the rest of the app boots. Returns true when authenticated.
export async function initAuth() {
  // Let store.js (and any 401 elsewhere) re-show the login screen.
  window.__showLogin = showLogin;
  wireLogin();

  try {
    const me = await api.get("/api/users/me");
    store.user = me;
    notifyUserChange();
    showApp();
    return true;
  } catch (e) {
    // 401 (or any failure) → not logged in.
    showLogin();
    return false;
  }
}
