"use strict";

// Zero-dependency inline-SVG line chart. Pure function: data -> SVG string.
// points: [{ label: string, value: number }] in chronological order (oldest first).
// opts: { unit?: string }  -- unit is appended to min/max/value labels (e.g. "m").

export function lineChart(points, opts = {}) {
  const unit = opts.unit ? " " + opts.unit : "";
  // viewBox coordinate space; rendered responsively via CSS width.
  const W = 320, H = 120;
  const padL = 28, padR = 8, padT = 12, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 1; max += 1; } // flat line -> centre it, avoid /0

  const n = points.length;
  const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const linePts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const dots = points
    .map((p, i) => {
      const title = `${escapeXml(p.label)}: ${round1(p.value)}${unit}`;
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" class="chart-dot"><title>${title}</title></circle>`;
    })
    .join("");

  const baseY = (padT + innerH).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img">
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-axis"/>
    <text x="2" y="${(padT + 4).toFixed(1)}" class="chart-tick">${round1(max)}${unit}</text>
    <text x="2" y="${baseY}" class="chart-tick">${round1(min)}${unit}</text>
    <polyline points="${linePts}" class="chart-line" fill="none"/>
    ${dots}
  </svg>`;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );
}
