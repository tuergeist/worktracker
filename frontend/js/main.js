"use strict";

import { initAuth } from "./auth.js";
import { showSettings } from "./users.js";
import { initPutting } from "./putting.js";
import { initRange } from "./range.js";
import { maybeShowIntro } from "./intro.js";

const LS_TAB = "wt.tab";

// Each bottom tab maps to exactly one view.
const VIEWS = {
  putten: "view-putten-record",
  range:  "view-range-record",
  stats:  "view-stats",
};

let lastTab = "putten"; // remembers where the gear's "← Zurück" returns to

function setView(id) {
  document.querySelectorAll("#main .view").forEach((v) => {
    v.hidden = v.id !== id;
  });
}

// Switch tabs and show the matching view.
function activateTab(name) {
  if (!VIEWS[name]) name = "putten";
  lastTab = name;
  document.querySelectorAll(".tab-item").forEach((t) =>
    t.classList.toggle("tab-item--active", t.dataset.tab === name)
  );
  setView(VIEWS[name]);
  localStorage.setItem(LS_TAB, name);
  if (name === "stats") renderActiveSegment();
}

function wireTabs() {
  document.querySelectorAll(".tab-item").forEach((t) => {
    t.onclick = () => activateTab(t.dataset.tab);
  });
}

// ── Statistik tab: segmented control toggles Putten / Range panes ──────────
let statsSeg = "putten";

function renderActiveSegment() {
  if (statsSeg === "range") window.__renderRangeStats?.();
  else window.__renderPuttenStats?.();
}

function setSegment(seg) {
  statsSeg = seg === "range" ? "range" : "putten";
  document.querySelectorAll(".seg-control__btn").forEach((b) => {
    const on = b.dataset.seg === statsSeg;
    b.classList.toggle("seg-control__btn--active", on);
    b.setAttribute("aria-selected", String(on));
  });
  document.getElementById("stats-pane-putten").hidden = statsSeg !== "putten";
  document.getElementById("stats-pane-range").hidden = statsSeg !== "range";
  renderActiveSegment();
}

function wireStatsSegments() {
  document.querySelectorAll(".seg-control__btn").forEach((b) => {
    b.onclick = () => setSegment(b.dataset.seg);
  });
}

// ── Settings page (reached via the header gear) ────────────────────────────
function wireSettings() {
  document.getElementById("settings-btn").onclick = () => {
    showSettings();
    setView("view-settings");
  };
  document.getElementById("settings-back").onclick = () => activateTab(lastTab);
}

(async function init() {
  // Auth gate first: only boot the app once we have an authenticated session.
  const ok = await initAuth();
  if (!ok) return;

  wireTabs();
  wireStatsSegments();
  wireSettings();

  initPutting();
  await initRange();

  const last = localStorage.getItem(LS_TAB);
  activateTab(VIEWS[last] ? last : "putten");

  maybeShowIntro();
})();
