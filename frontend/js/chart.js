"use strict";

// Zero-dependency inline-SVG line chart. Pure function: data -> SVG string.
// points: [{ label, value, ciLow?, ciHigh? }] chronological (oldest first).
//   ciLow/ciHigh (optional) draw a 95% confidence whisker around the point.
// opts: { unit?: string, decimals?: number }  -- unit appended to labels.

// Whether lineChart would draw confidence whiskers for these points, so a view
// can explain them only when they are actually on screen.
export function hasWhiskers(points) {
  return points.some((p) => p.ciLow != null && p.ciHigh != null);
}

export function lineChart(points, opts = {}) {
  const unit = opts.unit ? " " + opts.unit : "";
  const dec = opts.decimals ?? 1;
  const fmt = (v) => v.toFixed(dec);
  // viewBox coordinate space; rendered responsively via CSS width.
  // padL fits a "139.0 m" tick without the label running into the axis line;
  // padB leaves a row for the date labels under it.
  const W = 320, H = 128;
  const padL = 44, padR = 12, padT = 12, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // scale must include CI bounds so whiskers aren't clipped
  const bounds = [];
  points.forEach((p) => {
    bounds.push(p.value);
    if (p.ciLow != null) bounds.push(p.ciLow);
    if (p.ciHigh != null) bounds.push(p.ciHigh);
  });
  let min = Math.min(...bounds);
  let max = Math.max(...bounds);
  if (min === max) { min -= 1; max += 1; } // flat line -> centre it, avoid /0

  const n = points.length;
  const x = (i) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min)) * innerH;

  const linePts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  // CI whiskers (vertical line + caps) where present
  const whiskers = points
    .map((p, i) => {
      if (p.ciLow == null || p.ciHigh == null) return "";
      const cx = x(i).toFixed(1);
      const yHi = y(p.ciHigh).toFixed(1);
      const yLo = y(p.ciLow).toFixed(1);
      const c = 2.5;
      return `<line x1="${cx}" y1="${yHi}" x2="${cx}" y2="${yLo}" class="chart-ci"/>`
        + `<line x1="${(+cx - c).toFixed(1)}" y1="${yHi}" x2="${(+cx + c).toFixed(1)}" y2="${yHi}" class="chart-ci"/>`
        + `<line x1="${(+cx - c).toFixed(1)}" y1="${yLo}" x2="${(+cx + c).toFixed(1)}" y2="${yLo}" class="chart-ci"/>`;
    })
    .join("");

  const dots = points
    .map((p, i) => {
      const ci = p.ciLow != null ? ` ±${fmt((p.ciHigh - p.ciLow) / 2)}` : "";
      const title = `${escapeXml(p.label)}: ${fmt(p.value)}${unit}${ci}`;
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" class="chart-dot"><title>${title}</title></circle>`;
    })
    .join("");

  const baseY = padT + innerH;

  // X axis. Every label would overlap, and the dates only lived in the <title>
  // tooltip — which a phone never shows, so the chart covered an unknown
  // period. Show at most 4, evenly spaced, always including first and last.
  const maxLabels = 4;
  const idxs = n <= maxLabels
    ? points.map((_, i) => i)
    : Array.from({ length: maxLabels },
        (_, k) => Math.round((k / (maxLabels - 1)) * (n - 1)));
  const xLabels = [...new Set(idxs)].map((i) => {
    // The outer labels are anchored inward so they cannot clip at the edges.
    const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
    const cx = i === 0 ? padL : i === n - 1 ? W - padR : x(i);
    return `<text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" text-anchor="${anchor}" class="chart-tick">${escapeXml(points[i].label)}</text>`;
  }).join("");

  const span = n > 1 ? `${escapeXml(points[0].label)} bis ${escapeXml(points[n - 1].label)}` : escapeXml(points[0].label);
  return `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img" aria-label="Verlauf ${span}">
    <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" class="chart-axis"/>
    <text x="2" y="${(padT + 4).toFixed(1)}" class="chart-tick">${fmt(max)}${unit}</text>
    <text x="2" y="${(baseY - 3).toFixed(1)}" class="chart-tick">${fmt(min)}${unit}</text>
    ${xLabels}
    ${whiskers}
    <polyline points="${linePts}" class="chart-line" fill="none"/>
    ${dots}
  </svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])
  );
}
