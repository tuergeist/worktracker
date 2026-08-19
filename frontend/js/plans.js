"use strict";

import { api, escapeHtml, onUserChange } from "./store.js";
import { haptic } from "./ui.js";
import { lineChart } from "./chart.js";

// Plan content lives here, not in the backend — the API stores each run's
// field values as an opaque JSON blob, so tweaking blocks/fields never needs
// a backend change. Content/structure ported 1:1 from the training-sheet
// this replaces; only the visual design was rebuilt to match scratchlab.
const PLAN_DEFS = {
  kurzspiel: {
    label: "Kurzspiel",
    blocks: [
      {
        title: "Einfühlen", minutes: 5,
        desc: "Putts unterschiedlicher Länge ohne Ziel und ohne Zählen. Nur Tempo und Treffgefühl. Kalibriert dich auf die heutige Grüngeschwindigkeit.",
        fields: [{ key: "green", short: "Grün", type: "greenScale" }],
      },
      {
        title: "Up & Down · 12 Bälle", minutes: 20,
        desc: "Bälle 10–15 m vom Loch entfernt weit verteilt im Vorgrün und Rough ablegen — jeden aus seiner eigenen Lage spielen, auch die schlechten. Chip auf die Fahne, dann einlochen. Zählt als Erfolg, wenn du mit maximal 2 Putts drin bist.",
        fields: [{ key: "ud", short: "U&D", type: "count", max: 12, groupSize: 4, label: "Erfolge (max. 2 Putts)" }],
      },
      {
        title: "Kurze Putts", minutes: 8,
        desc: "Kreis mit 6 Bällen um 1 Putterlänge. Alle sechs lochen, sonst von vorn. Danach dasselbe aus 2 Putterlängen.",
        fields: [
          { key: "p1", short: "1 PL", type: "count", max: 6, groupSize: 3, label: "Anläufe, bis alle 6 aus 1 Putterlänge sitzen" },
          { key: "p2", short: "2 PL", type: "count", max: 6, groupSize: 3, label: "Anläufe, bis alle 6 aus 2 Putterlängen sitzen" },
        ],
      },
      {
        title: "Mitteldistanz 3–5 m", minutes: 7,
        desc: "12 Bälle, jeder Putt von einer anderen Seite des Lochs. Vor jedem Putt lesen und einen Zwischenpunkt festlegen. Hier liegt das eigentliche Scoring.",
        fields: [{ key: "mid", short: "Mitte", type: "count", max: 12, groupSize: 4, label: "Gelocht" }],
      },
      {
        title: "Lag-Putts 6–15 m", minutes: 8,
        desc: "12 Bälle. Ziel ist der 1-m-Kreis ums Loch, mit Tees markiert — nicht das Loch selbst. Distanzen mischen, nicht der Reihe nach abarbeiten. Richtwert: 8 von 12.",
        fields: [{ key: "lag", short: "Lag", type: "count", max: 12, groupSize: 4, label: "Im Kreis" }],
      },
      {
        title: "Druckabschluss", minutes: 2,
        desc: "Ein Putt aus 1,5 m. Trifft er, fertig. Trifft er nicht, noch drei aus 1 m. So gehst du nie mit einem Fehlschlag raus.",
        fields: [],
      },
      {
        title: "Notiz", minutes: null,
        desc: "Was lief, was nicht — ein Satz reicht.",
        fields: [{ key: "note", short: "Notiz", type: "text", label: "Notiz", placeholder: "Was lief, was nicht — ein Satz reicht" }],
      },
    ],
  },
  range: {
    label: "Range",
    blocks: [
      {
        title: "Aufwärmen", minutes: 10,
        desc: "PW und SW, halbe Schwünge, kurze Ziele. Reihenfolge von unten nach oben — kalibriert Tempo und Treffmoment.",
        fields: [{ key: "cond", short: "Wind/Platz", type: "text", label: "Wind / Platz heute", placeholder: "ruhig, Matten, …" }],
      },
      {
        title: "Teildistanzen · 50 m", minutes: 15,
        desc: "Direkt nach dem Aufwärmen, solange die Konzentration da ist. 10 Bälle aufs 50-m-Ziel — wie viele landen im Fenster 45–55 m? Danach Uhrzeiten-System mit PW und SW üben: Rückschwung auf 8, 9, 10 Uhr, Tempo bleibt konstant. Nur der 9-Uhr-Wert wird eingetragen, 8 und 10 Uhr dienen als Kalibrierpunkte drumherum.",
        fields: [
          { key: "fifty", short: "50 m", type: "number", label: "Treffer im Fenster 45–55 m", min: 0, max: 10, suffix: "von 10" },
          { key: "pw9", short: "PW9", type: "number", label: "PW Rückschwung 9 Uhr = Weite", min: 0, max: 120, step: 5, suffix: "m" },
          { key: "sw9", short: "SW9", type: "number", label: "SW Rückschwung 9 Uhr = Weite", min: 0, max: 120, step: 5, suffix: "m" },
        ],
      },
      {
        title: "Technikfokus", minutes: 15,
        desc: "Ein Thema, wenige Bälle, dazwischen Pausen zum Denken. Nicht zwei Baustellen gleichzeitig.",
        fields: [{ key: "focus", short: "Fokus", type: "text", label: "Thema heute", placeholder: "z. B. Ballposition 5er, Tempo gleich wie 7er" }],
      },
      {
        title: "Wechselblock · 7er / 5er", minutes: 15,
        desc: "Kein Block mit einem Schläger. Wechsel nach jedem Ball: 7er, 5er, Wedge, 7er. Vor jedem Ball neues Ziel. Trag die mittlere Carry ein, nicht die Bestweite — und den Abstand zwischen beiden.",
        fields: [
          { key: "i7", short: "7er", type: "number", label: "7er Carry ø m", min: 0, max: 250, step: 5, suffix: "m" },
          { key: "i5", short: "5er", type: "number", label: "5er Carry ø m", min: 0, max: 250, step: 5, suffix: "m" },
          { key: "gap", short: "Gap", type: "gap", from: ["i7", "i5"] },
        ],
      },
      {
        title: "Simulation", minutes: 5,
        desc: "Volle Pre-Shot-Routine vor jedem Ball, Ziel jedes Mal neu. Bewerte ehrlich: Hättest du diesen Schlag auf dem Platz akzeptiert?",
        fields: [{ key: "sim", short: "Sim", type: "number", label: "Platztauglich", min: 0, max: 10, suffix: "von 10" }],
      },
      {
        title: "Notiz", minutes: null,
        desc: "Was lief, was nicht — ein Satz reicht.",
        fields: [{ key: "note", short: "Notiz", type: "text", label: "Notiz", placeholder: "Was lief, was nicht — ein Satz reicht" }],
      },
    ],
  },
};

const DEFAULT_PLAN_KEY = "kurzspiel";

const local = {
  planKey: null,
  plan: null,
  data: {},
  step: 1,
  plansRuns: [],   // last-fetched history for the current plan (chart re-renders reuse this, no refetch)
  chartMetric: null, // key of the field currently charted in the Pläne stats segment
};

function $(id) { return document.getElementById(id); }

// "18.06. 14:30" within the last 11 months, "18.06.24 14:30" once older —
// mirrors putting.js's shortDate (not exported there, so duplicated here).
function shortDate(playedAt) {
  const d = new Date(playedAt + "Z");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 11);
  const dateOpts = d < cutoff
    ? { day: "2-digit", month: "2-digit", year: "2-digit" }
    : { day: "2-digit", month: "2-digit" };
  const date = d.toLocaleDateString("de-DE", dateOpts);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

// chart axis label — mirrors putting.js's chartLabel (not exported there).
function chartLabel(playedAt) {
  return new Date(playedAt + "Z").toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

// ----------------------------------------------------------- field render
function fieldHtml(f, idx) {
  const id = `plan-input-${idx}-${f.key}`;
  if (f.type === "count") {
    return `
      <div class="plan-field">
        <span class="plan-field__label">${escapeHtml(f.label)}</span>
        <div class="plan-punch" id="plan-field-${idx}-${f.key}"></div>
      </div>`;
  }
  if (f.type === "gap") {
    return `<div class="plan-gap" id="plan-field-${idx}-${f.key}">Gap: –</div>`;
  }
  if (f.type === "greenScale") {
    return `
      <div class="plan-field">
        <span class="plan-field__label">Grün heute</span>
        <div id="plan-field-${idx}-${f.key}-scalewrap">
          <div class="direction-toggle" id="plan-field-${idx}-${f.key}-scale">
            ${[1, 2, 3, 4, 5].map((v) => `<button type="button" class="dir-btn" data-v="${v}">${v}</button>`).join("")}
          </div>
          <div class="plan-scale-hint"><span>langsam</span><span>schnell</span></div>
        </div>
        <div class="plan-field__row" id="plan-field-${idx}-${f.key}-stimp-wrap" hidden>
          <input type="number" class="plan-input" id="plan-input-${idx}-${f.key}-stimp" min="4" max="14" step="0.5">
          <span class="plan-field__suffix">Stimp</span>
        </div>
        <button type="button" class="link-secondary" id="plan-field-${idx}-${f.key}-toggle">oder Stimp-Wert eintragen</button>
      </div>`;
  }
  if (f.type === "number") {
    return `
      <label class="plan-field">
        <span class="plan-field__label">${escapeHtml(f.label)}</span>
        <div class="plan-field__row">
          <input type="number" class="plan-input" id="${id}" min="${f.min ?? ""}" max="${f.max ?? ""}" step="${f.step ?? 1}">
          ${f.suffix ? `<span class="plan-field__suffix">${escapeHtml(f.suffix)}</span>` : ""}
        </div>
      </label>`;
  }
  // text
  return `
    <label class="plan-field">
      <span class="plan-field__label">${escapeHtml(f.label)}</span>
      <input type="text" class="plan-input plan-input--wide" id="${id}" placeholder="${escapeHtml(f.placeholder || "")}">
    </label>`;
}

// Nav (Zurück/Weiter/Speichern) lives outside the scrollable panes as a fixed
// footer bar (#plans-nav-back/-next in index.html) so it's always reachable
// without scrolling, even on a block with several fields — see goStep().
function paneHtml(block, idx) {
  return `
    <div id="plan-pane-${idx}" class="step-pane plan-pane" data-idx="${idx}" hidden>
      <div class="plan-pane__body">
        <div class="plan-pane__head">
          ${block.minutes != null ? `<div class="plan-mins">${block.minutes}<span>MIN</span></div>` : ""}
          <div>
            <h2 class="plan-pane__title">${escapeHtml(block.title)}</h2>
            <p class="plan-pane__desc">${escapeHtml(block.desc)}</p>
          </div>
        </div>
        <div class="plan-fields">${block.fields.map((f) => fieldHtml(f, idx)).join("")}</div>
      </div>
    </div>`;
}

// ----------------------------------------------------------- field wiring
function wireNumber(idx, f) {
  const input = $(`plan-input-${idx}-${f.key}`);
  input.addEventListener("input", () => {
    local.data[f.key] = input.value === "" ? null : Number(input.value);
  });
}

function wireText(idx, f) {
  const input = $(`plan-input-${idx}-${f.key}`);
  input.addEventListener("input", () => {
    local.data[f.key] = input.value === "" ? null : input.value;
  });
}

function wireGap(idx, f) {
  const [ak, bk] = f.from;
  const out = $(`plan-field-${idx}-${f.key}`);
  const update = () => {
    const a = parseFloat($(`plan-input-${idx}-${ak}`).value);
    const b = parseFloat($(`plan-input-${idx}-${bk}`).value);
    if (isFinite(a) && isFinite(b)) {
      const gap = Math.round((b - a) * 10) / 10;
      local.data[f.key] = gap;
      out.textContent = `Gap: ${gap} m`;
    } else {
      local.data[f.key] = null;
      out.textContent = "Gap: –";
    }
  };
  $(`plan-input-${idx}-${ak}`).addEventListener("input", update);
  $(`plan-input-${idx}-${bk}`).addEventListener("input", update);
}

// Single-select 1–N picker: tap the number that matches the result (e.g.
// "10" for 10 of 12) — no keyboard, and no per-ball toggling either. Tapping
// the already-selected number clears it back to 0. Grouped in rows of
// f.groupSize (defaults to 4) so it always reads as fixed rows, not however
// many happen to fit the screen width.
function wireCount(idx, f) {
  const wrap = $(`plan-field-${idx}-${f.key}`);
  const groupSize = f.groupSize || 4;
  local.data[f.key] = 0;

  const dots = [];
  for (let i = 1; i <= f.max; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "plan-dot";
    b.dataset.selected = "0";
    b.textContent = String(i);
    b.setAttribute("aria-label", `${f.label}: ${i}`);
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      const wasSelected = b.dataset.selected === "1";
      haptic("light");
      dots.forEach((d) => { d.dataset.selected = "0"; d.setAttribute("aria-pressed", "false"); });
      local.data[f.key] = 0;
      if (!wasSelected) {
        b.dataset.selected = "1";
        b.setAttribute("aria-pressed", "true");
        local.data[f.key] = i;
      }
    };
    dots.push(b);
  }

  for (let g = 0; g * groupSize < f.max; g++) {
    const group = document.createElement("div");
    group.className = "plan-punch__group";
    dots.slice(g * groupSize, g * groupSize + groupSize).forEach((b) => group.appendChild(b));
    wrap.appendChild(group);
  }
}

// Green speed: quick 1–5 tap scale by default (matches the app's other
// tap/0–10 fields), with a fallback to a real Stimp reading for anyone who
// has one — mutually exclusive, switching modes clears the other value.
function wireGreenScale(idx, f) {
  const scaleWrap = $(`plan-field-${idx}-${f.key}-scalewrap`);
  const scaleGroup = $(`plan-field-${idx}-${f.key}-scale`);
  const stimpWrap = $(`plan-field-${idx}-${f.key}-stimp-wrap`);
  const stimpInput = $(`plan-input-${idx}-${f.key}-stimp`);
  const toggle = $(`plan-field-${idx}-${f.key}-toggle`);

  function setMode(mode) {
    scaleWrap.hidden = mode !== "scale";
    stimpWrap.hidden = mode !== "stimp";
    toggle.textContent = mode === "scale" ? "oder Stimp-Wert eintragen" : "oder 1–5-Skala";
  }
  setMode("scale");

  scaleGroup.querySelectorAll(".dir-btn").forEach((btn) => {
    btn.onclick = () => {
      scaleGroup.querySelectorAll(".dir-btn").forEach((b) => b.classList.remove("dir-btn--selected"));
      btn.classList.add("dir-btn--selected");
      haptic("light");
      local.data.green_scale = parseInt(btn.dataset.v, 10);
      local.data.green_stimp = null;
    };
  });

  toggle.onclick = () => {
    haptic("light");
    const goingToStimp = stimpWrap.hidden;
    setMode(goingToStimp ? "stimp" : "scale");
    if (goingToStimp) {
      local.data.green_scale = null;
    } else {
      local.data.green_stimp = null;
      stimpInput.value = "";
    }
  };

  stimpInput.addEventListener("input", () => {
    local.data.green_stimp = stimpInput.value === "" ? null : Number(stimpInput.value);
  });
}

// ----------------------------------------------------------- guided steps
function goStep(n) {
  local.step = n;
  document.querySelectorAll(".plan-pane").forEach((pane) => {
    pane.hidden = parseInt(pane.dataset.idx, 10) + 1 !== n;
  });
  document.querySelectorAll("#plans-step-indicator .step-dot").forEach((dot) => {
    const s = parseInt(dot.dataset.step, 10);
    dot.classList.toggle("step-dot--active", s === n);
    dot.classList.toggle("step-dot--done", s < n);
  });
  updateNav();
}

// Persistent footer nav (outside the scrollable pane) — behavior depends on
// the current step, not on which pane is showing, so it's wired once.
function updateNav() {
  const back = $("plans-nav-back");
  const next = $("plans-nav-next");
  const total = local.plan.blocks.length;
  back.hidden = local.step <= 1;
  if (local.step >= total) {
    next.textContent = "Speichern";
    next.onclick = () => saveRun();
  } else {
    next.textContent = "Weiter";
    next.onclick = () => { haptic("light"); goStep(local.step + 1); };
  }
}

// ----------------------------------------------------------- plan selection
// Only two fixed plans exist, so a two-tab segmented control (record view +
// the Statistik "Pläne" segment share the same selection) beats a sheet picker.
function updateSegButtons() {
  document.querySelectorAll(".seg-control__btn[data-key]").forEach((b) => {
    const on = b.dataset.key === local.planKey;
    b.classList.toggle("seg-control__btn--active", on);
    b.setAttribute("aria-selected", String(on));
  });
}

function wirePlanSegButtons() {
  document.querySelectorAll(".seg-control__btn[data-key]").forEach((b) => {
    b.onclick = () => { haptic("light"); selectPlan(b.dataset.key); };
  });
}

function renderPlanUI() {
  const plan = local.plan;

  $("plans-step-indicator").innerHTML = plan.blocks.map((_, i) => `
    <div class="step-dot step-dot--compact" data-step="${i + 1}" role="listitem"><span class="step-dot__num">${i + 1}</span></div>
  `).join("");

  const panesEl = $("plans-step-panes");
  panesEl.innerHTML = plan.blocks.map((b, i) => paneHtml(b, i)).join("");

  plan.blocks.forEach((block, idx) => {
    block.fields.forEach((f) => {
      if (f.type === "number") wireNumber(idx, f);
      else if (f.type === "text") wireText(idx, f);
      else if (f.type === "gap") wireGap(idx, f);
      else if (f.type === "greenScale") wireGreenScale(idx, f);
      else if (f.type === "count") wireCount(idx, f);
    });
  });

  $("plans-nav-back").onclick = () => { if (local.step > 1) { haptic("light"); goStep(local.step - 1); } };

  goStep(1);
}

function selectPlan(key) {
  hideDone();
  local.planKey = PLAN_DEFS[key] ? key : DEFAULT_PLAN_KEY;
  local.plan = PLAN_DEFS[local.planKey];
  local.data = {};
  updateSegButtons();
  renderPlanUI();
  loadPlansHistory();
}

// ----------------------------------------------------------- save
function showDone() {
  $("plans-record-body").hidden = true;
  $("plans-step-indicator").hidden = true;
  $("plans-footer").hidden = true;
  $("plans-done-lead").textContent = `${local.plan.label} gespeichert.`;
  $("plans-done").hidden = false;
}

function hideDone() {
  $("plans-done").hidden = true;
  $("plans-record-body").hidden = false;
  $("plans-step-indicator").hidden = false;
  $("plans-footer").hidden = false;
}

// count/greenScale fields default to 0 for "untouched", so a run where
// every value is still null/empty/0 was never actually filled in — saving
// it just adds a blank card to the history.
function hasAnyData() {
  return Object.values(local.data).some((v) => v !== null && v !== undefined && v !== "" && v !== 0);
}

async function saveRun() {
  if (!hasAnyData()) {
    haptic("warning");
    alert("Trag mindestens einen Wert ein, bevor du speicherst.");
    return;
  }
  await api.send("/api/plan-runs", "POST", { plan_key: local.planKey, data: { ...local.data } });
  haptic("success");
  showDone(); // stay on a confirmation screen instead of dropping back to step 1
  loadPlansHistory();
}

// ----------------------------------------------------------- history
// Cards, not a table: a plan run has 5-8 heterogeneous fields, which as
// table columns forced horizontal scrolling on a phone. A card per run with
// fields wrapping naturally (text fields full-width) needs no side-scroll.
function flatFields(plan) {
  return plan.blocks.flatMap((b) => b.fields.map((f) => ({
    key: f.key, short: f.short, type: f.type, max: f.max, suffix: f.suffix, wide: f.type === "text",
  })));
}

// Only genuine numeric/distance fields get a trend chart — not the green
// scale (categorical), free text, or notes.
function chartableFields(plan) {
  return flatFields(plan).filter((f) => ["number", "count", "gap"].includes(f.type));
}

function historyCard(r, columns) {
  const d = r.data || {};
  const fields = columns.map((c) => {
    let value;
    if (c.type === "greenScale") {
      value = d.green_stimp != null ? `Stimp ${d.green_stimp}` : d.green_scale != null ? `${d.green_scale}/5` : null;
    } else {
      const v = d[c.key];
      value = (v === null || v === undefined || v === "") ? null
        : c.type === "count" ? `${v}/${c.max}`
        : String(v);
    }
    return `
      <div class="plan-history-card__field${c.wide ? " plan-history-card__field--wide" : ""}">
        <span class="plan-history-card__label">${escapeHtml(c.short)}</span>
        <span class="plan-history-card__value">${value == null ? "·" : escapeHtml(value)}</span>
      </div>`;
  }).join("");
  return `
    <div class="plan-history-card">
      <div class="plan-history-card__head">
        <button class="plan-history-card__date" data-edit="${r.id}" data-at="${r.played_at}">${shortDate(r.played_at)}</button>
        <button class="history-row__del" data-del="${r.id}" aria-label="Durchlauf löschen">✕</button>
      </div>
      <div class="plan-history-card__fields">${fields}</div>
    </div>`;
}

// Metric chip row (reuses .club-strip/.club-row/.club-chip — same "pick one,
// see its trend" pattern Range already uses for clubs) + the chart itself.
// Re-render on chip click reads from local.plansRuns, no refetch needed.
function renderMetricPicker(plan) {
  const fields = chartableFields(plan);
  if (!fields.some((f) => f.key === local.chartMetric)) {
    local.chartMetric = fields[0]?.key ?? null;
  }
  const row = $("plans-metric-row");
  row.innerHTML = fields.map((f) => `
    <button type="button" class="club-chip${f.key === local.chartMetric ? " club-chip--selected" : ""}" data-metric="${f.key}">${escapeHtml(f.short)}</button>
  `).join("");
  row.querySelectorAll("[data-metric]").forEach((btn) => {
    btn.onclick = () => {
      haptic("light");
      local.chartMetric = btn.dataset.metric;
      renderMetricPicker(plan);
      renderChart(plan);
    };
  });
}

function renderChart(plan) {
  const chartEl = $("plans-chart");
  const field = chartableFields(plan).find((f) => f.key === local.chartMetric);
  if (!field) { chartEl.innerHTML = ""; return; }

  const points = local.plansRuns
    .filter((r) => r.data && r.data[field.key] !== null && r.data[field.key] !== undefined)
    .slice()
    .reverse() // runs arrive newest-first; chart wants oldest -> newest
    .map((r) => ({ label: chartLabel(r.played_at), value: Number(r.data[field.key]) }));

  chartEl.innerHTML = points.length >= 2
    ? `<div class="chart-card">${lineChart(points, { unit: field.suffix === "m" ? "m" : "", decimals: field.type === "gap" ? 1 : 0 })}</div>`
    : `<div class="chart-card"><p class="empty">Mehr Daten für einen Trend nötig.</p></div>`;
}

async function loadPlansHistory() {
  if (typeof window.__renderPlansStats === "function") await window.__renderPlansStats();
}

async function renderPlansHistory() {
  if (!local.plan) return;
  const key = local.planKey;
  const plan = local.plan;
  updateSegButtons();

  const hist = $("plans-history");
  const runs = await api.get(`/api/plan-runs?plan_key=${encodeURIComponent(key)}`);
  local.plansRuns = runs;

  renderMetricPicker(plan);

  if (!runs.length) {
    $("plans-chart").innerHTML = "";
    hist.innerHTML = `<div class="empty">Noch kein ${escapeHtml(plan.label)}-Durchlauf gespeichert.</div>`;
    return;
  }

  renderChart(plan);

  const columns = flatFields(plan);
  hist.innerHTML = `<div class="plan-history-list">${runs.map((r) => historyCard(r, columns)).join("")}</div>`;

  hist.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Diesen Durchlauf löschen?")) return;
      haptic("light");
      await api.send(`/api/plan-runs/${btn.dataset.del}`, "DELETE");
      renderPlansHistory();
    };
  });
  hist.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => editRunDate(parseInt(btn.dataset.edit, 10), btn.dataset.at);
  });
}

// Tap a history date -> native date/time picker (same conversion as putting.js's
// editSessionDate: stored value is UTC text, the picker works in local time).
function editRunDate(id, playedAt) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = new Date(playedAt + "Z");
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  input.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.appendChild(input);
  input.onchange = async () => {
    if (input.value) {
      const t = new Date(input.value);
      const utc = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
        + ` ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
      haptic("light");
      await api.send(`/api/plan-runs/${id}`, "PATCH", { played_at: utc });
      renderPlansHistory();
    }
    input.remove();
  };
  if (input.showPicker) input.showPicker();
  else input.focus();
}

// ----------------------------------------------------------- init
export function initPlans() {
  wirePlanSegButtons();
  $("plans-done-restart").onclick = () => { haptic("light"); selectPlan(local.planKey); };

  window.__renderPlansStats = () => renderPlansHistory();

  onUserChange(() => loadPlansHistory());

  selectPlan(DEFAULT_PLAN_KEY);
}
