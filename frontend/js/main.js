"use strict";

import { initAuth } from "./auth.js";
import { openSettings } from "./users.js";
import { initPutting } from "./putting.js";
import { initRange } from "./range.js";
import { maybeShowIntro } from "./intro.js";

const LS_TAB = "wt.tab";

// View ids per tab. Index 0 = record view, index 1 = stats view.
const VIEWS = {
  putten: ["view-putten-record", "view-putten-stats"],
  range:  ["view-range-record", "view-range-stats"],
};

function setView(id) {
  document.querySelectorAll("#main .view").forEach((v) => {
    v.hidden = v.id !== id;
  });
}

// Switch tabs: always land on the record view of the chosen tab.
function activateTab(name) {
  if (!VIEWS[name]) name = "putten";
  document.querySelectorAll(".tab-item").forEach((t) =>
    t.classList.toggle("tab-item--active", t.dataset.tab === name)
  );
  setView(VIEWS[name][0]);
  localStorage.setItem(LS_TAB, name);
}

function wireTabs() {
  document.querySelectorAll(".tab-item").forEach((t) => {
    t.onclick = () => activateTab(t.dataset.tab);
  });
}

// Stats navigation: toggle record <-> stats views and let the topic module
// render its data via an optional global callback it registers.
function wireStatsNav() {
  document.getElementById("putten-stats-link").onclick = () => {
    setView("view-putten-stats");
    window.__renderPuttenStats?.();
  };
  document.getElementById("putten-stats-back").onclick = () =>
    setView("view-putten-record");

  document.getElementById("range-stats-link").onclick = () => {
    setView("view-range-stats");
    window.__renderRangeStats?.();
  };
  document.getElementById("range-stats-back").onclick = () =>
    setView("view-range-record");
}

function wireSettings() {
  document.getElementById("settings-btn").onclick = () => openSettings();
}

(async function init() {
  // Auth gate first: only boot the app once we have an authenticated session.
  const ok = await initAuth();
  if (!ok) return;

  wireTabs();
  wireStatsNav();
  wireSettings();

  initPutting();
  await initRange();

  const last = localStorage.getItem(LS_TAB);
  activateTab(last === "range" ? "range" : "putten");

  maybeShowIntro();
})();
