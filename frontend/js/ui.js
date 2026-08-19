"use strict";

// Shared UI helpers: generic bottom sheet + haptic feedback.

const backdrop = () => document.getElementById("sheet-backdrop");
const sheetEl = () => document.getElementById("sheet");

// Open the generic bottom sheet with a title and HTML body.
export function openSheet({ title = "", bodyHtml = "" } = {}) {
  document.getElementById("sheet-title").textContent = title;
  document.getElementById("sheet-body").innerHTML = bodyHtml;

  const bd = backdrop();
  const sh = sheetEl();
  bd.hidden = false;
  sh.hidden = false;
  // Force a reflow so the transition runs from the hidden state.
  void sh.offsetWidth;
  bd.classList.add("sheet--open");
  sh.classList.add("sheet--open");

  bd.onclick = closeSheet;
}

// Close the bottom sheet.
export function closeSheet() {
  const bd = backdrop();
  const sh = sheetEl();
  bd.classList.remove("sheet--open");
  sh.classList.remove("sheet--open");

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finish = () => { bd.hidden = true; sh.hidden = true; };
  if (reduce) {
    finish();
  } else {
    setTimeout(finish, 200);
  }
}

// Short status message above the tab bar. The app has no other channel for
// "saved" / "save failed" — without it a failed request (bad reception on the
// range is the normal case) looks exactly like nothing happening.
let toastTimer = null;

export function toast(message, type = "info") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.toggle("toast--error", type === "error");
  el.hidden = false;
  // Force a reflow so the transition runs when re-showing an already-open toast.
  void el.offsetWidth;
  el.classList.add("toast--open");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("toast--open");
    setTimeout(() => { el.hidden = true; }, 200);
  }, type === "error" ? 5000 : 2500);
}

// Wrapper for anything that writes to the backend: reports failure to the user
// instead of letting the rejected promise vanish into the console.
export async function withSaveFeedback(fn, { ok, fail = "Speichern fehlgeschlagen. Nochmal versuchen." } = {}) {
  try {
    const result = await fn();
    if (ok) toast(ok);
    return { ok: true, result };
  } catch (e) {
    // A 401 already re-shows the login screen; a toast on top would confuse.
    if (String(e && e.message) === "unauthorized") return { ok: false };
    haptic("warning");
    toast(fail, "error");
    return { ok: false };
  }
}

const HAPTICS = {
  light:   10,
  medium:  20,
  success: [10, 40, 10],
  warning: [20, 40, 20],
};

// navigator.vibrate wrapper; silently no-ops where unsupported.
export function haptic(type = "light") {
  const pattern = HAPTICS[type];
  if (pattern && navigator.vibrate) navigator.vibrate(pattern);
}
