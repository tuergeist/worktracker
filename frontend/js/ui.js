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
