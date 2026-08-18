"use strict";

import { api, escapeHtml, onUserChange } from "./store.js";
import { openSheet, closeSheet, haptic } from "./ui.js";

// Plan content lives here, not in the backend — the API stores each run's
// field values as an opaque JSON blob, so tweaking blocks/fields never needs
// a backend change. Content/structure ported 1:1 from the training-sheet
// this replaces; only the visual design was rebuilt to match scratchlab.
const PLAN_DEFS = {
  kurzspiel: {
    label: "Kurzspiel",
    metaField: { key: "green", short: "Grün", label: "Grün heute", placeholder: "langsam / normal / schnell" },
    blocks: [
      {
        title: "Einfühlen", minutes: 5,
        desc: "Putts unterschiedlicher Länge ohne Ziel und ohne Zählen. Nur Tempo und Treffgefühl. Kalibriert dich auf die heutige Grüngeschwindigkeit.",
        fields: [],
      },
      {
        title: "Up & Down · 12 Bälle", minutes: 20,
        desc: "Bälle weit verteilt im Vorgrün und Rough ablegen — jeden aus seiner eigenen Lage spielen, auch die schlechten. Chip auf die Fahne, dann einlochen. Zählt als Erfolg, wenn du mit maximal 2 Putts drin bist.",
        fields: [{ key: "ud", short: "U&D", type: "punch12" }],
      },
      {
        title: "Kurze Putts", minutes: 8,
        desc: "Kreis mit 6 Bällen um 1 m. Alle sechs lochen, sonst von vorn. Danach dasselbe aus 1,5 m.",
        fields: [
          { key: "r1", short: "1 m", type: "number", label: "Durchgänge bis 6/6 · 1 m", min: 1, max: 20 },
          { key: "r15", short: "1,5 m", type: "number", label: "Durchgänge bis 6/6 · 1,5 m", min: 1, max: 20 },
        ],
      },
      {
        title: "Mitteldistanz 3–5 m", minutes: 7,
        desc: "Jeder Putt von einer anderen Seite des Lochs. Vor jedem Putt lesen und einen Zwischenpunkt festlegen. Hier liegt das eigentliche Scoring.",
        fields: [{ key: "mid", short: "Mitte", type: "number", label: "Gelocht", min: 0, max: 10, suffix: "von 10" }],
      },
      {
        title: "Lag-Putts 6–15 m", minutes: 8,
        desc: "Ziel ist der 1-m-Kreis ums Loch, mit Tees markiert — nicht das Loch selbst. Distanzen mischen, nicht der Reihe nach abarbeiten. Richtwert: 7 von 10.",
        fields: [{ key: "lag", short: "Lag", type: "number", label: "Im Kreis", min: 0, max: 10, suffix: "von 10" }],
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
    metaField: { key: "cond", short: "Wind/Platz", label: "Wind / Platz", placeholder: "ruhig, Matten, …" },
    blocks: [
      {
        title: "Aufwärmen", minutes: 10,
        desc: "PW und SW, halbe Schwünge, kurze Ziele. Reihenfolge von unten nach oben — kalibriert Tempo und Treffmoment.",
        fields: [],
      },
      {
        title: "Teildistanzen · 50 m", minutes: 15,
        desc: "Direkt nach dem Aufwärmen, solange die Konzentration da ist. Uhrzeiten-System mit SW und AW: 8 Uhr, 9 Uhr, 10 Uhr — Tempo konstant, nur die Rückschwunglänge ändert sich. Weiten aufschreiben, sonst bleibt es Gefühl.",
        fields: [
          { key: "fifty", short: "50 m", type: "number", label: "Auf 50 m ±5 m", min: 0, max: 10, suffix: "von 10" },
          { key: "sw9", short: "SW9", type: "number", label: "SW 9 Uhr = m", min: 0, max: 120, step: 5, suffix: "m" },
          { key: "aw9", short: "AW9", type: "number", label: "AW 9 Uhr = m", min: 0, max: 120, step: 5, suffix: "m" },
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

// ----------------------------------------------------------- field render
function fieldHtml(f, idx) {
  const id = `plan-input-${idx}-${f.key}`;
  if (f.type === "punch12") {
    return `
      <div>
        <div class="plan-punch" id="plan-field-${idx}-${f.key}"></div>
        <div class="plan-tally" id="plan-tally-${idx}-${f.key}">Up &amp; Downs: <b>0</b> / 12</div>
      </div>`;
  }
  if (f.type === "gap") {
    return `<div class="plan-gap" id="plan-field-${idx}-${f.key}">Gap: –</div>`;
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

function paneHtml(block, idx, total) {
  const isLast = idx === total - 1;
  return `
    <div id="plan-pane-${idx}" class="step-pane plan-pane" data-idx="${idx}" hidden>
      <div class="plan-pane__head">
        ${block.minutes != null ? `<div class="plan-mins">${block.minutes}<span>MIN</span></div>` : ""}
        <div>
          <h2 class="plan-pane__title">${escapeHtml(block.title)}</h2>
          <p class="plan-pane__desc">${escapeHtml(block.desc)}</p>
        </div>
      </div>
      <div class="plan-fields">${block.fields.map((f) => fieldHtml(f, idx)).join("")}</div>
      <div class="step-nav">
        ${idx > 0 ? `<button class="link-secondary" data-back type="button">← Zurück</button>` : `<span></span>`}
        ${isLast
          ? `<button class="btn-primary" data-save type="button">Speichern</button>`
          : `<button class="btn-primary" data-next type="button">Weiter</button>`}
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

function wirePunch(idx, f) {
  const wrap = $(`plan-field-${idx}-${f.key}`);
  const tally = $(`plan-tally-${idx}-${f.key}`);
  local.data[f.key] = 0;
  for (let i = 1; i <= 12; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "plan-dot";
    b.dataset.on = "0";
    b.textContent = String(i);
    b.setAttribute("aria-label", `Ball ${i} — Up and Down`);
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      const on = b.dataset.on === "1" ? "0" : "1";
      b.dataset.on = on;
      b.setAttribute("aria-pressed", on === "1");
      haptic("light");
      const n = [...wrap.children].filter((d) => d.dataset.on === "1").length;
      local.data[f.key] = n;
      tally.innerHTML = `Up &amp; Downs: <b>${n}</b> / 12`;
    };
    wrap.appendChild(b);
  }
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
}

// ----------------------------------------------------------- plan selection
function renderPickerLabel() {
  const a = $("plans-picker-label");
  const b = $("stats-plans-picker-label");
  if (a) a.textContent = local.plan.label;
  if (b) b.textContent = local.plan.label;
}

function renderPlanUI() {
  const plan = local.plan;

  const meta = $("plans-meta");
  meta.innerHTML = `
    <label class="plan-field">
      <span class="plan-field__label">${escapeHtml(plan.metaField.label)}</span>
      <input type="text" class="plan-input plan-input--wide" id="plan-meta-input" placeholder="${escapeHtml(plan.metaField.placeholder || "")}">
    </label>`;
  $("plan-meta-input").addEventListener("input", (e) => {
    local.data[plan.metaField.key] = e.target.value === "" ? null : e.target.value;
  });

  $("plans-step-indicator").innerHTML = plan.blocks.map((_, i) => `
    <div class="step-dot step-dot--compact" data-step="${i + 1}" role="listitem"><span class="step-dot__num">${i + 1}</span></div>
  `).join("");

  const panesEl = $("plans-step-panes");
  panesEl.innerHTML = plan.blocks.map((b, i) => paneHtml(b, i, plan.blocks.length)).join("");

  plan.blocks.forEach((block, idx) => {
    block.fields.forEach((f) => {
      if (f.type === "punch12") wirePunch(idx, f);
      else if (f.type === "number") wireNumber(idx, f);
      else if (f.type === "text") wireText(idx, f);
      else if (f.type === "gap") wireGap(idx, f);
    });
  });

  panesEl.querySelectorAll(".plan-pane").forEach((pane) => {
    const idx = parseInt(pane.dataset.idx, 10);
    const back = pane.querySelector("[data-back]");
    if (back) back.onclick = () => { haptic("light"); goStep(idx); };
    const next = pane.querySelector("[data-next]");
    if (next) next.onclick = () => { haptic("light"); goStep(idx + 2); };
    const save = pane.querySelector("[data-save]");
    if (save) save.onclick = () => saveRun();
  });

  goStep(1);
}

function selectPlan(key) {
  local.planKey = PLAN_DEFS[key] ? key : DEFAULT_PLAN_KEY;
  local.plan = PLAN_DEFS[local.planKey];
  local.data = {};
  renderPickerLabel();
  renderPlanUI();
  loadPlansHistory();
}

function openPlanPicker() {
  const rows = Object.entries(PLAN_DEFS).map(([key, plan]) => {
    const current = key === local.planKey;
    return `
      <div class="sheet-row" data-key="${key}">
        <span class="sheet-row__label">${escapeHtml(plan.label)}</span>
        ${current ? '<span class="sheet-row__check">✓</span>' : ""}
      </div>`;
  }).join("");

  openSheet({ title: "Plan", bodyHtml: rows });

  $("sheet-body").querySelectorAll(".sheet-row").forEach((row) => {
    row.onclick = () => {
      haptic("light");
      closeSheet();
      selectPlan(row.dataset.key);
    };
  });
}

// ----------------------------------------------------------- save
async function saveRun() {
  await api.send("/api/plan-runs", "POST", { plan_key: local.planKey, data: { ...local.data } });
  haptic("success");
  selectPlan(local.planKey); // rebuild fresh (clears all inputs), refresh history
}

// ----------------------------------------------------------- history
// Matches the original sheet's Verlauf table: meta fields (Grün/Wind-Platz)
// are captured per run but only shown while recording, not in the history.
function flatFields(plan) {
  return plan.blocks.flatMap((b) => b.fields.map((f) => ({ key: f.key, short: f.short, type: f.type })));
}

function planRow(r, columns) {
  const d = r.data || {};
  const cells = columns.map((c) => {
    const v = d[c.key];
    if (v === null || v === undefined || v === "") return "<td>·</td>";
    if (c.type === "punch12") return `<td><b>${escapeHtml(String(v))}</b>/12</td>`;
    return `<td>${escapeHtml(String(v))}</td>`;
  }).join("");
  return `
    <tr>
      <td><button class="plan-table__date" data-edit="${r.id}" data-at="${r.played_at}">${shortDate(r.played_at)}</button></td>
      ${cells}
      <td><button class="history-row__del" data-del="${r.id}" aria-label="Durchlauf löschen">✕</button></td>
    </tr>`;
}

async function loadPlansHistory() {
  if (typeof window.__renderPlansStats === "function") await window.__renderPlansStats();
}

async function renderPlansHistory() {
  if (!local.plan) return;
  const key = local.planKey;
  const plan = local.plan;
  renderPickerLabel();

  const hist = $("plans-history");
  const runs = await api.get(`/api/plan-runs?plan_key=${encodeURIComponent(key)}`);
  if (!runs.length) {
    hist.innerHTML = `<div class="empty">Noch kein ${escapeHtml(plan.label)}-Durchlauf gespeichert.</div>`;
    return;
  }

  const columns = flatFields(plan);
  hist.innerHTML = `
    <div class="plan-table-wrap">
      <table class="plan-table">
        <thead><tr>
          <th>Datum</th>
          ${columns.map((c) => `<th>${escapeHtml(c.short)}</th>`).join("")}
          <th></th>
        </tr></thead>
        <tbody>${runs.map((r) => planRow(r, columns)).join("")}</tbody>
      </table>
    </div>`;

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
  $("plans-picker").onclick = () => openPlanPicker();
  $("stats-plans-picker").onclick = () => openPlanPicker();

  window.__renderPlansStats = () => renderPlansHistory();

  onUserChange(() => loadPlansHistory());

  selectPlan(DEFAULT_PLAN_KEY);
}
