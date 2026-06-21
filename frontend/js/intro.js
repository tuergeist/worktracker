"use strict";

// First-run intro: a single calm full-screen card shown once, only after the
// user is authenticated. Dismissal is persisted so it never shows again.

const LS_SEEN = "scratchlab.introSeen";

export function maybeShowIntro() {
  if (localStorage.getItem(LS_SEEN)) return;

  const view = document.getElementById("view-intro");
  const done = document.getElementById("intro-done");
  if (!view || !done) return;

  function dismiss() {
    localStorage.setItem(LS_SEEN, "1");
    view.hidden = true;
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") dismiss();
  }

  done.addEventListener("click", dismiss, { once: true });
  document.addEventListener("keydown", onKey);

  view.hidden = false;
  done.focus();
}
