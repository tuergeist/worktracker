"use strict";

// Zero-dependency inline-SVG line chart. Pure function: data -> SVG string.
// points: [{ label, value, ciLow?, ciHigh? }] chronological (oldest first).
//   ciLow/ciHigh (optional) draw a 95% confidence whisker around the point.
// opts: { unit?: string, decimals?: number }  -- unit appended to labels.

export function lineChart(points, opts = {}) {
  const unit = opts.unit ? " " + opts.unit : "";
  const dec = opts.decimals ?? 1;
  const fmt = (v) => v.toFixed(dec);
  // viewBox coordinate space; rendered responsively via CSS width.
  const W = 320, H = 120;
  const padL = 32, padR = 8, padT = 12, padB = 22;
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

  const baseY = (padT + innerH).toFixed(1);
  return `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img">
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" class="chart-axis"/>
    <text x="2" y="${(padT + 4).toFixed(1)}" class="chart-tick">${fmt(max)}${unit}</text>
    <text x="2" y="${baseY}" class="chart-tick">${fmt(min)}${unit}</text>
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
