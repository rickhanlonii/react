// Tables and charts for the use(store) reports, drawn from
// docs/use-store/data/bench-data.json (fixtures/store-bench/report-data.mjs).
//
// build-docs.mjs fills each <!-- gen:NAME --> block with generators[NAME](data).
// Every generator is pure and synchronous: the same data gives the same
// markup, which is how G5 (check-numbers.mjs) checks the shipped pages.
//
// The charts are inline SVG. Each one is rendered here for its default view,
// so it reads without JavaScript, and the runtime in `charts-assets` (one per
// page) re-renders it with the same functions when a filter changes, and adds
// the tooltips. Nothing loads from the network.
//
// Design follows the dataviz skill: the reference palette (light and dark),
// emphasis (use(store) in blue, the rest in gray) where one series is the
// point, categorical slots 1-4 in fixed order where the series are the
// subject, hairline grids, 2px lines, a legend for 2+ series, direct labels,
// tooltips on hover and focus, and a table view for every chart.

import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

// The repository root, for the results tables' links to each app's source.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The functions the browser needs too. They only use their arguments and
// LIB, because the runtime script is made from their source.
const LIB = {
  esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  // The same rule as ms() in fixtures/store-bench/stats.mjs.
  ms(v) {
    if (v === null || v === undefined) return '–';
    return v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1);
  },
  int(v) {
    return v === null || v === undefined
      ? '–'
      : Math.round(v).toLocaleString('en-US');
  },
  // The one name map: what every chart, legend, tooltip and chart table calls
  // a variant. Variants without a name here keep their id.
  name(v) {
    return (
      {
        store: 'use(store)',
        'store-single': 'one store',
        context: 'one context',
        'context-split': 'a context per slice',
        'zustand-granular': 'Zustand, a store per entity',
        'store-keyed': 'keyed selection',
        'store-memo': 'weakMemo',
        redux: 'Redux',
        zustand: 'Zustand',
      }[v] || v
    );
  },
  // Emphasis colors: use(store) in slot 1, the use(store) pattern a chart is
  // about (keyed selection, weakMemo) in slot 2, everything else gray. The
  // same variant keeps its color in every chart.
  color(name) {
    if (name === 'store') return 's1';
    if (name === 'store-memo' || name === 'store-keyed') return 's2';
    return 'muted';
  },
  // A median entry as the browser gets it: [median, p25, p75, p95, count].
  entry(a) {
    return a ? {median: a[0], p25: a[1], p75: a[2], p95: a[3], count: a[4]} : null;
  },
  // Compact (card) charts are drawn about as wide as a half-width dashboard
  // card's content, so 12px text renders at about 12px, and never grow past
  // that width in a wider card.
  COMPACT_W() {
    return 584;
  },
  svgOpen(W, H, label, compact) {
    return `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LIB.esc(label)}"${compact ? ` style="max-width:${W}px"` : ''}>`;
  },
  // Log-scale ticks at 1, 2 and 5 per decade inside [lo, hi].
  logTicks(lo, hi) {
    const ticks = [];
    for (
      let e = Math.floor(Math.log10(lo));
      e <= Math.ceil(Math.log10(hi));
      e++
    ) {
      for (const m of [1, 2, 5]) {
        const v = m * Math.pow(10, e);
        if (v >= lo * 0.999 && v <= hi * 1.001) ticks.push(v);
      }
    }
    return ticks;
  },
  // The data's range with some air on both ends, so marks never sit on the
  // axis. Ticks (1, 2, 5 per decade) fall inside it.
  logDomain(values) {
    const vs = values.filter(v => v > 0);
    if (vs.length === 0) return [0.01, 1];
    let lo = Math.min(...vs) / 1.25;
    let hi = Math.max(...vs) * 1.25;
    // At least one tick inside.
    while (LIB.logTicks(lo, hi).length < 2) {
      lo /= 1.5;
      hi *= 1.5;
    }
    return [lo, hi];
  },
  linearTicks(hi) {
    if (!(hi > 0)) return [0];
    const raw = hi / 4;
    const e = Math.floor(Math.log10(raw));
    const m = raw / Math.pow(10, e);
    const step =
      (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) *
      Math.pow(10, e);
    const ticks = [];
    for (let v = 0; v <= hi + step * 0.001; v += step)
      ticks.push(Number(v.toPrecision(6)));
    if (ticks[ticks.length - 1] < hi)
      ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(6)));
    return ticks;
  },
  tick(v) {
    return v >= 1000 ? `${v / 1000}K` : String(Number(v.toPrecision(3)));
  },
  tipAttrs(value, label, extra) {
    return ` tabindex="0" data-tip-value="${LIB.esc(value)}" data-tip-label="${LIB.esc(label)}"${extra ? ` data-tip-extra="${LIB.esc(extra)}"` : ''} aria-label="${LIB.esc(label + ': ' + value + (extra ? ', ' + extra : ''))}"`;
  },

  // A dot plot in two panels that share the variant rows: compiler on and
  // compiler off, each on its own log scale so neither squashes the other.
  // Each dot is a median with its middle half. rows: [{label, emph, on, off}].
  dots(rows, axisLabel, compact) {
    const W = compact ? LIB.COMPACT_W() : 680;
    const left = 178;
    const gap = 28;
    const right = 12;
    const top = 26;
    const rowH = 28;
    const bottom = 60;
    const H = top + rows.length * rowH + bottom;
    const PW = (W - left - right - gap) / 2;
    let svg = LIB.svgOpen(W, H, axisLabel, compact);
    rows.forEach((r, i) => {
      const cy = top + i * rowH + rowH / 2;
      svg += `<text class="label${r.emph ? ' emph' : ''}" x="${left - 10}" y="${cy + 4}" text-anchor="end">${LIB.esc(r.label)}</text>`;
    });
    [
      ['on', 'with the compiler'],
      ['off', 'without the compiler'],
    ].forEach(([which, title], pi) => {
      const ox = left + pi * (PW + gap);
      const all = rows
        .map(r => r[which])
        .filter(Boolean)
        .flatMap(e => [e.p25, e.median, e.p75]);
      const [lo, hi] = LIB.logDomain(all);
      const span = Math.log10(hi) - Math.log10(lo) || 1;
      const x = v =>
        ox + ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / span) * PW;
      svg += `<text class="ptitle" x="${ox}" y="14">${title}</text>`;
      for (const t of LIB.logTicks(lo, hi)) {
        svg += `<line class="grid" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top}" y2="${H - bottom}"/>`;
        svg += `<text class="axis" x="${x(t).toFixed(1)}" y="${H - bottom + 16}" text-anchor="middle">${LIB.tick(t)}</text>`;
      }
      svg += `<line class="baseline" x1="${ox}" x2="${ox + PW}" y1="${H - bottom}" y2="${H - bottom}"/>`;
      rows.forEach((r, i) => {
        const e = r[which];
        if (!e) return;
        const y = top + i * rowH + rowH / 2;
        svg += `<g class="${r.emph ? 's1' : 'muted'}">`;
        svg += `<line class="whisker" x1="${x(e.p25).toFixed(1)}" x2="${x(e.p75).toFixed(1)}" y1="${y}" y2="${y}"/>`;
        svg += `<circle class="dot-on" cx="${x(e.median).toFixed(1)}" cy="${y}" r="4.5"/>`;
        const extra = `middle half ${LIB.ms(e.p25)}–${LIB.ms(e.p75)} ms · p95 ${LIB.ms(e.p95)} ms · ${LIB.int(e.count)} samples`;
        svg += `<circle class="hit" cx="${x(e.median).toFixed(1)}" cy="${y}" r="12"${LIB.tipAttrs(LIB.ms(e.median) + ' ms', r.label + ', ' + title, extra)}/>`;
        svg += `</g>`;
      });
    });
    const mid = left + (W - left - right) / 2;
    svg += `<text class="axis" x="${mid}" y="${H - 22}" text-anchor="middle">${LIB.esc(axisLabel)}</text>`;
    svg += `<text class="axis" x="${mid}" y="${H - 6}" text-anchor="middle">Each panel has its own scale. Compare within a panel.</text>`;
    return svg + '</svg>';
  },

  // Line charts over x positions, one or more panels. Each panel is
  // {title, series: [{name, values}]}. Series named in LIB.color get their
  // emphasis color, the rest are gray context, and every series gets an end
  // label. opts: {log, yLabel, xLabel, cols, pw, ph, xpos}: xpos places the x
  // values (0 to 1) when their spacing means something, else they're even.
  lines(panels, xs, {log, yLabel, xLabel, cols: colsOpt, pw, ph, xpos, compact}) {
    const cols = colsOpt || Math.min(panels.length, 2);
    const PW = pw || 320;
    const PH = ph || 220;
    const W = PW * cols;
    const rowsN = Math.ceil(panels.length / cols);
    const H = PH * rowsN;
    const left = 46;
    // Room for the longest end label.
    const right =
      20 +
      6.6 *
        Math.max(
          ...panels.flatMap(p => p.series.map(s => LIB.name(s.name).length))
        );
    const top = 40;
    const bottom = 42;
    const allValues = panels
      .flatMap(p => p.series.flatMap(s => s.values))
      .filter(v => v !== null);
    let lo;
    let hi;
    let ticks;
    if (log) {
      [lo, hi] = LIB.logDomain(allValues);
      ticks = LIB.logTicks(lo, hi);
    } else {
      ticks = LIB.linearTicks(Math.max(...allValues, 0));
      lo = 0;
      hi = ticks[ticks.length - 1];
    }
    const span = log ? Math.log10(hi) - Math.log10(lo) || 1 : hi - lo || 1;
    const pos = i =>
      xpos ? xpos[i] : xs.length === 1 ? 0 : i / (xs.length - 1);
    let svg = LIB.svgOpen(W, H, yLabel + ' by ' + xLabel, compact);
    panels.forEach((p, pi) => {
      const ox = (pi % cols) * PW;
      const oy = Math.floor(pi / cols) * PH;
      const plotW = PW - left - right;
      const x = i => ox + left + pos(i) * plotW;
      const y = v =>
        oy +
        top +
        (PH - top - bottom) *
          (1 -
            (log
              ? (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / span
              : (v - lo) / span));
      if (p.title)
        svg += `<text class="ptitle" x="${ox + 4}" y="${oy + 14}">${LIB.esc(p.title)}</text>`;
      svg += `<text class="axis" x="${ox + 4}" y="${oy + 30}">${LIB.esc(yLabel)}</text>`;
      for (const t of ticks) {
        svg += `<line class="${t === 0 ? 'baseline' : 'grid'}" x1="${ox + left}" x2="${ox + PW - right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
        svg += `<text class="axis" x="${ox + left - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${LIB.tick(t)}</text>`;
      }
      xs.forEach((label, i) => {
        svg += `<text class="axis" x="${x(i).toFixed(1)}" y="${oy + PH - bottom + 18}" text-anchor="middle">${LIB.esc(label)}</text>`;
      });
      svg += `<text class="axis" x="${ox + left + plotW / 2}" y="${oy + PH - 8}" text-anchor="middle">${LIB.esc(xLabel)}</text>`;
      // Gray context first, so the emphasized lines draw on top.
      const ordered = [...p.series].sort(
        (a, b) =>
          (LIB.color(a.name) === 'muted' ? 0 : 1) -
          (LIB.color(b.name) === 'muted' ? 0 : 1)
      );
      const ends = [];
      for (const s of ordered) {
        const cls = LIB.color(s.name);
        const pts = s.values
          .map((v, i) => (v === null ? null : [x(i), y(v)]))
          .filter(Boolean);
        if (pts.length === 0) continue;
        svg += `<g class="${cls}"><polyline class="line" points="${pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')}"/>`;
        for (const [a, b] of pts)
          svg += `<circle class="dot-on" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="4"/>`;
        const last = pts[pts.length - 1];
        ends.push({name: LIB.name(s.name), x: last[0], y: last[1], emph: cls !== 'muted'});
        svg += `</g>`;
      }
      // End labels, pushed apart when they collide, with a leader line back
      // to the line's end.
      ends.sort((a, b) => a.y - b.y);
      for (const e of ends) e.ly = e.y;
      for (let i = 1; i < ends.length; i++) {
        ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + 15);
      }
      // Keep them inside the plot, clear of the x-axis labels.
      const floor = oy + PH - bottom - 4;
      for (let i = ends.length - 1; i >= 0; i--) {
        const limit = i === ends.length - 1 ? floor : ends[i + 1].ly - 15;
        ends[i].ly = Math.min(ends[i].ly, limit);
      }
      for (const e of ends) {
        const ly = e.ly ?? e.y;
        if (Math.abs(ly - e.y) > 1) {
          svg += `<line class="leader" x1="${(e.x + 5).toFixed(1)}" y1="${e.y.toFixed(1)}" x2="${(e.x + 12).toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
        }
        svg += `<text class="endlabel${e.emph ? ' emph' : ''}" x="${(e.x + 14).toFixed(1)}" y="${(ly + 4).toFixed(1)}">${LIB.esc(e.name)}</text>`;
      }
      // One hit column per x position, out to the midpoints between its
      // neighbors: the tooltip lists every series there.
      xs.forEach((label, i) => {
        const a = i === 0 ? x(0) - 12 : (x(i - 1) + x(i)) / 2;
        const b = i === xs.length - 1 ? x(i) + 12 : (x(i) + x(i + 1)) / 2;
        const rows = p.series
          .filter(s => s.values[i] !== null)
          .map(s => [LIB.name(s.name), s.values[i]])
          .sort((m, n) => m[1] - n[1])
          .map(([n, v]) => `${n}: ${LIB.ms(v)} ms`);
        svg += `<rect class="hit col" x="${a.toFixed(1)}" y="${oy + top}" width="${(b - a).toFixed(1)}" height="${PH - top - bottom}" data-x="${x(i).toFixed(1)}" data-y1="${oy + top}" data-y2="${oy + PH - bottom}"${LIB.tipAttrs((p.title ? p.title + ' · ' : '') + label, xLabel, rows.join('\n'))}/>`;
      });
    });
    return (
      svg +
      `<line class="crosshair" x1="0" x2="0" y1="0" y2="0" visibility="hidden"/></svg>`
    );
  },

  // Horizontal bars from a zero baseline, value at the tip.
  bars(rows, axisLabel, unit, compact) {
    const W = compact ? LIB.COMPACT_W() : 640;
    const left = 178;
    const right = 90;
    const top = 6;
    const rowH = 30;
    const bottom = 40;
    const H = top + rows.length * rowH + bottom;
    const ticks = LIB.linearTicks(Math.max(...rows.map(r => r.value), 0));
    const hi = ticks[ticks.length - 1] || 1;
    const x = v => left + (v / hi) * (W - left - right);
    let svg = LIB.svgOpen(W, H, axisLabel, compact);
    for (const t of ticks) {
      svg += `<line class="grid" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top}" y2="${H - bottom}"/>`;
      svg += `<text class="axis" x="${x(t).toFixed(1)}" y="${H - bottom + 16}" text-anchor="middle">${LIB.tick(t)}</text>`;
    }
    svg += `<text class="axis" x="${left + (W - left - right) / 2}" y="${H - 6}" text-anchor="middle">${LIB.esc(axisLabel)}</text>`;
    rows.forEach((r, i) => {
      const yy = top + i * rowH + (rowH - 16) / 2;
      const x1 = x(r.value);
      const rr = Math.min(4, x1 - left);
      svg += `<text class="label${r.emph ? ' emph' : ''}" x="${left - 10}" y="${yy + 12}" text-anchor="end">${LIB.esc(r.label)}</text>`;
      svg += `<g class="${r.emph ? 's1' : 'muted'}"><path class="bar" d="M${left} ${yy}H${(x1 - rr).toFixed(1)}Q${x1.toFixed(1)} ${yy} ${x1.toFixed(1)} ${yy + rr}V${yy + 16 - rr}Q${x1.toFixed(1)} ${yy + 16} ${(x1 - rr).toFixed(1)} ${yy + 16}H${left}Z"/></g>`;
      svg += `<text class="value" x="${(x1 + 6).toFixed(1)}" y="${yy + 12}">${LIB.esc(LIB.int(r.value))}</text>`;
      svg += `<rect class="hit" x="${left}" y="${yy - 4}" width="${W - left - right}" height="24"${LIB.tipAttrs(LIB.int(r.value) + ' ' + unit, r.label, r.extra)}/>`;
    });
    svg += `<line class="baseline" x1="${left}" x2="${left}" y1="${top}" y2="${H - bottom}"/>`;
    return svg + '</svg>';
  },

  table(head, rows) {
    return `<table class="viz-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows
      .map(
        r =>
          `<tr>${r.map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`
      )
      .join('')}</tbody></table>`;
  },

  // ------------------------------------------------------------ views
  // view(data, state) => {plot, table, note}: what a figure shows for one
  // choice of filters.

  viewMain(d, st) {
    const cell = d.cells[`${st.scenario}|${st.n}|${st.throttle}`];
    if (!cell)
      return {
        plot: '<p class="viz-empty">No data for this configuration.</p>',
        table: '',
        note: '',
      };
    const rows = d.variants.map(v => ({
      label: LIB.name(v),
      emph: v === 'store',
      on: LIB.entry(cell.variants[v]?.on),
      off: LIB.entry(cell.variants[v]?.off),
    }));
    const plot = LIB.dots(
      rows,
      'ms per update, log scale, lower is better',
      d.compact
    );
    const fmt = e => (e ? `${LIB.ms(e.median)}` : '–');
    const iqr = e => (e ? `${LIB.ms(e.p25)}–${LIB.ms(e.p75)}` : '–');
    const table = LIB.table(
      [
        'variant',
        'compiler on: median ms',
        'middle half',
        'p95',
        'compiler off: median ms',
        'middle half',
        'p95',
      ],
      rows.map(r => [
        LIB.esc(r.label),
        fmt(r.on),
        iqr(r.on),
        r.on ? LIB.ms(r.on.p95) : '–',
        fmt(r.off),
        iqr(r.off),
        r.off ? LIB.ms(r.off.p95) : '–',
      ])
    );
    const opp = s => LIB.esc(String(s).replace(/^\S+/, id => LIB.name(id)));
    const note = cell.note
      ? cell.note
      : cell.verdict
      ? `Verdict: <strong>${LIB.esc(cell.verdict.text)}</strong> vs ${opp(cell.best)}` +
        (cell.granular ? ` (granular control: ${LIB.esc(cell.granular.text)})` : '')
      : '';
    return {plot, table, note};
  },

  viewSpike(d, st) {
    const xs = d.ks.map(k => `${k}`);
    const shown = ['store', 'store-memo', 'redux'];
    const families =
      st.view === 'all'
        ? d.families.filter(f => !d.unread.includes(f))
        : [d.family];
    const panels = families.map(f => ({
      title: st.view === 'all' ? `${f} updates` : '',
      series: shown.map(v => ({
        name: v,
        values: d.ks.map(
          k => d.cells[`${f}|${k}|${st.throttle}`]?.variants[v]?.median ?? null
        ),
      })),
    }));
    const plot = LIB.lines(panels, xs, {
      log: false,
      yLabel: 'ms per update, lower is better',
      xLabel: 'readers per category',
      cols: panels.length,
      pw: (d.compact ? LIB.COMPACT_W() : panels.length === 1 ? 640 : 720) / panels.length,
      ph: panels.length === 1 ? 260 : 220,
      compact: d.compact,
    });
    const order = ['store', 'store-memo', 'redux', 'zustand'];
    const variants = [...d.variants].sort(
      (a, b) =>
        (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) ||
        a.localeCompare(b)
    );
    const head = [
      'variant',
      ...d.families.flatMap(f => d.ks.map(k => `${LIB.esc(f)}, ${k} readers`)),
    ];
    const rows = variants.map(v => [
      LIB.esc(LIB.name(v)),
      ...d.families.flatMap(f =>
        d.ks.map(k => {
          const e = d.cells[`${f}|${k}|${st.throttle}`]?.variants[v];
          return e
            ? `${LIB.ms(e.median)} <small>${e.vsRedux === null ? '' : e.vsRedux.toFixed(2) + '×'}</small>`
            : '–';
        })
      ),
    ]);
    return {
      plot,
      table: LIB.table(head, rows),
      note:
        `Median ms per update with the compiler, ${st.view === 'all' ? 'one panel per kind of update' : LIB.esc(d.family) + ' updates'}.` +
        (d.unread.length
          ? ` ${LIB.esc(d.unread.join(', '))} is only in the table: an unread update, so the store variants do no work.`
          : ''),
    };
  },

  viewSweep(d, st) {
    const coverage = ['c100-w8', 'c90-w8', 'c75-w8', 'c50-w8', 'c0-w8'];
    const widths = ['c100-w4', 'c100-w8', 'c100-w16'];
    const pick = (st.view === 'width' ? widths : coverage)
      .map(k => d.configs.find(c => c.key === k))
      .filter(Boolean);
    const pct = c => Number(c.key.replace(/^c(\d+)-.*$/, '$1'));
    const xs = pick.map(c =>
      st.view === 'width' ? c.key.replace(/^c100-w/, '') : `${pct(c)}%`
    );
    // Coverage is placed by the share of rows compiled, so a cost that
    // grows with each uncompiled row draws as a straight line.
    const xpos =
      st.view === 'width' ? null : pick.map(c => (100 - pct(c)) / 100);
    const panels = [
      {
        title: '',
        series: d.libraries.map(lib => ({
          name: lib,
          values: pick.map(
            c =>
              d.cells[`${st.scenario}|${st.throttle}|${c.key}`]?.libraries[lib]
                ?.median ?? null
          ),
        })),
      },
    ];
    const plot = LIB.lines(panels, xs, {
      log: false,
      yLabel: 'ms per update, lower is better',
      xLabel:
        st.view === 'width'
          ? 'props per row (every row compiled)'
          : 'rows compiled (8 props per row)',
      cols: 1,
      pw: d.compact ? LIB.COMPACT_W() : 640,
      ph: 260,
      xpos,
      compact: d.compact,
    });
    const head = [
      'scenario',
      'configuration',
      ...d.libraries.map(lib => LIB.esc(LIB.name(lib))),
      ...d.stores.map(s => `${LIB.esc(LIB.name(s))} vs the faster of Redux and Zustand`),
    ];
    const rows = d.scenarios.flatMap(s =>
      pick.map(c => {
        const cell = d.cells[`${s}|${st.throttle}|${c.key}`];
        return [
          LIB.esc(d.titles[s] ?? s),
          LIB.esc(c.label),
          ...d.libraries.map(lib =>
            LIB.ms(cell?.libraries[lib]?.median ?? null)
          ),
          ...d.stores.map(lib => LIB.esc(cell?.verdicts[lib]?.text ?? 'n/a')),
        ];
      })
    );
    return {
      plot,
      table: LIB.table(head, rows),
      note: `${LIB.esc(d.titles[st.scenario] ?? st.scenario)}, median ms per update at N=1,000.`,
    };
  },

  viewMemory(d, st) {
    const rows = d.rows
      .filter(r => r.n === st.n && r.compiler === 'on')
      .map(r => ({
        label: LIB.name(r.variant),
        value: r.bytesPerRow,
        emph: r.variant === 'store',
        extra: `mount ${r.mountMs.toFixed(1)} ms · ${r.runs} ${r.runs === 1 ? 'run' : 'runs'}`,
      }));
    const plot = rows.length
      ? LIB.bars(
          rows,
          'bytes per row after mount, compiler on, lower is better',
          'bytes per row',
          d.compact
        )
      : '<p class="viz-empty">No data.</p>';
    const table = LIB.table(
      ['variant', 'compiler', 'bytes per row', 'mount ms', 'runs'],
      d.rows
        .filter(r => r.n === st.n)
        .map(r => [
          LIB.esc(LIB.name(r.variant)),
          r.compiler,
          LIB.int(r.bytesPerRow),
          r.mountMs.toFixed(1),
          String(r.runs),
        ])
    );
    return {
      plot,
      table,
      note: `Heap growth after mounting ${LIB.int(st.n)} rows, after GC, divided by the row count.`,
    };
  },
};

const VIEWS = {
  main: 'viewMain',
  spike: 'viewSpike',
  sweep: 'viewSweep',
  memory: 'viewMemory',
};

// ---------------------------------------------------------------- helpers

const esc = LIB.esc;
const ms = LIB.ms;
// A variant's readable name (LIB.name), escaped for HTML.
const vname = v => esc(LIB.name(v));

function placeholderBanner(data) {
  return data.build.status === 'head'
    ? ''
    : `<p class="viz viz-placeholder" role="note"><strong>Placeholder:</strong> these numbers come from older builds. Not for citation.</p>`;
}

function json(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// A figure with filters, the plot, a note, and a table view. `controls` is
// [{key, label, options: [[value, text]]}].
function figure(kind, {title, controls, state, data, data: d}) {
  const view = LIB[VIEWS[kind]](d, state);
  const controlHtml = controls
    .map(
      c =>
        `<label>${esc(c.label)} <select data-control="${c.key}">${c.options
          .map(
            ([v, t]) =>
              `<option value="${esc(v)}"${String(v) === String(state[c.key]) ? ' selected' : ''}>${esc(t)}</option>`
          )
          .join('')}</select></label>`
    )
    .join('');
  return `<figure class="viz" data-viz="${kind}" data-state="${esc(JSON.stringify(state))}">
<figcaption class="viz-title">${codeify(esc(title))}</figcaption>
<div class="viz-controls" role="group" aria-label="${esc(title)} filters">${controlHtml}</div>
<p class="viz-note" aria-live="polite">${view.note}</p>
<div class="viz-plot">${view.plot}</div>
<div class="viz-tip" role="tooltip" hidden></div>
<details class="viz-tableview"><summary>Table view</summary><div class="viz-tablebody">${view.table}</div></details>
<script type="application/json" class="viz-data">${json(data)}</script>
</figure>`;
}

function legend(items) {
  return `<div class="viz-legend">${items
    .map(
      ([cls, shape, label]) =>
        `<span><svg width="22" height="12" aria-hidden="true"><g class="${cls}">${shape === 'line' ? '<line class="line" x1="1" x2="21" y1="6" y2="6"/>' : shape === 'ring' ? '<circle class="dot-off" cx="11" cy="6" r="4.5"/>' : shape === 'bar' ? '<rect class="bar" x="1" y="2" width="20" height="8" rx="2"/>' : shape === 'diamond' ? '<path class="dot-on" d="M11 0.5L16.5 6L11 11.5L5.5 6Z"/>' : '<circle class="dot-on" cx="11" cy="6" r="4.5"/>'}</g></svg>${codeify(esc(label))}</span>`
    )
    .join('')}</div>`;
}

// "a", "a and b", "a, b, and c" (serial comma, style-sheet.md).
function listText(items) {
  if (items.length <= 2) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

// use(store) in prose is code (style-sheet.md). Takes HTML, skips ones that
// are already in <code>.
function codeify(html) {
  return html.replace(/(?<!<code>)use\(store\)/g, '<code>use(store)</code>');
}

function card(inner, caption) {
  return `<div class="viz viz-card">${inner}${caption ? `<p class="viz-caption">${codeify(caption)}</p>` : ''}</div>`;
}

// Compact (card) mode: {"compact": true} on a generator. A smaller card with a
// one-line caption, fewer columns or controls, and the legend and table view
// kept. Without it every generator's output is unchanged.
function isCompact(opts) {
  return Boolean(opts?.args?.compact);
}
function compactCard(inner, caption) {
  return `<div class="viz viz-card viz-compact">${inner}${caption ? `<p class="viz-caption">${codeify(caption)}</p>` : ''}</div>`;
}
// Keeps only the columns at the given indexes (rows may be {cls, cells}).
function pickCols(head, rows, keep) {
  return [keep.map(i => head[i]), rows.map(r => (Array.isArray(r) ? keep.map(i => r[i]) : {...r, cells: keep.map(i => r.cells[i])}))];
}
// A figure in compact mode: the compact class, and only the listed controls.
function compactFigure(html, keepControls) {
  return html
    .replace('<figure class="viz"', '<figure class="viz viz-compact"')
    .replace(/<label>[^<]*<select data-control="([^"]+)">[\s\S]*?<\/select><\/label>/g, (all, key) => (keepControls.includes(key) ? all : ''));
}

function table(head, rows, cls = '') {
  return `<div class="viz-scroll"><table class="viz-table${cls ? ' ' + cls : ''}"><thead><tr>${head
    .map((h, i) => `<th${i ? ' class="r"' : ''}>${codeify(h)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.cells ?? r).map((c, i) => `<td${i ? ' class="r"' : ''}>${codeify(c)}</td>`).join('')}</tr>`
    )
    .join('')}</tbody></table></div>`;
}

function tallyCell(t, compact = false) {
  if (!t || (t.total === 0 && !t.noWork))
    return '<span class="muted">no data</span>';
  const parts = [
    t.wins && `${t.wins} faster`,
    t.ties && `${t.ties} tie`,
    t.losses && `${t.losses} slower`,
    t.noWork && (t.unread === t.noWork ? `${t.noWork} unread (no work)` : `${t.noWork} no work`),
  ].filter(Boolean);
  // The range without the counts describe() appends; they're on their own line.
  const range = t.range
    .replace(/, and \d+ (with no work|unread updates? \(no work\))$/, '')
    .replace(/\s*\([^)]*\)$/, '')
    .replace(/^(\d+ (faster|tie|slower)(, )?)+$/, '');
  if (compact) return `<span class="sb-count">${t.wins + t.ties}/${t.total}</span><span class="sb-parts">${parts.join(' · ')}</span>`;
  return `<span class="sb-count">${t.wins + t.ties}/${t.total}</span><span class="sb-range">${esc(range)}</span><span class="sb-parts">${parts.join(' · ')}</span>`;
}

// The verdict rule (method.verdictRule), for captions.
function rule(data) {
  return data.series.main.verdictRule ?? data.values['method.verdictRule']?.display ?? '';
}

// "Add / remove is low signal: …" for the main-suite scenarios report-data.mjs
// flags from the counting build.
function lowSignalNote(data) {
  return data.series.main.scenarios
    .filter(s => s.lowSignal)
    .map(s => ` ${s.title} is low signal: ${s.lowSignal}.`)
    .join('');
}
function scenarioTitle(s) {
  return s.lowSignal ? `${esc(s.title)} <small class="muted">(low signal)</small>` : esc(s.title);
}

// The parts of each series the browser needs, to keep the pages small.
function pick(obj, keys) {
  if (!obj) return null;
  return Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
}
function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
const ENTRY = ['median', 'p25', 'p75', 'p95', 'count'];
// Entries go to the browser as arrays (LIB.entry reads them), which keeps
// the page under its size budget.
function entryArray(e) {
  return e ? ENTRY.map(k => e[k] ?? null) : null;
}
function mainForBrowser(d) {
  return {
    variants: d.variants,
    cells: mapValues(d.cells, c => ({
      verdict: c.verdict ? {text: c.verdict.text} : null,
      granular: c.granular ? {text: c.granular.text} : null,
      best: c.best,
      variants: mapValues(c.variants, v => ({
        on: entryArray(v.on),
        off: entryArray(v.off),
      })),
    })),
  };
}
function spikeForBrowser(d, family) {
  return {
    families: d.families,
    family,
    unread: d.unread ?? [],
    ks: d.ks,
    throttles: d.throttles,
    variants: d.variants,
    cells: mapValues(d.cells, c => ({
      variants: mapValues(c.variants, v => pick(v, ['median', 'vsRedux'])),
    })),
  };
}
function sweepForBrowser(d, titles) {
  return {
    scenarios: d.scenarios,
    throttles: d.throttles,
    libraries: d.libraries,
    stores: d.stores,
    configs: d.configs,
    titles,
    cells: mapValues(d.cells, c => ({
      libraries: mapValues(c.libraries, e => pick(e, ['median'])),
      verdicts: mapValues(c.verdicts, v => (v ? {text: v.text} : null)),
    })),
  };
}

// ---------------------------------------------------------------- generators

function buildLabel(data) {
  const b = data.build;
  return `<p class="viz-build" data-build-status="${esc(b.status)}" data-build-sha="${esc(b.shortSha)}">${esc(b.label)}</p>`;
}

function scoreboard(data, opts) {
  const compact = isCompact(opts);
  const sb = data.series.scoreboard;
  // The granular control last: it's reported, but it isn't the headline.
  // {"columns": [...]} picks comparisons (ids from KEYS.md "Comparisons").
  const ids = opts?.args?.columns ?? [
    'selectors',
    'redux',
    'zustand',
    'context',
    'context-split',
    'zustand-granular',
  ];
  const head = [
    'scenario',
    // Short headers: the caption defines the granular control.
    ...ids.map(id =>
      esc(sb.comparisons[id].replace(/^store \+ compiler vs /, 'vs ').replace(/\s*\([^)]*\)$/, ''))
    ),
  ];
  const scenarios = data.series.main.scenarios;
  const titleOf = r => scenarioTitle(scenarios.find(s => s.key === r.key) ?? r);
  const rows = sb.rows.map(r => [
    titleOf(r),
    ...ids.map(id => tallyCell(r.tallies[id], compact)),
  ]);
  rows.push({
    cls: 'total',
    cells: ['every scenario', ...ids.map(id => tallyCell(sb.all[id], compact))],
  });
  if (compact) {
    return compactCard(placeholderBanner(data) + table(head, rows, 'scoreboard'), 'use(store) with the compiler vs each library at its faster setting. Bold: matched or beaten.');
  }
  return card(
    placeholderBanner(data) + table(head, rows, 'scoreboard'),
    `use(store) with the compiler against each library at its faster compiler setting, over every size and CPU throttle. The bold count is configurations matched or beaten. ${esc(rule(data))} The granular control (a Zustand store per entity) is its own column, never part of the headline.${esc(lowSignalNote(data))}`
  );
}

function scoreboardControls(data, opts) {
  const compact = isCompact(opts);
  const sb = data.series.scoreboard;
  const ids = ['single-selectors', 'nocompiler-selectors', 'compiler-gain'];
  const head = ['scenario', ...ids.map(id => esc(sb.comparisons[id]))];
  const scenarios = data.series.main.scenarios;
  const rows = sb.rows.map(r => [
    scenarioTitle(scenarios.find(s => s.key === r.key) ?? r),
    ...ids.map(id => tallyCell(r.tallies[id], compact)),
  ]);
  rows.push({
    cls: 'total',
    cells: ['every scenario', ...ids.map(id => tallyCell(sb.all[id], compact))],
  });
  if (compact) {
    return compactCard(placeholderBanner(data) + table(head, rows, 'scoreboard'), 'Controls: one store, no compiler, and what the compiler buys use(store).');
  }
  return card(
    placeholderBanner(data) + table(head, rows, 'scoreboard'),
    `Controls: one store without selectors, everything without the compiler, and what the compiler buys use(store). ${esc(rule(data))}`
  );
}

function mainChart(data, opts) {
  const d = data.series.main;
  const state = {
    scenario: d.scenarios[0]?.key,
    n: d.ns.includes(1000) ? 1000 : d.ns[0],
    throttle: d.throttles[0],
  };
  return (
    placeholderBanner(data) +
    figure('main', {
      title: opts?.args?.title ?? 'Median ms per update for every variant, with and without the compiler',
      controls: [
        {
          key: 'scenario',
          label: 'Scenario',
          options: d.scenarios.map(s => [s.key, s.title]),
        },
        {
          key: 'n',
          label: 'Rows',
          options: d.ns.map(n => [n, n.toLocaleString('en-US')]),
        },
        {
          key: 'throttle',
          label: 'CPU',
          options: d.throttles.map(t => [t, `${t}× throttle`]),
        },
      ],
      state,
      data: {...mainForBrowser(d), compact: isCompact(opts)},
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'dot', 'use(store)'],
        ['muted', 'dot', 'the other approaches'],
        ['muted', 'line', 'middle half of the samples'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function mainVerdicts(data, opts) {
  const d = data.series.main;
  if (isCompact(opts)) return verdictGrid(data, {args: {comparison: 'headline', compact: true}});
  const cols = d.ns.flatMap(n => d.throttles.map(t => [n, t]));
  const head = [
    'scenario',
    ...cols.map(([n, t]) => `N=${n.toLocaleString('en-US')} · ${t}×`),
  ];
  const rows = d.scenarios.map(s => [
    scenarioTitle(s),
    ...cols.map(([n, t]) => {
      const c = d.cells[`${s.key}|${n}|${t}`];
      if (!c?.verdict) return '–';
      const granular = c.granular ? `<br><small class="muted">granular control: ${esc(c.granular.text)}</small>` : '';
      return `${esc(c.verdict.text)}<br><small class="muted">vs ${esc(c.best)}</small>${granular}`;
    }),
  ]);
  return card(
    placeholderBanner(data) + table(head, rows),
    `use(store) with the compiler against ${esc(d.headline)}, each at its faster compiler setting. The small line is the granular control (a Zustand store per entity), which isn't part of the headline. ${esc(rule(data))}${esc(lowSignalNote(data))}`
  );
}

function mainTable(data) {
  const d = data.series.main;
  const cols = d.ns.flatMap(n => d.throttles.map(t => [n, t]));
  return (
    placeholderBanner(data) +
    d.scenarios
      .map(s => {
        const rows = d.variants.flatMap(v =>
          ['on', 'off']
            .filter(c =>
              cols.some(
                ([n, t]) => d.cells[`${s.key}|${n}|${t}`]?.variants[v]?.[c]
              )
            )
            .map(c => [
              `${vname(v)}${c === 'on' ? ' + compiler' : ''}`,
              ...cols.map(([n, t]) =>
                ms(
                  d.cells[`${s.key}|${n}|${t}`]?.variants[v]?.[c]?.median ??
                    null
                )
              ),
            ])
        );
        return (
          `<h4 class="viz-h">${scenarioTitle(s)}</h4>` +
          card(
            table(
              [
                'variant',
                ...cols.map(
                  ([n, t]) => `N=${n.toLocaleString('en-US')} · ${t}×`
                ),
              ],
              rows
            ),
            s.lowSignal ? `Low signal: ${esc(s.lowSignal)}.` : undefined
          )
        );
      })
      .join('\n')
  );
}

function countsTable(data, opts) {
  const only = opts?.args?.scenarios;
  const rows = data.series.counts.filter(
    r => r.suite === 'main' && r.compiler === 'on' && (!only || only.includes(r.scenario))
  );
  const scenarios = data.series.main.scenarios.map(s => s.key);
  const variants = data.series.main.variants.length
    ? data.series.main.variants
    : [...new Set(rows.map(r => r.variant))];
  const ordered = rows
    .filter(r => variants.includes(r.variant))
    .sort(
      (a, b) =>
        scenarios.indexOf(a.scenario) - scenarios.indexOf(b.scenario) ||
        variants.indexOf(a.variant) - variants.indexOf(b.variant)
    );
  const countsHtml = table(
    [
      'scenario',
      'variant',
      'counted renders',
      'Row renders',
      'selector calls',
    ],
    ordered.map(r => [
      esc(r.scenario),
      vname(r.variant),
      LIB.int(r.renders),
      LIB.int(r.rows),
      LIB.int(r.selectors),
    ])
  );
  if (isCompact(opts)) {
    // One row per scenario, one column per variant ({"variants": [...]}).
    const vs = opts.args.variants ?? variants;
    const byKey = new Map(ordered.map(r => [`${r.scenario}|${r.variant}`, r]));
    const scs = scenarios.filter(sc => ordered.some(r => r.scenario === sc));
    const cell = r => (r ? `${LIB.int(r.renders)} <small class="muted">· ${LIB.int(r.selectors)} sel.</small>` : '–');
    return compactCard(
      table(['scenario', ...vs.map(vname)], scs.map(sc => [esc(sc), ...vs.map(v => cell(byKey.get(`${sc}|${v}`)))])),
      `Counting build, one update, compiled: counted renders · selector calls. Counted: ${esc(data.values['method.countedComponents']?.display ?? '')}.`
    );
  }
  return card(
    countsHtml,
    `From the counting build at ${esc(data.values['method.countsRows']?.display ?? '')} rows, every component compiled: work for one update. Counted renders are the renders of ${esc(data.values['method.countedComponents']?.display ?? 'the instrumented components')}, not every component (App and the list aren't counted). Row renders are among them.`
  );
}

function suiteTable(data, suite, opts) {
  const s = data.series.suites.find(x => x.suite === suite);
  if (!s)
    return card('<p class="viz-empty">No pinned results for this suite.</p>');
  const head = [
    'scenario',
    ...s.variants.map(vname),
    ...s.lefts.map(l => `${vname(l)} vs best`),
    ...(s.controls ?? []).map(v => `${vname(v)} vs Redux`),
  ];
  const rows = s.rows.map(r => {
    const redux = r.cells.redux?.on;
    return [
      `${esc(r.scenario)} · ${r.throttle}×`,
      ...s.variants.map(v => {
        const e = r.cells[v]?.on;
        if (!e) return '–';
        const rel =
          redux && v !== 'redux'
            ? ` <small class="muted">${(e.mean / redux.mean).toFixed(2)}×</small>`
            : '';
        return `${ms(e.median)}${rel}`;
      }),
      ...s.lefts.map(l => esc(r.verdicts[l]?.text ?? 'n/a')),
      ...(s.controls ?? []).map(v => esc(r.controls?.[v]?.text ?? 'n/a')),
    ];
  });
  const unread = [...new Set(s.rows.filter(r => Object.values(r.verdicts).some(v => v?.unread)).map(r => r.scenario))];
  if (isCompact(opts)) {
    const keep = [0, ...head.map((h, i) => i).filter(i => i > s.variants.length)];
    const [h, rr] = pickCols(head, rows, keep);
    return compactCard(placeholderBanner(data) + table(h, rr), `Verdicts with the compiler, under the restart rule.${unread.length ? ` ${esc(unread.join(', '))}: unread update (no work).` : ''}`);
  }
  return card(
    placeholderBanner(data) + table(head, rows),
    `Median ms per update with the compiler. Small numbers are the ratio of means to redux. ${s.lefts.length ? `Verdicts compare with the fastest of ${esc(listText(s.opponents))}, each at its faster compiler setting.` : ''}${s.controls?.length ? ` The control columns compare each Redux setup with redux, each at its faster compiler setting ("faster" means the control is faster).` : ''} ${esc(rule(data))}${unread.length ? ` ${esc(unread.join(', '))}: an unread update (no component displays what changes, so the DOM never changes), counted as no work, not as a win.` : ''}`
  );
}

function fairness5Table(data, opts) {
  const d = data.series.fairness5;
  if (!d) return card('<p class="viz-empty">No pinned results for the fairness run with every variant.</p>');
  const head = [
    'scenario',
    ...d.variants.map(vname),
    'vs the fastest Redux',
    'vs Zustand',
  ];
  const rows = d.rows.map(r => [
    `${esc(r.scenario)} · ${r.throttle}×`,
    ...d.variants.map(v => {
      const e = r.cells[v]?.on;
      return e ? ms(e.median) : '–';
    }),
    `${esc(r.verdicts.redux?.text ?? 'n/a')}${r.best.redux ? `<br><small class="muted">vs ${esc(r.best.redux)}</small>` : ''}`,
    esc(r.verdicts.zustand?.text ?? 'n/a'),
  ]);
  rows.push({
    cls: 'total',
    cells: ['every scenario', ...d.variants.map(() => ''), tallyCell(d.tallies.redux, isCompact(opts)), tallyCell(d.tallies.zustand, isCompact(opts))],
  });
  if (isCompact(opts)) {
    // The verdict text only (the fastest setup's name is in the full table).
    rows.forEach((r, i) => {
      if (Array.isArray(r)) r[head.length - 2] = esc(d.rows[i].verdicts.redux?.text ?? 'n/a');
    });
    const [h, rr] = pickCols(head, rows, [0, head.length - 2, head.length - 1]);
    return compactCard(placeholderBanner(data) + table(h, rr, 'scoreboard'), 'use(store) with the compiler vs the fastest Redux setup and vs Zustand.');
  }
  return card(
    placeholderBanner(data) + table(head, rows, 'scoreboard'),
    `Median ms per update with the compiler. use(store) with the compiler against the fastest of ${esc(listText(d.redux))} (each at its faster compiler setting), and against Zustand. The headline itself stays defined against idiomatic RTK Redux. ${esc(rule(data))}`
  );
}

// The family the one-panel view shows: mixed interleaves the score and
// comment updates the other panels isolate, so it stands for both.
const SPIKE_FAMILY = 'mixed';

function spikeChart(data, opts) {
  const d = data.series.spike;
  if (!d) return card('<p class="viz-empty">No pinned spike results.</p>');
  const family = opts?.args?.family ?? (d.families.includes(SPIKE_FAMILY) ? SPIKE_FAMILY : d.families.find(f => !(d.unread ?? []).includes(f)));
  return (
    placeholderBanner(data) +
    figure('spike', {
      title: opts?.args?.title ?? 'Shared derived data: ms per update as readers per category grow',
      controls: [
        {
          key: 'view',
          label: 'Show',
          options: [
            ['one', `${family} updates`],
            ['all', 'every kind of update'],
          ],
        },
        {
          key: 'throttle',
          label: 'CPU',
          options: d.throttles.map(t => [t, `${t}× throttle`]),
        },
      ],
      state: {view: 'one', throttle: d.throttles[0]},
      data: {...spikeForBrowser(d, family), compact: isCompact(opts)},
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'line', 'use(store)'],
        ['s2', 'line', 'use(store) with weakMemo'],
        ['muted', 'line', 'Redux, the reference'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function sweepChart(data, opts) {
  const d = data.series.sweeps;
  if (!d) return card('<p class="viz-empty">No pinned sweep results.</p>');
  const titles = Object.fromEntries(
    d.scenarios.map(s => [s, data.series.main.scenarios.find(m => m.key === s)?.title ?? s])
  );
  return (
    placeholderBanner(data) +
    figure('sweep', {
      title: opts?.args?.title ?? 'Sweeps: ms per update by compiler coverage and props per row',
      controls: [
        {
          key: 'scenario',
          label: 'Scenario',
          options: [...d.scenarios]
            .sort((a, b) => (a === 'selection' ? -1 : b === 'selection' ? 1 : 0))
            .map(s => [s, titles[s]]),
        },
        {
          key: 'view',
          label: 'Sweep',
          options: [
            ['coverage', 'compiler coverage'],
            ['width', 'props per row'],
          ],
        },
        {
          key: 'throttle',
          label: 'CPU',
          options: d.throttles.map(t => [t, `${t}× throttle`]),
        },
      ],
      state: {
        scenario: d.scenarios.includes('selection') ? 'selection' : d.scenarios[0],
        view: 'coverage',
        throttle: d.throttles[0],
      },
      data: {...sweepForBrowser(d, titles), compact: isCompact(opts)},
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'line', 'use(store)'],
        ['s2', 'line', 'keyed selection'],
        ['muted', 'line', 'Redux and Zustand'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function typingTable(data, which, opts) {
  const rows = data.series.typing[which] ?? [];
  if (rows.length === 0)
    return card('<p class="viz-empty">No pinned typing results.</p>');
  if (isCompact(opts)) {
    const on = rows.filter(r => r.compiler === 'on');
    return compactCard(
      placeholderBanner(data) +
        table(
          ['variant', 'CPU', 'p50 ms', 'p95 ms'],
          on.map(r => [`${vname(r.variant)} + compiler`, `${r.throttle}×`, r.p50.toFixed(1), r.p95.toFixed(1)])
        ),
      'Keydown to next frame while the list re-filters, compiler on.'
    );
  }
  return card(
    placeholderBanner(data) +
      table(
        [
          'variant',
          'CPU',
          'p50 ms',
          'p95 ms',
          'max ms',
          'list caught up after ms',
          'runs',
        ],
        rows.map(r => [
          `${vname(r.variant)}${r.compiler === 'on' ? ' + compiler' : ''}`,
          `${r.throttle}×`,
          r.p50.toFixed(1),
          r.p95.toFixed(1),
          r.max.toFixed(1),
          LIB.int(r.settle),
          String(r.runs),
        ])
      ),
    'Keydown to next frame while the list re-filters, over every key of every run. "List caught up" is the time from the start of typing (the click into the input) until the list shows the rows for the full typed text, so it includes the typing itself. Median of runs.'
  );
}

function memoryChart(data, opts) {
  const rows = data.series.memory;
  if (rows.length === 0)
    return card('<p class="viz-empty">No pinned memory results.</p>');
  const ns = [...new Set(rows.map(r => r.n))].sort((a, b) => a - b);
  return (
    placeholderBanner(data) +
    figure('memory', {
      title: opts?.args?.title ?? 'Memory per row',
      controls: [
        {
          key: 'n',
          label: 'Rows',
          options: ns.map(n => [n, n.toLocaleString('en-US')]),
        },
      ],
      state: {n: ns[ns.length - 1]},
      data: {rows, compact: isCompact(opts)},
    })
  );
}

function lossesTable(data, opts) {
  const compact = isCompact(opts);
  const rows = data.series.losses;
  const v = data.values;
  const headline = data.series.main.headline ?? 'the headline opponents';
  const areas = [
    ['main', `Main suite, vs ${headline}`],
    ['granular', 'Main suite, vs the granular control (a Zustand store per entity, not part of the headline)'],
    ['suites', 'Ported Redux suites and fairness'],
    ['fairness', 'Fairness with every variant: store vs the fastest Redux setup (RTK, plain Redux, RTK without auto-freeze)'],
    ['sweeps', 'Sweeps: selection and compiler coverage'],
    ['spike', 'Shared derived data, plain store and store-memo vs Redux'],
  ];
  const head = ['where', 'store side', 'median ms', 'mean ms', 'against', 'median ms', 'mean ms', 'verdict (means)'];
  const lowSignalLosses = data.series.main.scenarios.some(
    s => s.lowSignal && rows.some(r => r.where.startsWith(`main · ${s.key} · `))
  );
  const sections = areas
    .filter(([a]) => v[`losses.${a}.of`])
    .map(([a, title]) => {
      const list = rows.filter(r => r.area === a);
      const summary = `${v[`losses.${a}.count`].display} of ${v[`losses.${a}.of`].display} lost`;
      const body = list.length && compact
        ? list.map(r => `<tr><td>${esc(r.where)}</td><td class="r">${esc(r.left)}</td><td class="r">${esc(r.opponent)}</td><td class="r">${esc(r.text)}</td></tr>`).join('')
        : list.length
        ? list
            .map(
              r =>
                `<tr><td>${esc(r.where)}</td><td class="r">${esc(r.left)}</td><td class="r">${ms(r.leftMedian)}</td><td class="r">${ms(r.leftMean)}</td><td class="r">${esc(r.opponent)}</td><td class="r">${ms(r.opponentMedian)}</td><td class="r">${ms(r.opponentMean)}</td><td class="r">${esc(r.text)}</td></tr>` +
                (r.reason ? `<tr class="reason"><td colspan="${head.length}">${esc(r.reason)}</td></tr>` : ''),
            )
            .join('')
        : `<tr><td colspan="${compact ? 4 : head.length}" class="muted">No losses.</td></tr>`;
      return `<tr class="area"><th colspan="${compact ? 4 : head.length}">${esc(title)} <small>${esc(summary)}</small></th></tr>${body}`;
    })
    .join('');
  if (compact) {
    // A count per area, with every loss behind a disclosure.
    const summary = areas
      .filter(([a]) => v[`losses.${a}.of`])
      .map(([a, title]) => {
        const worst = rows.filter(r => r.area === a).sort((x, y) => y.ratio - x.ratio)[0];
        return [esc(title), `${esc(v[`losses.${a}.count`].display)} of ${esc(v[`losses.${a}.of`].display)}`, worst ? esc(worst.text) : '–'];
      });
    const h = ['where', 'store side', 'against', 'verdict (means)'];
    return compactCard(
      placeholderBanner(data) +
        table(['area', 'lost', 'worst'], summary) +
        `<details class="viz-tableview"><summary>Every loss</summary><div class="viz-scroll"><table class="viz-table losses"><thead><tr>${h.map((x, i) => `<th${i ? ' class="r"' : ''}>${x}</th>`).join('')}</tr></thead><tbody>${sections}</tbody></table></div></details>`,
      'Comparisons use(store) loses, by area, under the restart rule.'
    );
  }
  return card(
    placeholderBanner(data) +
      `<div class="viz-scroll"><table class="viz-table losses"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${sections}</tbody></table></div>`,
    `Every comparison the store side loses, with what the counting build says each side did for one update of that scenario. ${esc(rule(data))} Verdicts compare means, which include the slow tail: where a median is lower but the mean is higher, the store side has more slow updates.${lowSignalLosses ? esc(lowSignalNote(data)) : ''}`,
  );
}

function nobailoutTable(data, opts) {
  const d = data.series.nobailout;
  if (!d) return card('<p class="viz-empty">No pinned results without the same-element bailout.</p>');
  const head = [
    'configuration',
    ...d.variants.map(vname),
    `vs ${esc(data.series.main.headline ?? 'the headline opponents')}`,
    'vs the granular control',
    'store with the bailout',
    'what the bailout buys',
  ];
  const rows = d.scenarios.flatMap(sc =>
    d.ns.flatMap(n =>
      d.throttles
        .map(t => [t, d.cells[`${sc.key}|${n}|${t}`]])
        .filter(([, c]) => c)
        .map(([t, c]) => [
          `${esc(sc.title)} · N=${n.toLocaleString('en-US')} · ${t}×`,
          ...d.variants.map(vv => ms(c.variants[vv]?.median ?? null)),
          esc(c.verdict?.text ?? 'n/a'),
          esc(c.granular?.text ?? 'n/a'),
          ms(c.withBailout?.median ?? null),
          esc(c.gain?.text ?? 'n/a'),
        ]),
    ),
  );
  // The tally against the headline opponents, next to the head build's.
  const v = data.values;
  const shown = k => esc(v[k]?.display ?? 'n/a');
  const tally = v['nobailout.main.tally.all.total']
    ? `<p class="viz-note">Without the bailout, <code>use(store)</code> with the compiler matches or beats ${esc(data.series.main.headline ?? 'the headline opponents')} in ${shown('nobailout.main.tally.all.matchOrBeat')} of ${shown('nobailout.main.tally.all.total')} configurations: ${shown('nobailout.main.tally.all.range')}. With it (the head build, same configurations): ${shown('nobailout.main.tally.withBailout.matchOrBeat')} of ${shown('nobailout.main.tally.withBailout.total')}: ${shown('nobailout.main.tally.withBailout.range')}.</p>`
    : '';
  if (isCompact(opts)) {
    // One row per scenario: the tally without the bailout, and what it buys.
    const vv = data.values;
    const shownKey = k => esc(vv[k]?.display ?? 'n/a');
    const perScenario = d.scenarios.map(sc => [
      esc(sc.title),
      `${shownKey(`nobailout.main.tally.${sc.key}.wins`)} faster · ${shownKey(`nobailout.main.tally.${sc.key}.ties`)} tie · ${shownKey(`nobailout.main.tally.${sc.key}.losses`)} slower`,
      shownKey(`nobailout.main.bailoutGain.${sc.key}.range`),
    ]);
    return compactCard(
      placeholderBanner(data) + tally + table(['scenario', `without the bailout, vs ${esc(data.series.main.headline ?? 'the headline opponents')}`, 'what the bailout buys'], perScenario),
      'Without the same-element bailout, compiler on. Never part of the headline.'
    );
  }
  let sweeps = '';
  const sw = data.series.nobailoutSweeps;
  if (sw) {
    const swRows = sw.scenarios.flatMap(sc =>
      sw.throttles.flatMap(t =>
        sw.configs
          .map(cfg => [cfg, sw.cells[`${sc}|${t}|${cfg.key}`]])
          .filter(([, c]) => c)
          .map(([cfg, c]) => [
            `${esc(sc)} · ${esc(cfg.label)} · ${t}×`,
            ...sw.libraries.map(lib => ms(c.libraries[lib]?.median ?? null)),
            ...sw.stores.map(lib => esc(c.verdicts[lib]?.text ?? 'n/a')),
          ]),
      ),
    );
    sweeps = `<h4 class="viz-h">Sweeps without the bailout</h4>` + table(['configuration', ...sw.libraries.map(vname), ...sw.stores.map(l => `${vname(l)} vs best`)], swRows);
  }
  return card(
    placeholderBanner(data) + tally + table(head, rows) + sweeps,
    `React built with enableSameElementBailout off, compiler on, median ms per update. Never part of the headline. "What the bailout buys" compares store + compiler on the head build with this build in the same configuration ("faster" means faster with the bailout). ${esc(rule(data))}`,
  );
}

// ---------------------------------------------------------------- store vs context

function ctxScenarios(data) {
  return data.series.main.scenarios;
}

function ctxScoreboard(data, opts) {
  const d = data.series.ctx;
  if (!d) return card('<p class="viz-empty">No pinned Context results.</p>');
  const cols = [
    ['off|vsContext', 'vs one context, compiler off'],
    ['on|vsContext', 'vs one context, compiler on'],
    ['off|vsContextSplit', 'vs a context per slice, compiler off'],
    ['on|vsContextSplit', 'vs a context per slice, compiler on'],
  ];
  const rows = ctxScenarios(data).map(s => [scenarioTitle(s), ...cols.map(([k]) => tallyCell(d.tallies[k]?.[s.key], isCompact(opts)))]);
  rows.push({cls: 'total', cells: ['every scenario', ...cols.map(([k]) => tallyCell(d.tallies[k]?.all, isCompact(opts)))]});
  if (isCompact(opts)) {
    return compactCard(placeholderBanner(data) + table(['scenario', ...cols.map(([, h]) => esc(h))], rows, 'scoreboard'), 'use(store) vs Context at the same compiler setting. Bold: matched or beaten.');
  }
  return card(
    placeholderBanner(data) + table(['scenario', ...cols.map(([, h]) => esc(h))], rows, 'scoreboard'),
    `use(store) against Context at the same compiler setting: both without the compiler, or both with it, over every size and CPU throttle. The bold count is configurations where use(store) matches or beats Context. ${esc(rule(data))}${esc(lowSignalNote(data))}`
  );
}

function ctxChart(data, opts) {
  const d = data.series.main;
  const c = data.series.ctx;
  if (!c) return card('<p class="viz-empty">No pinned Context results.</p>');
  const say = (v, label) => `${esc(v?.text ?? 'n/a')} vs ${label}`;
  const filtered = {
    ...mainForBrowser({
      ...d,
      variants: c.variants,
      cells: Object.fromEntries(
        Object.entries(d.cells).map(([k, cell]) => [
          k,
          {...cell, variants: Object.fromEntries(c.variants.map(v => [v, cell.variants[v]]))},
        ])
      ),
    }),
  };
  for (const [k, cell] of Object.entries(filtered.cells)) {
    const v = c.cells[k]?.verdicts;
    cell.note = v
      ? `With the compiler: ${say(v.on.vsContext, 'one context')}, ${say(v.on.vsContextSplit, 'a context per slice')}. Without: ${say(v.off.vsContext, 'one context')}, ${say(v.off.vsContextSplit, 'a context per slice')}.`
      : '';
  }
  const state = {
    scenario: d.scenarios[0]?.key,
    n: d.ns.includes(1000) ? 1000 : d.ns[0],
    throttle: d.throttles[0],
  };
  return (
    placeholderBanner(data) +
    figure('main', {
      title: opts?.args?.title ?? 'Median ms per update for use(store) and Context, with and without the compiler',
      controls: [
        {key: 'scenario', label: 'Scenario', options: d.scenarios.map(s => [s.key, s.title])},
        {key: 'n', label: 'Rows', options: d.ns.map(n => [n, n.toLocaleString('en-US')])},
        {key: 'throttle', label: 'CPU', options: d.throttles.map(t => [t, `${t}× throttle`])},
      ],
      state,
      data: {...filtered, compact: isCompact(opts)},
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'dot', 'use(store)'],
        ['muted', 'dot', 'one context and a context per slice'],
        ['muted', 'line', 'middle half of the samples'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function ctxCompilerGain(data, opts) {
  const d = data.series.ctx;
  if (!d) return card('<p class="viz-empty">No pinned Context results.</p>');
  const rows = ctxScenarios(data).map(s => [scenarioTitle(s), ...d.variants.map(v => tallyCell(d.tallies[`gain|${v}`]?.[s.key], isCompact(opts)))]);
  rows.push({cls: 'total', cells: ['every scenario', ...d.variants.map(v => tallyCell(d.tallies[`gain|${v}`]?.all, isCompact(opts)))]});
  if (isCompact(opts)) {
    return compactCard(placeholderBanner(data) + table(['scenario', ...d.variants.map(v => esc(d.names[v] ?? v))], rows, 'scoreboard'), 'What the compiler buys each approach. Bold: faster or tied with it.');
  }
  return card(
    placeholderBanner(data) + table(['scenario', ...d.variants.map(v => esc(d.names[v] ?? v))], rows, 'scoreboard'),
    `What the React Compiler buys each approach: the same variant with the compiler against without it, over every size and CPU throttle. "Faster" means faster with the compiler, and the bold count is configurations where the compiler matches or beats no compiler. ${esc(rule(data))}`
  );
}

function ctxCounts(data, opts) {
  const d = data.series.ctx;
  if (!d) return card('<p class="viz-empty">No pinned Context results.</p>');
  const byKey = new Map(data.series.counts.filter(r => r.suite === 'main').map(r => [`${r.scenario}|${r.variant}|${r.compiler}`, r]));
  if (isCompact(opts)) {
    const cols = d.variants.flatMap(v => ['off', 'on'].map(c => [v, c]));
    return compactCard(
      table(
        ['scenario', ...cols.map(([v, c]) => `${esc(d.names[v] ?? v)}, compiler ${c}`)],
        ctxScenarios(data).map(s => [scenarioTitle(s), ...cols.map(([v, c]) => {
          const r = byKey.get(`${s.key}|${v}|${c}`);
          return r ? LIB.int(r.renders) : '–';
        })])
      ),
      `Counted renders for one update (${esc(data.values['method.countedComponents']?.display ?? '')}).`
    );
  }
  const head = ['scenario', 'variant', 'counted renders, compiler off', 'Row renders, compiler off', 'counted renders, compiler on', 'Row renders, compiler on'];
  const rows = ctxScenarios(data).flatMap(s =>
    d.variants.map(v => {
      const off = byKey.get(`${s.key}|${v}|off`);
      const on = byKey.get(`${s.key}|${v}|on`);
      const n = x => (x === null || x === undefined ? '–' : LIB.int(x));
      return [esc(s.title), esc(d.names[v] ?? v), n(off?.renders), n(off?.rows), n(on?.renders), n(on?.rows)];
    })
  );
  return card(
    table(head, rows),
    `Work for one update in the counting build (${esc(data.values['method.countsRows']?.display ?? '')} rows). Counted renders are the renders of ${esc(data.values['method.countedComponents']?.display ?? 'the instrumented components')}, not every component (App and the list aren't counted). Row renders are among them. Context re-renders every consumer of a changed value. With the compiler, unchanged output is skipped.`
  );
}

// ---------------------------------------------------------------- speedup

// use(store)'s speedup in every configuration of one comparison, read from
// the series: the verdict (ratio of means, tie, restarts), both medians and
// the scenario tally. Nothing is re-judged here.
function speedupData(data, which) {
  const m = data.series.main;
  const setting = c => (c === 'on' ? ' + compiler' : ' without the compiler');
  // {median, mean} of an entry: the mean is what the verdict's ratio is
  // made of, the median is for reference.
  const mm = e => ({median: e?.median ?? null, mean: e?.mean ?? null});
  const oppOf = o => (o ? {name: LIB.name(o.variant), compiler: o.compiler, label: LIB.name(o.variant) + setting(o.compiler), ...mm(o)} : null);
  const scenarios = m.scenarios;
  const ctx = which.match(/^ctx-(off|on)-(vsContext|vsContextSplit)$/);
  if (ctx) {
    const c = data.series.ctx;
    if (!c) return null;
    const [, set, vs] = ctx;
    const opp = c.vs[vs];
    const both = set === 'on' ? 'both with the compiler' : 'both without the compiler';
    return {
      scenarios,
      ns: m.ns,
      throttles: m.throttles,
      store: `use(store)${setting(set)}`,
      opponent: `${LIB.name(opp)}, ${both}`,
      title: `use(store) vs ${LIB.name(opp)}, ${both}`,
      point(s, n, t) {
        const k = `${s}|${n}|${t}`;
        const cell = m.cells[k];
        const verdict = c.cells[k]?.verdicts[set][vs];
        if (!cell || !verdict) return null;
        return {
          verdict,
          store: mm(cell.variants.store?.[set]),
          opp: {name: LIB.name(opp), compiler: set, label: LIB.name(opp) + setting(set), ...mm(cell.variants[opp]?.[set])},
        };
      },
      tally: s => c.tallies[`${set}|${vs}`]?.[s],
    };
  }
  if (which === 'nobailout') {
    const nb = data.series.nobailout;
    if (!nb) return null;
    return {
      scenarios: scenarios.filter(s => nb.scenarios.some(x => x.key === s.key)),
      ns: nb.ns,
      throttles: nb.throttles,
      store: 'use(store) + compiler',
      opponent: `${m.headline}, without the same-element bailout`,
      title: `Without the same-element bailout: use(store) + compiler vs ${m.headline}`,
      point(s, n, t) {
        const cell = nb.cells[`${s}|${n}|${t}`];
        if (!cell?.verdict) return null;
        return {
          verdict: cell.verdict,
          store: mm(cell.variants.store),
          opp: oppOf(cell.opp),
        };
      },
      tally: s => nb.tallies[s],
    };
  }
  const granular = which === 'granular';
  const sb = data.series.scoreboard;
  return {
    scenarios,
    ns: m.ns,
    throttles: m.throttles,
    store: 'use(store) + compiler',
    opponent: granular ? LIB.name('zustand-granular') : m.headline,
    title: `use(store) + compiler vs ${granular ? LIB.name('zustand-granular') : m.headline}`,
    point(s, n, t) {
      const cell = m.cells[`${s}|${n}|${t}`];
      const verdict = granular ? cell?.granular : cell?.verdict;
      if (!verdict) return null;
      return {verdict, store: mm(cell.variants.store?.on), opp: oppOf(granular ? cell.granularOpp : cell.opp)};
    },
    tally: s => sb.rows.find(r => r.key === s)?.tallies[granular ? 'zustand-granular' : 'selectors'],
  };
}

// The log-ratio axis: "2× slower" sits as far from parity as "2× faster".
// Its ticks are 1, 2 and 5 per decade on both sides, by priority: parity,
// the powers of ten, then the 2s and the 5s.
const SPEEDUP_TICKS = [1, 10, 1 / 10, 100, 1 / 100, 2, 1 / 2, 20, 1 / 20, 5, 1 / 5, 50, 1 / 50];
function speedupTick(t) {
  return t === 1 ? 'parity' : t > 1 ? `${t}× faster` : `${Math.round(1 / t)}× slower`;
}

function speedupConfig(s, n, t) {
  return `${s.title} · N=${n.toLocaleString('en-US')} · ${t}× CPU`;
}

// Full and compact geometry. Compact is about a half-width dashboard card's
// content width, so its 12px text renders at about 12px.
const SPEEDUP_GEOMETRY = {
  full: {W: 680, plotL: 236, right: 84, laneH: 12, pad: 14},
  compact: {W: LIB.COMPACT_W(), plotL: 150, right: 70, laneH: 12, pad: 10},
};

function speedupSvg(sd, compact) {
  const {W, plotL, right, laneH, pad} = SPEEDUP_GEOMETRY[compact ? 'compact' : 'full'];
  const plotR = W - right;
  const top = 42;
  const rowH = sd.ns.length * laneH + pad;
  const bottom = 48;
  const H = top + sd.scenarios.length * rowH + bottom;
  const f = v => Number(v.toFixed(1));
  const points = sd.scenarios.flatMap(s =>
    sd.ns.flatMap((n, li) =>
      sd.throttles.map((t, ti) => ({s, n, t, li, ti, p: sd.point(s.key, n, t)})).filter(x => x.p)
    )
  );
  const speeds = points.filter(x => !x.p.verdict.noWork && x.p.verdict.ratio > 0).map(x => 1 / x.p.verdict.ratio);
  const lo0 = Math.min(1 / 2.2, ...speeds.map(sp => sp / 1.15));
  const hi0 = Math.max(2.2, ...speeds.map(sp => sp * 1.15));
  const lo = Math.max(lo0, 1 / 100);
  const hi = Math.min(hi0, 100);
  const x = sp => plotL + ((Math.log(sp) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (plotR - plotL);
  // Every tick gets a gridline. A label is kept only where it clears the
  // ones already placed.
  const ticks = SPEEDUP_TICKS.filter(t => t >= lo && t <= hi).sort((m, n) => m - n);
  const labeled = [];
  for (const t of SPEEDUP_TICKS) {
    if (ticks.includes(t) && labeled.every(u => Math.abs(x(t) - x(u)) >= 64)) labeled.push(t);
  }
  // Marks, labels and lines that share their look are grouped, so each
  // element only carries its position.
  let svg = LIB.svgOpen(W, H, `${sd.store}: speedup vs ${sd.opponent} for every configuration, log scale`, compact);
  svg += `<g class="grid">${ticks.filter(t => t !== 1).map(t => `<line x1="${f(x(t))}" x2="${f(x(t))}" y1="${top}" y2="${H - bottom}"/>`).join('')}${sd.scenarios
    .slice(1)
    .map((s, i) => `<line x1="0" x2="${W}" y1="${top + (i + 1) * rowH}" y2="${top + (i + 1) * rowH}"/>`)
    .join('')}</g>`;
  if (ticks.includes(1)) svg += `<line class="parity" x1="${f(x(1))}" x2="${f(x(1))}" y1="${top}" y2="${H - bottom}"/>`;
  svg += `<g class="axis" text-anchor="middle">${ticks
    .filter(t => labeled.includes(t))
    .map(t => `<text x="${f(x(t))}" y="${H - bottom + 16}">${speedupTick(t)}</text>`)
    .join('')}<text x="${(plotL + plotR) / 2}" y="${H - 8}">use(store)'s speedup, ratio of means, log scale</text></g>`;
  svg += `<g class="axis" text-anchor="end">`;
  if (x(1) - plotL >= 64) svg += `<text x="${f(x(1) - 8)}" y="${top - 8}">← slower</text>`;
  svg += `<text x="${plotL - 8}" y="${top - 8}">rows</text><text x="${W - 2}" y="${top - 23}">matched</text><text x="${W - 2}" y="${top - 8}">or beaten</text></g>`;
  svg += `<text class="axis" x="${f(x(1) + 8)}" y="${top - 8}">faster →</text>`;
  let labels = '';
  let muted = '';
  let lanes = '';
  let tallies = '';
  sd.scenarios.forEach((s, i) => {
    const y0 = top + i * rowH;
    const cut = s.title.indexOf(' (');
    const lines = cut > 0 ? [s.title.slice(0, cut), s.title.slice(cut + 1)] : [s.title];
    const all = s.lowSignal ? [...lines, 'low signal'] : lines;
    all.forEach((line, j) => {
      const el = `<text x="0" y="${f(y0 + rowH / 2 - (all.length - 1) * 7.5 + j * 15 + 4)}">${esc(line)}</text>`;
      if (s.lowSignal && j === all.length - 1) muted += el;
      else labels += el;
    });
    sd.ns.forEach((n, li) => {
      lanes += `<text x="${plotL - 8}" y="${f(y0 + pad / 2 + li * laneH + laneH / 2 + 3.5)}">${LIB.tick(n)}</text>`;
    });
    const t = sd.tally(s.key);
    if (t) tallies += `<text x="${W - 2}" y="${f(y0 + rowH / 2 + 4)}">${t.wins + t.ties}/${t.total}</text>`;
  });
  svg += `<g class="label emph">${labels}</g><g class="axis">${muted}</g><g class="axis lane" text-anchor="end">${lanes}</g><g class="value" text-anchor="end">${tallies}</g>`;
  const marks = {pos: '', neg: '', tie: ''};
  let hits = '';
  points.forEach(({s, n, t, li, ti, p}, row) => {
    const vd = p.verdict;
    if (vd.noWork || !(vd.ratio > 0)) return;
    // Placed by the verdict's own ratio (of means), so a mark's side always
    // matches its color.
    const sp = 1 / vd.ratio;
    const cls = vd.tie ? 'tie' : sp > 1 ? 'pos' : 'neg';
    const cx = f(x(Math.min(Math.max(sp, lo), hi)));
    const cy = f(top + sd.scenarios.indexOf(s) * rowH + pad / 2 + li * laneH + laneH / 2);
    marks[cls] += ti === 0 ? `<circle cx="${cx}" cy="${cy}" r="4.5"/>` : `<path d="M${cx} ${f(cy - 5.5)}l5.5 5.5l-5.5 5.5l-5.5 -5.5Z"/>`;
    // The tooltip comes from this point's row in the table view (data-i),
    // so the page carries it once.
    hits += `<circle cx="${cx}" cy="${cy}" r="11" tabindex="0" data-i="${row}" aria-label="${esc(`${speedupConfig(s, n, t)}: ${vd.text}`)}"/>`;
  });
  svg += `<g class="pos dot-on">${marks.pos}</g><g class="neg dot-on">${marks.neg}</g><g class="tie dot-off">${marks.tie}</g><g class="hits">${hits}</g>`;
  return {svg: svg + '</svg>', points};
}

function speedupChart(data, {args = {}} = {}) {
  const which = args.comparison ?? 'headline';
  const sd = speedupData(data, which);
  if (!sd) return card('<p class="viz-empty">No pinned results for this comparison.</p>');
  const compact = Boolean(args.compact);
  const {svg, points} = speedupSvg(sd, compact);
  const shapes = ['dot', 'diamond'];
  const items = [
    ['pos', 'dot', 'use(store) faster'],
    ['neg', 'dot', 'use(store) slower'],
    ['tie', 'ring', 'tie'],
    ...sd.throttles.slice(0, 2).map((t, i) => ['key', shapes[i], `${t}× CPU`]),
  ];
  const restarts = vd => (vd.split ? 'disagree, a tie' : vd.tie ? 'within noise, a tie' : 'agree');
  const both = e => `${ms(e?.mean ?? null)} / ${ms(e?.median ?? null)}`;
  // A plain table (right alignment comes from .viz-speedup CSS) to keep the
  // page small. The opponent's name moves into the header when it doesn't
  // change, and its compiler setting too. The verdict cell is the tooltip's
  // value (.tip-v).
  const opps = points.map(({p}) => p.opp);
  const same = k => new Set(opps.map(o => o?.[k])).size === 1;
  const oppCol = same('label') ? null : same('name') ? 'compiler' : 'label';
  const oppHead = oppCol === null ? opps[0]?.label ?? sd.opponent : oppCol === 'compiler' ? opps[0]?.name : 'opponent';
  const head = [
    'configuration',
    `${sd.store}, mean / median ms`,
    ...(oppCol === 'compiler' ? [`${oppHead}, compiler`] : oppCol === 'label' ? ['opponent'] : []),
    `${oppCol === 'label' ? 'opponent' : oppHead}, mean / median ms`,
    'verdict',
    'restarts',
  ];
  const tableHtml = `<div class="viz-scroll"><table class="viz-table"><thead><tr>${head.map(h => `<th>${codeify(esc(h))}</th>`).join('')}</tr></thead><tbody>${points
    .map(
      ({s, n, t, p}) =>
        `<tr><td>${esc(speedupConfig(s, n, t))}</td><td>${both(p.store)}</td>${oppCol ? `<td>${esc(p.opp?.[oppCol] ?? '')}</td>` : ''}<td>${both(p.opp)}</td><td class="tip-v">${esc(p.verdict.text)}</td><td>${restarts(p.verdict)}</td></tr>`
    )
    .join('')}</tbody></table></div>`;
  const caption = compact
    ? 'Ratio of means per configuration. Right of parity is faster. Hollow: a tie.'
    : 'One mark per configuration, placed by the ratio of means the verdict uses. Right of parity, use(store) is faster. Hollow gray: a tie (within noise, or the restarts disagree).';
  return (
    placeholderBanner(data) +
    `<figure class="viz viz-card viz-speedup${compact ? ' viz-compact' : ''}">
<figcaption class="viz-title">${codeify(esc(args.title ?? sd.title))}</figcaption>
${legend(items)}<div class="viz-plot">${svg}</div>
<div class="viz-tip" role="tooltip" hidden></div>
<p class="viz-caption">${codeify(caption)}</p>
<details class="viz-tableview"><summary>Table view</summary><div class="viz-tablebody">${tableHtml}</div></details>
</figure>`
  );
}

// ---------------------------------------------------------------- results tables

// Results tables, modeled on js-framework-benchmark's: implementations in
// columns, configurations in rows grouped by scenario, each cell the mean ±
// a 95% confidence interval (1.96 standard errors of the pooled samples) and
// the slowdown against the fastest cell in its row with the same compiler
// setting. One renderer, and one builder per suite that turns its series
// into a spec (resultsSpec).

// Plain-language names and descriptions of every scenario, per suite. The
// main suite's come from fixtures/store-bench/src/shared/scenarios.js, the
// ported Redux suites' from src/redux-suite/<suite>/scenarios.js.
const RESULTS_SCENARIOS = {
  main: {
    selection: ['select row', 'change which row is selected. Every row reads the selection.'],
    entity: ['edit row', "change one row's data."],
    filter: ['toggle filter', 'switch a filter on and off. Every row checks whether it matches, and the header counts the matches.'],
    'details-inline': ['update details, read in the row', 'change a value that only the expanded rows show (one row in a hundred), read in the row component itself.'],
    'details-component': ['update details, read in a child', 'the same update, read in a child component that mounts only when its row is expanded.'],
    'details-churn': ['expand and collapse', 'expand every tenth row, then collapse them again, so readers mount and unmount.'],
    structure: ['add and remove row', 'add a row, then remove it.'],
  },
  'derived-selectors': {
    mixed: ['mixed updates', 'the update mix of the original benchmark: mostly post scores, then new comments, then user roles.'],
    score: ['change a score', "change a post's score. The stats per category, which several components show, change too."],
    comment: ['add a comment', 'add a comment to a post. The stats per category change too.'],
    role: ['change a role', "change a user's role. Nothing on screen reads it, so the store variants do no work."],
  },
  'rapid-dispatch': {
    mixed: ['mixed dispatches', 'the mix of the original benchmark: synchronous bursts, bursts split by a timeout, and listener cascades.'],
    syncBurst: ['synchronous burst', 'five dispatches in a row, the last of which starts a listener cascade.'],
    thunkBurst: ['burst with a timeout', 'one dispatch now and two more in a timeout, timed as two steps.'],
    listenerCascade: ['listener cascade', 'one dispatch whose listeners dispatch four more, synchronously.'],
  },
  'many-components-same-slice': {
    increment: ['increment', 'increment a counter that every component on the page reads.'],
  },
  'deeptree-nested-hooks': {
    mixed: ['mixed clicks', "all five buttons, in the order the original benchmark's timers fire."],
    incrementRandom: ['update a random counter', 'increment one counter deep in the tree.'],
    incrementFifth: ['update a fifth of the counters', 'increment every fifth counter.'],
    incrementThird: ['update a third of the counters', 'increment every third counter.'],
    appendRandomCharacter: ['append a character', 'append a random character to one string.'],
    appendMany: ['append to many strings', 'append a character to every fourth string.'],
  },
  spike: {
    mixed: ['mixed updates', 'post scores and new comments, interleaved.'],
    score: ['change a score', "change a post's score. The stats per category change too."],
    comment: ['add a comment', 'add a comment to a post. The stats per category change too.'],
    role: ['change a role', 'nothing reads this update, so the store variants do no work.'],
  },
};
// One line on how each variant is written (the header comment of its app).
// Per-suite entries override the shared ones.
const RESULTS_NOTES = {
  '*': {
    store: 'a store per row, plus small shared stores',
    'store-single': 'one store, no selectors',
    context: 'one provider with useReducer',
    'context-split': 'a provider per slice, memoized rows',
    redux: 'Redux Toolkit, useSelector',
    zustand: 'one store, a selector per component',
    'zustand-granular': 'a store per row, like use(store)',
    'redux-plain': 'plain Redux, no Redux Toolkit or Immer',
    'redux-nofreeze': 'Redux Toolkit with auto-freeze off',
    'redux-deferred': 'Redux, the list reads useDeferredValue',
    'zustand-deferred': 'Zustand, the list reads useDeferredValue',
    'store-keyed': 'each row reads its own selected flag',
    'store-bailout': 'the same app, built with the bailout',
  },
  'derived-selectors': {
    store: 'a store per collection, every reader derives its stats',
    'store-derived': 'the stats computed in the update, in their own store',
    'store-memo': 'weakMemo shares the stats between readers',
    zustand: 'one store, selectors with useShallow',
  },
  spike: {
    store: 'a store per collection, every reader derives its stats',
    'store-derived': 'the stats computed in the update, in their own store',
    'store-derived-lazy': 'the stats computed by the first reader after a change',
    'store-memo': 'weakMemo shares the stats between readers',
    'store-reselect': "reselect's weakMapMemoize shares the stats",
    'store-cache-gen': 'a render cache that keeps two generations',
    'store-cache-render': 'a render cache cleared every commit',
    'store-compiled': "the compiler's output, checked in",
    'store-compiled-shared': 'compiler output that shares memoized calls',
    'store-compiled-shared-site': 'the same, with a cache per call site',
    zustand: 'one store, selectors with useShallow',
  },
};
// The slowdown color: green at 1 (the fastest), through yellow, to red at
// HEAT_MAX and beyond, on a log scale, in HEAT_STEPS + 1 classes.
const HEAT_MAX = 2.5;
const HEAT_STEPS = 20;
function heatClass(s) {
  if (!(s >= 1)) return 'h0';
  return `h${Math.round(Math.min(1, Math.log(s) / Math.log(HEAT_MAX)) * HEAT_STEPS)}`;
}
// Decimals that give the row's fastest value three significant figures.
function rowDecimals(min) {
  return min > 0 ? Math.max(0, 2 - Math.floor(Math.log10(min))) : 3;
}
// A slowdown: two decimals, or one from 10 up, so columns stay narrow.
function slowText(s) {
  return s.toFixed(s >= 10 ? 1 : 2);
}
function geomean(xs) {
  return xs.length ? Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length) : null;
}
function throttleText(t) {
  return t === 1 ? 'no CPU slowdown' : `${t}× CPU slowdown`;
}
function sizeText(n) {
  return `${n.toLocaleString('en-US')} rows`;
}
const SETTING = {on: '+ compiler', off: 'no compiler', all: ''};
// A column: {id: "store+on", v, c, href}. c is the compiler setting, or
// "all" when the suite doesn't vary it.
function resultsCol(v, c, href) {
  return {id: c === 'all' ? v : `${v}+${c}`, v, c, href};
}
// A measured entry as a cell: {m, s, r} (mean, standard error, per-restart
// means), {noWork: true} when the median is 0 (below the timer: nothing
// rendered, as in an unread update), or null for no data.
function ciCell(e) {
  if (!e) return null;
  if (e.median === 0 || !(e.mean > 0)) return {noWork: true};
  return {m: e.mean, s: e.sem ?? null, r: e.restarts ?? null};
}
function appHref(file) {
  const rel = `fixtures/store-bench/src/${file}`;
  return fs.existsSync(path.join(repoRoot, rel)) ? `../../${rel}` : null;
}
function scenarioRows(suite, scenarios, rowsOf) {
  return scenarios.map(key => {
    const [name, what] = RESULTS_SCENARIOS[suite]?.[key] ?? [key, ''];
    return {key, name, what, rows: rowsOf(key)};
  });
}

// suite => {title, note, kind: "ci" | "range" | "value", unit, cols, groups:
// [{key, name, what, rows: [{label, scenario, size, throttle, cells}]}]}.
function resultsSpec(data, suite) {
  const S = data.series;
  const m = S.main;
  const lowOf = key => m.scenarios.find(s => s.key === key)?.lowSignal;
  const mainWhat = (key, what) => (lowOf(key) ? `${what} Low signal: ${lowOf(key)}.` : what);
  const both = (variants, hrefOf) => ['on', 'off'].flatMap(c => variants.map(v => resultsCol(v, c, hrefOf(v))));
  const mainHref = v => appHref(`apps/${v}.jsx`);
  if (suite === 'main' || suite === 'nobailout') {
    const nb = suite === 'nobailout' ? S.nobailout : null;
    if (suite === 'nobailout' && !nb) return null;
    const cols = nb
      ? [...nb.variants.map(v => resultsCol(v, 'on', mainHref(v))), resultsCol('store-bailout', 'on', mainHref('store'))]
      : both(m.variants, mainHref);
    const ns = nb ? nb.ns : m.ns;
    return {
      kind: 'ci',
      unit: 'ms',
      title: nb ? 'Without the same-element bailout: duration in milliseconds ± 95% confidence interval' : 'Duration in milliseconds ± 95% confidence interval',
      cols,
      groups: scenarioRows('main', m.scenarios.map(s => s.key).filter(k => !nb || nb.scenarios.some(x => x.key === k)), key =>
        ns.flatMap(n =>
          m.throttles.map(t => {
            const k = `${key}|${n}|${t}`;
            const cells = nb
              ? cols.map(c => ciCell(c.v === 'store-bailout' ? nb.cells[k]?.withBailout : nb.cells[k]?.variants[c.v]))
              : cols.map(c => ciCell(m.cells[k]?.variants[c.v]?.[c.c]));
            return {label: `${sizeText(n)}, ${throttleText(t)}`, scenario: key, size: n, throttle: t, cells};
          })
        )
      ).map(g => ({...g, what: mainWhat(g.key, g.what)})),
    };
  }
  if (suite === 'memory') {
    const rows = S.memory;
    const cols = both(m.variants, mainHref);
    const ns = [...new Set(rows.map(r => r.n))].sort((a, b) => a - b);
    const runs = [...new Set(rows.map(r => r.runs))];
    return {
      kind: 'range',
      unit: 'KB',
      title: 'Memory per row in kilobytes, median and range of the runs',
      note: `Heap growth after mounting the rows and a garbage collection, divided by the row count. Each cell is the median of ${runs.length === 1 ? `${runs[0]} runs` : 'its runs'} with their range below it, too few runs for a confidence interval.`,
      cols,
      groups: [
        {
          key: 'memory',
          name: 'mount rows',
          what: 'mount the list, then measure the heap.',
          rows: ns.map(n => ({
            label: `${sizeText(n)} mounted`,
            size: n,
            cells: cols.map(c => {
              const r = rows.find(x => x.n === n && x.variant === c.v && x.compiler === c.c);
              if (!r) return null;
              const runsKb = (r.bytesPerRowRuns ?? []).map(b => b / 1024);
              return {v: r.bytesPerRow / 1024, lo: runsKb.length > 1 ? Math.min(...runsKb) : null, hi: runsKb.length > 1 ? Math.max(...runsKb) : null};
            }),
          })),
        },
      ],
    };
  }
  if (suite === 'typing' || suite === 'typing-suite') {
    const rows = S.typing[suite === 'typing' ? 'main' : 'suite'] ?? [];
    if (rows.length === 0) return null;
    const variants = [...new Set(rows.map(r => r.variant))];
    const order = [...m.variants, 'redux-deferred', 'zustand-deferred'];
    variants.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const cols = both(variants, mainHref);
    const throttles = [...new Set(rows.map(r => r.throttle))].sort((a, b) => a - b);
    const metrics = [
      ['p50', 'key press to next frame, median', 'the time from a key press to the next frame, for the median key.'],
      ['p95', 'key press to next frame, p95', 'the same time for the slowest one in twenty keys.'],
      ['max', 'key press to next frame, slowest', 'the same time for the slowest key.'],
      ['settle', 'list caught up', 'the time from the first key until the list shows the rows for the full text, typing included.'],
    ];
    return {
      kind: 'range',
      unit: 'ms',
      title: suite === 'typing' ? 'Typing latency in milliseconds' : 'Typing latency with useDeferredValue, in milliseconds',
      note: "Typing into the filter while the list re-filters. The key press times are over every key of every run, and the small line is the range of the runs' own values, so a pooled value can sit just outside it. List caught up is the median of the runs. Too few runs for a confidence interval.",
      cols,
      groups: metrics.map(([k, name, what]) => ({
        key: k,
        name,
        what,
        rows: throttles.map(t => ({
          label: throttleText(t),
          throttle: t,
          cells: cols.map(c => {
            const r = rows.find(x => x.variant === c.v && x.compiler === c.c && x.throttle === t);
            if (!r) return null;
            const runs = r[`${k}Runs`] ?? [];
            return {v: r[k], lo: runs.length > 1 ? Math.min(...runs) : null, hi: runs.length > 1 ? Math.max(...runs) : null};
          }),
        })),
      })),
    };
  }
  if (suite === 'fairness5') {
    const f = S.fairness5;
    if (!f) return null;
    const cols = both(f.variants, mainHref);
    const scenarios = m.scenarios.map(s => s.key).filter(k => f.rows.some(r => r.scenario === k));
    return {
      kind: 'ci',
      unit: 'ms',
      title: 'Fairness: every Redux setup, duration in milliseconds ± 95% confidence interval, at 1,000 rows',
      cols,
      groups: scenarioRows('main', scenarios, key =>
        f.rows
          .filter(r => r.scenario === key)
          .sort((a, b) => a.throttle - b.throttle)
          .map(r => ({label: throttleText(r.throttle), scenario: key, throttle: r.throttle, cells: cols.map(c => ciCell(r.cells[c.v]?.[c.c]))}))
      ).map(g => ({...g, what: mainWhat(g.key, g.what)})),
    };
  }
  if (suite === 'sweeps') {
    const sw = S.sweeps;
    if (!sw) return null;
    const cols = sw.libraries.map(lib => resultsCol(lib, 'all', appHref(`apps/sweep-${lib}.jsx`)));
    const coverage = sw.configs.filter(c => /-w8$/.test(c.key));
    const widths = sw.configs.filter(c => /^c100-/.test(c.key) && c.key !== 'c100-w8');
    const configText = c => {
      const [, pct, w] = c.key.match(/^c(\d+)-w(\d+)$/);
      return `${pct === '0' ? 'no rows' : pct === '100' ? 'every row' : `${pct}% of rows`} compiled, ${w} props per row`;
    };
    return {
      kind: 'ci',
      unit: 'ms',
      title: 'Sweeps: duration in milliseconds ± 95% confidence interval, at 1,000 rows',
      note: 'The compiler setting is part of each row here: how many rows the compiler compiled, and how many props each row has.',
      cols,
      groups: sw.scenarios.map(key => {
        const [name, what] = RESULTS_SCENARIOS.main[key] ?? [key, ''];
        return {
          key,
          name,
          what,
          rows: [...coverage, ...widths].flatMap(c =>
            sw.throttles.map(t => ({
              label: `${configText(c)}, ${throttleText(t)}`,
              scenario: key,
              throttle: t,
              config: c.key,
              cells: cols.map(col => ciCell(sw.cells[`${key}|${t}|${c.key}`]?.libraries[col.v])),
            }))
          ),
        };
      }),
    };
  }
  if (suite === 'spike') {
    const sp = S.spike;
    if (!sp) return null;
    const order = ['store', 'store-memo', 'redux', 'zustand'];
    const variants = [...sp.variants].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
    const cols = variants.map(v => resultsCol(v, 'all', appHref(`redux-suite/derived-selectors/apps/${v}.jsx`)));
    return {
      kind: 'ci',
      unit: 'ms',
      title: 'Shared derived data: duration in milliseconds ± 95% confidence interval, with the compiler',
      note: 'The derived-selectors benchmark with more components reading each category. Every variant is compiled.',
      cols,
      notesSuite: 'spike',
      groups: scenarioRows('spike', sp.families, key =>
        sp.ks.flatMap(k =>
          sp.throttles.map(t => ({
            label: `${k} readers per category, ${throttleText(t)}`,
            scenario: key,
            throttle: t,
            cells: cols.map(c => ciCell(sp.cells[`${key}|${k}|${t}`]?.variants[c.v])),
          }))
        )
      ),
    };
  }
  const s = S.suites.find(x => x.suite === suite);
  if (s) {
    const isRedux = suite !== 'fairness';
    const cols = both(s.variants, v => appHref(isRedux ? `redux-suite/${suite}/apps/${v}.jsx` : `apps/${v}.jsx`));
    const scenarios = [...new Set(s.rows.map(r => r.scenario))];
    const tableName = isRedux ? suite : 'main';
    return {
      kind: 'ci',
      unit: 'ms',
      title: isRedux
        ? `${suite}, from the Redux benchmarks: duration in milliseconds ± 95% confidence interval`
        : 'Fairness controls: duration in milliseconds ± 95% confidence interval, at 1,000 rows',
      note: isRedux ? 'Ported from reduxjs/react-redux-benchmarks, with seeded data so every variant applies the same updates.' : undefined,
      cols,
      notesSuite: suite,
      groups: scenarioRows(tableName, isRedux ? scenarios : m.scenarios.map(x => x.key).filter(k => scenarios.includes(k)), key =>
        s.rows
          .filter(r => r.scenario === key)
          .sort((a, b) => a.throttle - b.throttle)
          .map(r => ({label: throttleText(r.throttle), scenario: key, throttle: r.throttle, cells: cols.map(c => ciCell(r.cells[c.v]?.[c.c]))}))
      ),
    };
  }
  return null;
}

// Pages can show a subset: {"columns": ["store", "context+off"], "rows":
// {"scenarios": [...], "throttle": [...], "sizes": [...]}}. A column id
// without "+on" or "+off" picks the variant at both settings.
function filterSpec(spec, args) {
  let {cols, groups} = spec;
  let keep = cols.map((c, j) => j);
  if (args.columns) {
    keep = keep.filter(j => args.columns.includes(cols[j].id) || args.columns.includes(cols[j].v));
  }
  const want = args.rows ?? {};
  const ok = r =>
    (!want.scenarios || want.scenarios.includes(r.scenario)) &&
    (!want.throttle || want.throttle.includes(r.throttle)) &&
    (!want.sizes || want.sizes.includes(r.size));
  groups = groups
    .map(g => ({...g, rows: g.rows.filter(ok).map(r => ({...r, cells: keep.map(j => r.cells[j])}))}))
    .filter(g => g.rows.length);
  return {...spec, cols: keep.map(j => cols[j]), groups};
}

function resultsTable(data, {args = {}} = {}) {
  const suite = args.suite ?? 'main';
  const base = resultsSpec(data, suite);
  if (!base) return card(`<p class="viz-empty">No pinned results for ${esc(suite)}.</p>`);
  const spec = filterSpec(base, args);
  const {cols, groups, kind} = spec;
  const ci = kind === 'ci';
  const notes = {...RESULTS_NOTES['*'], ...(RESULTS_NOTES[spec.notesSuite] ?? {})};
  const settings = [...new Set(cols.map(c => c.c))];
  const perSetting = settings.length > 1 || settings[0] !== 'all';
  // The slowdown basis: the fastest cell in the row with the same compiler
  // setting.
  const val = e => (e && !e.noWork ? (ci ? e.m : e.v) : null);
  const rows = groups.flatMap(g => g.rows);
  for (const r of rows) {
    r.min = {};
    for (const c of settings) {
      const vs = cols.map((col, j) => (col.c === c ? val(r.cells[j]) : null)).filter(v => v > 0);
      r.min[c] = vs.length ? Math.min(...vs) : null;
    }
    const mins = Object.values(r.min).filter(v => v > 0);
    r.dec = rowDecimals(mins.length ? Math.min(...mins) : 0);
  }
  const slow = (r, j) => (val(r.cells[j]) > 0 && r.min[cols[j].c] ? val(r.cells[j]) / r.min[cols[j].c] : null);
  const cellHtml = (r, j) => {
    const e = r.cells[j];
    if (!e) return '<td class="rt-none">–</td>';
    if (e.noWork) return '<td class="rt-none">no work</td>';
    const s = slow(r, j);
    let second = '';
    if (ci && e.s > 0) {
      // The interval to one significant figure, so it never shows as ±0.
      const w = 1.96 * e.s;
      second = `<small>±${w.toFixed(Math.max(0, -Math.floor(Math.log10(w))))}</small> `;
    } else if (!ci && e.lo !== null && e.lo !== undefined) {
      second = `<small class="rt-range">${e.lo.toFixed(r.dec)}–${e.hi.toFixed(r.dec)}</small>`;
    }
    return `<td class="${heatClass(s)}"><b>${val(e).toFixed(r.dec)}</b>${second}<i>(${slowText(s)})</i></td>`;
  };
  const gmRow = (subset, label) => {
    const cells = cols.map((c, j) => {
      const g = geomean(subset.map(r => slow(r, j)).filter(x => x !== null));
      return g === null ? '<td class="rt-none">–</td>' : `<td class="${heatClass(g)}"><b>${slowText(g)}</b></td>`;
    });
    return `<tr class="rt-gm"><th scope="row">${esc(label)}</th>${cells.join('')}</tr>`;
  };
  let ri = 0;
  const bodies = groups
    .map(g => `<tbody><tr class="rt-group"><th scope="rowgroup" colspan="${cols.length + 1}"><span><b>${esc(g.name)}</b>: ${esc(g.what)}</span></th></tr>${g.rows
      .map(r => {
        const i = ri++;
        return `<tr data-r="${i}"><th scope="row"><button type="button" class="rt-sort" data-r="${i}" aria-pressed="false"><b>${esc(g.name)}</b><span>${esc(r.label)}</span></button></th>${cols.map((c, j) => cellHtml(r, j)).join('')}</tr>`;
      })
      .join('')}</tbody>`)
    .join('');
  // The geometric means: every row, and when there's more than one size,
  // the 1,000-row rows without a CPU slowdown.
  const sizes = [...new Set(rows.map(r => r.size).filter(Boolean))];
  const n0 = sizes.includes(1000) ? 1000 : null;
  const sub = n0 ? rows.filter(r => r.size === n0 && r.throttle === 1) : [];
  const foot =
    rows.length > 1
      ? `<tbody class="rt-foot">${gmRow(rows, 'geometric mean of slowdowns, every row')}${sizes.length > 1 && sub.length > 1 ? gmRow(sub, `geometric mean of slowdowns, ${sizeText(n0)}, ${throttleText(1)}`) : ''}</tbody>`
      : '';
  const runs = settings.map(c => [c, cols.filter(col => col.c === c).length]);
  const groupRow = perSetting && settings.length > 1 ? `<tr class="rt-colgroups">${runs.map(([c, n]) => `<th scope="colgroup" colspan="${n}">${c === 'on' ? 'With the React Compiler' : 'Without the compiler'}</th>`).join('')}</tr>` : '';
  const headRows = (groupRow ? 1 : 0) + 3;
  const name = c => LIB.name(c.v === 'store-bailout' ? 'store' : c.v);
  const sub2 = c => (c.v === 'store-bailout' ? 'with the bailout' : SETTING[c.c]);
  const corner = `<th scope="col" class="rt-corner" rowspan="${headRows}">implementation</th>`;
  const thead = `<thead>${groupRow ? groupRow.replace('<tr class="rt-colgroups">', `<tr class="rt-colgroups">${corner}`) : ''}<tr class="rt-names">${groupRow ? '' : corner}${cols
    .map((c, j) => `<th scope="col" data-c="${j}">${codeify(esc(name(c)))}${sub2(c) ? `<small>${esc(sub2(c))}</small>` : ''}</th>`)
    .join('')}</tr><tr class="rt-notes">${cols.map((c, j) => `<td data-c="${j}">${codeify(esc(notes[c.v] ?? ''))}</td>`).join('')}</tr><tr class="rt-tools">${cols
    .map(
      (c, j) =>
        `<td data-c="${j}">${c.href ? `<a href="${c.href}">code</a>` : ''}${ci ? `<button type="button" class="rt-cmp" data-c="${j}" aria-pressed="false" aria-label="Compare every column with ${esc(`${name(c)} ${sub2(c)}`.trim())}">compare</button>` : ''}</td>`
    )
    .join('')}</tr></thead>`;
  // What the browser needs to sort and compare: column names, the restart
  // keys, and per cell [e, mean, standard error, per-restart means by key],
  // the numbers as integers times 10^e (six significant figures of the
  // mean), which keeps the page small without losing precision.
  const rk = [...new Set(rows.flatMap(r => r.cells.flatMap(e => (e?.r ? Object.keys(e.r) : []))))].sort();
  const enc = e => {
    const x = Math.floor(Math.log10(e.m)) - 5;
    const q = v => (v === null || v === undefined ? null : Math.round(v / 10 ** x));
    return [x, q(e.m), q(e.s), e.r ? rk.map(k => q(e.r[k])) : null];
  };
  const json = {
    cols: cols.map(c => `${name(c)} ${sub2(c)}`.trim()),
    rk,
    rows: rows.map(r => r.cells.map(e => (e && !e.noWork ? (ci ? enc(e) : [0, val(e)]) : null))),
  };
  const ticks = [
    [1, '1.0'],
    [1.25, '1.25'],
    [1.6, '1.6'],
    [2, '2.0'],
    [HEAT_MAX, `${HEAT_MAX}+`],
  ];
  const basis = perSetting ? 'fastest with the same compiler setting' : 'fastest in the row';
  const scale = `<div class="rt-scale"><span>slowdown</span><span class="rt-bar" aria-hidden="true">${ticks
    .map(([t, label]) => `<i style="left:${((Math.log(t) / Math.log(HEAT_MAX)) * 100).toFixed(1)}%">${label}</i>`)
    .join('')}</span><span>1.0 is the ${basis}. Color follows the slowdown number in each cell.</span></div>`;
  const measure = suite === 'memory' ? 'Memory' : suite.startsWith('typing') ? 'Latency' : 'Duration';
  const title = args.title ?? `${spec.title} (Slowdown = ${measure.toLowerCase()} / ${basis})`;
  const how = [
    spec.note,
    args.note,
    'Lower is better. Click a benchmark name to sort the columns by it, and again to reset.',
    ci ? 'Press compare under a column to test every other column against it.' : '',
    cols.length > 8 ? 'Scroll sideways to see every implementation.' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const cellText = ci ? 'mean, ± the 95% confidence interval, and the slowdown in parentheses' : 'the value, the range of the runs when there is one, and the slowdown in parentheses';
  return `${placeholderBanner(data)}<section class="viz viz-card rt" aria-label="${esc(title)}">
<h3 class="viz-title">${codeify(esc(title))}</h3>
<p class="viz-note">${codeify(esc(how))}</p>
${scale}
<p class="rt-cmp-legend" aria-live="polite" hidden></p>
<div class="rt-scroll" tabindex="0" role="region" aria-label="${esc(title)}, scrollable"><table class="rt-table"><caption class="viz-sr">${esc(title)}. Each cell: ${cellText}.</caption>${thead}${bodies}${foot}</table></div>
<script type="application/json" class="rt-data">${JSON.stringify(json).replace(/</g, '\\u003c')}</script>
</section>`;
}

// ---------------------------------------------------------------- tiles and grids

// One verdict as an icon and words: ✓ win, = tie, ✗ loss, – no work.
function verdictMark(v) {
  if (!v) return {cls: 'none', icon: '·', text: 'n/a'};
  if (v.noWork) return {cls: 'nowork', icon: '–', text: v.text};
  if (v.tie) return {cls: 'tie', icon: '=', text: v.split ? 'tie*' : 'tie'};
  return v.ratio < 1 ? {cls: 'win', icon: '✓', text: v.text} : {cls: 'loss', icon: '✗', text: v.text};
}

// A row of hero numbers. args: {keys, labels, hrefs?, subs?}. A key is either
// a tally base ("main.tally.selectors.all": shown as matchOrBeat/total, with
// the range below and a status from the losses) or any value key (shown as
// its display). subs[i] picks the sub-line: "range" (default for tallies),
// "split" (wins · ties · losses), a value key, or "" for none.
function statTiles(data, {args = {}} = {}) {
  const v = data.values;
  // {"tiles": [{label, value, of, note, href}]}: value (and of) are keys, shown
  // as "value/of"; note is a key or plain digit-free words.
  if (args.tiles) {
    const shown = k => {
      if (!v[k]) throw new Error(`stat-tiles: no key ${k}`);
      return esc(v[k].display);
    };
    const items = args.tiles.map(t => {
      const value = t.of ? `${shown(t.value)}/${shown(t.of)}` : shown(t.value);
      const note = t.note ? (v[t.note] ? esc(v[t.note].display) : esc(t.note)) : '';
      const body = `<p class="viz-tile-label">${codeify(esc(t.label ?? ''))}</p><p class="viz-tile-value">${value}</p>${note ? `<p class="viz-tile-sub">${codeify(note)}</p>` : ''}`;
      return `<li class="viz-tile">${t.href ? `<a href="${esc(t.href)}">${body}</a>` : body}</li>`;
    });
    return placeholderBanner(data) + `<div class="viz-tiles-wrap"><ul class="viz viz-tiles" role="list" data-n="${items.length}" style="--n:${items.length}">${items.join('')}</ul></div>`;
  }
  const keys = args.keys ?? [];
  const tiles = keys.map((key, i) => {
    if (args.labels?.[i] === undefined) throw new Error(`stat-tiles: no label for ${key}`);
    const label = esc(args.labels[i]);
    const isTally = v[`${key}.total`] && v[`${key}.matchOrBeat`];
    let value;
    let sub = '';
    let status = '';
    if (isTally) {
      value = `${esc(v[`${key}.matchOrBeat`].display)}/${esc(v[`${key}.total`].display)}`;
      const pick = args.subs?.[i] ?? 'range';
      const parts = [
        v[`${key}.wins`] && `${v[`${key}.wins`].display} faster`,
        v[`${key}.ties`] && `${v[`${key}.ties`].display} tie`,
        v[`${key}.losses`] && `${v[`${key}.losses`].display} slower`,
      ].filter(Boolean);
      sub = pick === 'range' ? esc(v[`${key}.range`]?.display ?? '') : pick === 'split' ? esc(parts.join(' · ')) : pick ? esc(v[pick]?.display ?? '') : '';
      const losses = v[`${key}.losses`]?.value;
      if (losses !== undefined) {
        status =
          losses === 0
            ? `<span class="viz-status good"><span class="icon" aria-hidden="true">✓</span>no losses</span>`
            : `<span class="viz-status serious"><span class="icon" aria-hidden="true">✗</span>${esc(v[`${key}.losses`].display)} slower</span>`;
      }
    } else {
      if (!v[key]) throw new Error(`stat-tiles: no key ${key} (or ${key}.total/.matchOrBeat)`);
      value = esc(v[key].display);
      const pick = args.subs?.[i];
      sub = pick ? esc(v[pick]?.display ?? '') : '';
    }
    const body = `<p class="viz-tile-label">${codeify(label)}</p><p class="viz-tile-value">${value}</p>${sub ? `<p class="viz-tile-sub">${codeify(sub)}</p>` : ''}${status}`;
    const href = args.hrefs?.[i];
    return `<li class="viz-tile">${href ? `<a href="${esc(href)}">${body}</a>` : body}</li>`;
  });
  return placeholderBanner(data) + `<div class="viz-tiles-wrap"><ul class="viz viz-tiles" role="list" data-n="${tiles.length}" style="--n:${tiles.length}">${tiles.join('')}</ul></div>`;
}

// Win / tie / loss for every scenario × size × throttle. args.comparison:
// "headline" (default: store + compiler vs the faster of Redux and Zustand),
// "granular", or "ctx-<off|on>-<vsContext|vsContextSplit>" (same setting).
function verdictGrid(data, {args = {}} = {}) {
  const d = data.series.main;
  const which = args.comparison ?? 'headline';
  const ctx = which.match(/^ctx-(off|on)-(vsContext|vsContextSplit)$/);
  if (ctx && !data.series.ctx) return card('<p class="viz-empty">No pinned Context results.</p>');
  const verdictOf = key =>
    ctx ? data.series.ctx.cells[key]?.verdicts[ctx[1]][ctx[2]] : which === 'granular' ? d.cells[key]?.granular : d.cells[key]?.verdict;
  const cols = d.ns.flatMap(n => d.throttles.map(t => [n, t]));
  let anySplit = false;
  const rows = d.scenarios.map(s => [
    scenarioTitle(s),
    ...cols.map(([n, t]) => {
      const m = verdictMark(verdictOf(`${s.key}|${n}|${t}`));
      if (m.text === 'tie*') anySplit = true;
      if (args.compact) {
        // Short: the icon and the ratio, with the direction in words for
        // screen readers.
        const short = m.text.replace(/ (faster|slower)$/, '');
        const word = m.cls === 'win' ? 'faster' : m.cls === 'loss' ? 'slower' : '';
        return `<span class="${m.cls}"><span class="icon" aria-hidden="true">${m.icon}</span>${esc(short)}${word ? `<span class="viz-sr"> ${word}</span>` : ''}</span>`;
      }
      return `<span class="${m.cls}"><span class="icon" aria-hidden="true">${m.icon}</span>${esc(m.text)}</span>`;
    }),
  ]);
  const what = ctx
    ? `use(store) vs ${ctx[2] === 'vsContext' ? 'one context' : 'a context per slice'}, both ${ctx[1] === 'on' ? 'with' : 'without'} the compiler`
    : which === 'granular'
      ? 'use(store) with the compiler vs the granular control'
      : `use(store) with the compiler vs ${d.headline}, each at its faster compiler setting`;
  return `<div class="viz viz-card viz-grid${args.compact ? ' viz-compact' : ''}">${placeholderBanner(data)}${table(
    ['scenario', ...cols.map(([n, t]) => `N=${n.toLocaleString('en-US')} · ${t}×`)],
    rows
  ).replace('<table class="viz-table">', '<table class="viz-table"><caption class="viz-caption" style="caption-side:bottom;text-align:left">' + codeify(esc(what)) + `. ✓ faster, = tie${anySplit ? ' (tie*: the restarts disagreed)' : ''}, ✗ slower. A difference counts only outside two standard errors and when every restart agrees.</caption>`)}</div>`;
}

export const generators = {
  'charts-assets': (data, {args = {}} = {}) => assets(args),
  'build-label': buildLabel,
  scoreboard,
  'scoreboard-controls': scoreboardControls,
  'main-chart': (d, o) => (isCompact(o) ? compactFigure(mainChart(d, o), ['scenario']) : mainChart(d, o)),
  'main-verdicts': mainVerdicts,
  'main-table': mainTable,
  'counts-table': countsTable,
  'suite-derived-selectors': (d, o) => suiteTable(d, 'derived-selectors', o),
  'suite-rapid-dispatch': (d, o) => suiteTable(d, 'rapid-dispatch', o),
  'suite-many-components-same-slice': (d, o) =>
    suiteTable(d, 'many-components-same-slice', o),
  'suite-deeptree-nested-hooks': (d, o) => suiteTable(d, 'deeptree-nested-hooks', o),
  'suite-fairness': (d, o) => suiteTable(d, 'fairness', o),
  'suite-fairness5': fairness5Table,
  'spike-chart': (d, o) => (isCompact(o) ? compactFigure(spikeChart(d, o), ['view']) : spikeChart(d, o)),
  'sweep-chart': (d, o) => (isCompact(o) ? compactFigure(sweepChart(d, o), ['scenario']) : sweepChart(d, o)),
  'typing-table': (d, o) => typingTable(d, 'main', o),
  'typing-suite-table': (d, o) => typingTable(d, 'suite', o),
  'memory-chart': (d, o) => (isCompact(o) ? compactFigure(memoryChart(d, o), []) : memoryChart(d, o)),
  'losses-table': lossesTable,
  'nobailout-table': nobailoutTable,
  'ctx-scoreboard': ctxScoreboard,
  'ctx-chart': (d, o) => (isCompact(o) ? compactFigure(ctxChart(d, o), ['scenario']) : ctxChart(d, o)),
  'ctx-compiler-gain': ctxCompilerGain,
  'ctx-counts': ctxCounts,
  'stat-tiles': statTiles,
  'verdict-grid': verdictGrid,
  'speedup-chart': speedupChart,
  'results-table': resultsTable,
};

export const generatorDocs = {
  'stat-tiles':
    'A row of 3–5 hero numbers. Args: {"keys": [...], "labels": [...], "hrefs": [...], "subs": [...]}. A tally base key (e.g. main.tally.selectors.all) shows matchOrBeat/total with its range (subs "range", the default) or "split" (faster · tie · slower), plus a status icon and words for its losses; any other key shows its display, with an optional sub-line key. Or {"tiles": [{"label", "value", "of", "note", "href"}]}: value and of are keys ("value/of"), note is a key or digit-free words. Needs charts-assets {"extras": true}.',
  'verdict-grid':
    'Win / tie / loss (icon and words) for every scenario × size × throttle. Args: {"comparison": "headline" | "granular" | "ctx-<off|on>-<vsContext|vsContextSplit>", "compact": true}. Needs charts-assets {"extras": true}.',
  'ctx-scoreboard':
    'Store vs Context at the same compiler setting: per scenario and overall, store vs one context and vs a context per slice, compiler off and on (ctx.tally.*).',
  'ctx-chart':
    'Interactive dot plot of use(store), one context and a context per slice in two panels (with and without the compiler, each on its own log axis), by scenario, rows and CPU, with the same-setting verdicts in the note and a table view. Args: {"title", "compact"}.',
  'results-table':
    'js-framework-benchmark style results. Args: {"suite": "main" | "nobailout" | "memory" | "typing" | "typing-suite" | "fairness5" | "fairness" | "derived-selectors" | "rapid-dispatch" | "many-components-same-slice" | "deeptree-nested-hooks" | "sweeps" | "spike", "columns": [variant ids, or "store+on" / "store+off" for one compiler setting], "rows": {"scenarios": [...], "throttle": [...], "sizes": [...]}, "title", "note"}. Implementations in columns (grouped by compiler setting), configurations in rows grouped by scenario with plain-language descriptions, each cell the mean ± 95% confidence interval (1.96 standard errors of the pooled samples; median and run range for memory and typing) and the slowdown against the fastest cell in its row with the same compiler setting, colored by slowdown (green to red, with a scale), geometric means of the slowdowns at the bottom. Click a row to sort the columns by it; compare under a column tests the others against it with the verdict rule (two standard errors and restart agreement where restart data exists). Needs charts-assets {"extras": true, "results": true}.',
  'speedup-chart':
    'use(store)\'s speedup in every configuration of one comparison: one row per scenario, one mark per size (lane) and CPU throttle (circle or diamond) on a symmetric log-ratio axis around parity, placed by the ratio of means the verdict uses, blue faster, red slower, hollow gray a tie under method.verdictRule, the scenario tally (matched or beaten) at the right, a tooltip with both means and medians and the restart agreement, and a table view. No controls. Args: {"comparison": "headline" | "granular" | "ctx-<off|on>-<vsContext|vsContextSplit>" | "nobailout", "title", "compact"}. Needs charts-assets {"extras": true} only in compact mode.',
  'ctx-compiler-gain':
    'What the compiler buys store, one context and a context per slice: with vs without it, per scenario and overall (ctx.tally.compilerGain.*).',
  'ctx-counts':
    'Counting build, one update: counted renders (method.countedComponents) and Row renders for store, one context and a context per slice, compiler off and on, per scenario.',
  'charts-assets':
    'The chart CSS and runtime (filters, tooltips). Put it once per page, in the `<head>`. {"extras": true} adds the styles for stat-tiles, verdict-grid and compact cards. Compact (card) mode, {"compact": true}, works on scoreboard, scoreboard-controls, main-chart, counts-table (also {"scenarios": [...]}, and in compact {"variants": [...]}: one row per scenario), scoreboard (also {"columns": [comparison ids]}), main-verdicts (compact is the verdict grid), ctx-counts, sweep-chart, spike-chart, the suite-* tables, suite-fairness5, nobailout-table, typing-table, typing-suite-table, memory-chart, losses-table, ctx-scoreboard, ctx-chart, ctx-compiler-gain, verdict-grid and speedup-chart. Compact charts are drawn about 584 wide (a half-width dashboard card), so their text renders at about 12px, and never grow past that.',
  'build-label':
    'The build provenance line (React version and sha, compiler hash, pin date), or a placeholder warning. G5 requires it on every page that cites numbers.',
  scoreboard:
    'Main suite scoreboard: store + compiler vs the faster of Redux/Zustand, and vs each library and context, per scenario and overall; the granular control in its own last column, never in the headline. Low-signal scenarios (structure) are marked.',
  'scoreboard-controls':
    'Main suite controls: store-single vs selectors, everything without the compiler, and store with vs without the compiler.',
  'main-chart':
    'Interactive dot plot of the main suite: every variant in two panels (with and without the compiler, each on its own log axis), median and middle half, filterable by scenario, rows and CPU, with the verdict in the note and a table view. Args: {"title", "compact"}.',
  'main-verdicts':
    'Main suite verdict grid: store + compiler vs the faster of Redux/Zustand for every scenario × size × CPU.',
  'main-table':
    'Main suite medians: one table per scenario, every variant and compiler setting × size × CPU.',
  'counts-table':
    'Work for one update in the counting build (compiled): counted renders (only the instrumented components, method.countedComponents), Row renders, selector calls.',
  'suite-derived-selectors':
    'Redux suite derived-selectors: medians and store / store-memo verdicts.',
  'suite-rapid-dispatch':
    'Redux suite rapid-dispatch: medians and the store verdict.',
  'suite-many-components-same-slice':
    'Redux suite many-components-same-slice: medians and the store verdict.',
  'suite-deeptree-nested-hooks':
    'Redux suite deeptree-nested-hooks: medians and the store verdict.',
  'suite-fairness':
    'Fairness controls (redux-plain, redux-nofreeze) at N=1,000: medians, and each control vs redux (suite.fairness.control.*).',
  'suite-fairness5':
    'Fairness with every variant (set fairness5): medians, store + compiler vs the fastest Redux setup (redux, redux-plain, redux-nofreeze) and vs Zustand per configuration, with tallies (suite.fairness5.*).',
  'spike-chart':
    'Shared derived data spike: a slopegraph of ms per update vs readers per category (the pinned K values, spike.ks; K=spike.defaultK is the derived-selectors suite) for use(store), weakMemo (store-memo) and Redux as the reference, for one update family (mixed by default), with a toggle to one panel per family. role (an unread update) and the other variants are only in the table view. CPU filter. Args: {"family", "title", "compact"}.',
  'sweep-chart':
    'Sweeps at N=1,000: use(store) and keyed selection (store-keyed) in color, Redux and Zustand in gray, on a linear axis from zero, by compiler coverage (placed by the share compiled) or props per row. Selection by default, entity behind the scenario filter. CPU filter, table view with verdicts. Args: {"title", "compact"}.',
  'typing-table':
    'Typing latency in the main app (p50, p95, max, and when the list caught up with the input) per variant and CPU.',
  'typing-suite-table':
    'Typing latency with the useDeferredValue variants of Redux and Zustand.',
  'memory-chart':
    'Bytes per row after mount (bars, compiler on), filterable by rows, with mount time in the tooltip and a table view. Args: {"title", "compact"}.',
  'nobailout-table':
    'Without the same-element bailout (react-builds/head-nobailout): the tally vs the headline opponents next to the head build, main-suite medians, store vs the headline opponents and vs the granular control, and what the bailout buys store (bailoutGain); plus the sweeps when pinned. Separate from the headline.',
  'losses-table':
    "Where it doesn't win: every comparison the store side loses under the verdict rule (method.verdictRule), by area (main vs the headline opponents, main vs the granular control, suites, sweeps, spike), each with the counting build's counted renders, selector calls and derivations for both sides.",
};

// ---------------------------------------------------------------- assets

const CSS = `
.viz{--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--border:rgba(11,11,11,.10);--series-1:#2a78d6;--series-2:#eb6834;--pos:#2a78d6;--neg:#e34948;--tie:#898781;color-scheme:light;color:var(--text-primary);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz{--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--series-1:#3987e5;--series-2:#d95926;--pos:#3987e5;--neg:#e66767;--tie:#c3c2b7;color-scheme:dark}}
:root[data-theme="dark"] .viz{--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--series-1:#3987e5;--series-2:#d95926;--pos:#3987e5;--neg:#e66767;--tie:#c3c2b7;color-scheme:dark}
figure.viz,.viz-card{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin:16px 0;position:relative}
.viz-title{font-weight:600;margin:0 0 8px}
.viz-controls{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 8px}
.viz-controls label{color:var(--text-secondary);font-size:13px}
.viz-controls select{font:inherit;color:var(--text-primary);background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:2px 6px;margin-left:4px}
.viz-note,.viz-caption{color:var(--text-secondary);font-size:13px;margin:6px 0}
.viz-legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--text-secondary);font-size:12px;margin:4px 0}
.viz-legend span{display:inline-flex;align-items:center;gap:4px}
.viz-svg{width:100%;height:auto;display:block;overflow:visible}
.viz-svg text{font:12px system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
.viz .grid{stroke:var(--grid);stroke-width:1}
.viz .baseline{stroke:var(--axis);stroke-width:1}
.viz .axis{fill:var(--muted)}
.viz .label{fill:var(--text-secondary)}
.viz .label.emph{fill:var(--text-primary);font-weight:600}
.viz .ptitle{fill:var(--text-primary);font-weight:600}
.viz .value,.viz .endlabel{fill:var(--text-secondary)}
.viz .leader{stroke:var(--muted);stroke-width:1}
.viz .s1{--c:var(--series-1)}.viz .s2{--c:var(--series-2)}.viz .muted{--c:var(--muted)}
.viz .pos{--c:var(--pos)}.viz .neg{--c:var(--neg)}.viz .tie{--c:var(--tie)}.viz .key{--c:var(--text-secondary)}
.viz .parity{stroke:var(--text-secondary);stroke-width:1}
.viz .lane,.viz .lane text{font-size:10px}
.viz g.emph text{font-weight:600}
.viz-speedup .viz-table td+td,.viz-speedup .viz-table th+th{text-align:right}
.viz .endlabel.emph{fill:var(--text-primary);font-weight:600}
.viz .whisker{stroke:var(--c);stroke-width:2;stroke-linecap:round;opacity:.45}
.viz .dot-on{fill:var(--c);stroke:var(--surface-1);stroke-width:2}
.viz .dot-off{fill:var(--surface-1);stroke:var(--c);stroke-width:2}
.viz .line{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.viz g.muted .line{opacity:.55}
.viz .bar{fill:var(--c)}
.viz .hit,.viz .hits *{fill:transparent;cursor:default;outline:none}
.viz .hit:focus-visible,.viz .hits :focus-visible{stroke:var(--text-primary);stroke-width:1}
.viz .crosshair{stroke:var(--muted);stroke-width:1;pointer-events:none}
.viz-tip{position:absolute;z-index:5;pointer-events:none;background:var(--surface-1);border:1px solid var(--border);border-radius:8px;padding:6px 9px;box-shadow:0 2px 10px rgba(0,0,0,.12);font-size:12px;max-width:300px;white-space:pre-line}
.viz-tip b{display:block;font-size:13px;color:var(--text-primary)}
.viz-tip span{color:var(--text-secondary)}
.viz-tableview summary{cursor:pointer;color:var(--text-secondary);font-size:13px;margin-top:6px}
.viz-table{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.viz-table th,.viz-table td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
.viz-table th{color:var(--text-secondary);font-weight:600;font-size:12px}
.viz-table .r{text-align:right}
.viz-table tr.area th{padding-top:14px;color:var(--text-primary);font-size:13px;border-bottom:1px solid var(--axis)}
.viz-table tr.area th small{color:var(--text-secondary);font-weight:400;margin-left:6px}
.viz-table tr.reason td{color:var(--text-secondary);font-size:12px;padding-top:0}
.viz-table.losses tr:has(+ tr.reason) td{border-bottom:none}
.viz-table tr.total td{font-weight:600;border-top:1px solid var(--axis)}
.viz-table small,.viz .muted-text,.viz small.muted,.viz .muted:not(g){color:var(--text-secondary)}
.viz-placeholder{border:1px solid #d03b3b;color:#d03b3b;border-radius:8px;padding:6px 10px;margin:8px 0}
.viz-table.scoreboard td,.viz-table.scoreboard th{text-align:left;padding:6px 5px}
.viz-table.scoreboard .sb-parts{white-space:normal}
.viz .sb-count{display:block;font-weight:600;font-size:15px;color:var(--text-primary)}
.viz .sb-range{display:block}
.viz-scroll{overflow-x:auto}
.viz .sb-parts{display:block;color:var(--text-secondary);font-size:12px;white-space:nowrap}
.viz-build{color:var(--text-secondary,#52514e);font-size:13px}
.viz-build[data-build-status="placeholder"]{color:#d03b3b;font-weight:600}
.viz-h{margin:14px 0 4px}
.viz-empty{color:var(--text-secondary)}
@media (prefers-reduced-motion:reduce){.viz *{transition:none!important;animation:none!important}}
@media (forced-colors:active){.viz .dot-on,.viz .bar{fill:CanvasText}.viz .line,.viz .whisker,.viz .dot-off,.viz .parity{stroke:CanvasText}}
`;

// Tiles sit in one row while each gets at least TILE_MIN px, then wrap
// evenly: half the count per row (rounded up), then two, then one.
const TILE_MIN = 140;
const TILE_GAP = 12;
const fits = cols => cols * TILE_MIN + (cols - 1) * TILE_GAP;
const TILE_QUERIES = [2, 3, 4, 5, 6]
  .flatMap(n =>
    [...new Set([Math.ceil(n / 2), 2, 1])]
      .filter(cols => cols < n)
      .map(cols => `@container viz-tiles (max-width:${fits(cols + (cols === Math.ceil(n / 2) ? n - cols : 1)) - 1}px){.viz-tiles[data-n="${n}"]{grid-template-columns:repeat(${cols},minmax(0,1fr))}}`)
  )
  .join('\n');

// Stat tiles, the verdict grid and compact cards (charts-assets {"extras": true}).
// Status colors (palette.md): an icon carries the color, the words stay in
// text ink, so state never rests on color alone.
const EXTRA_CSS = `
.viz{--good:#006300;--serious:#b8461b}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz{--good:#0ca30c;--serious:#ec835a}}
:root[data-theme="dark"] .viz{--good:#0ca30c;--serious:#ec835a}
.viz-tiles-wrap{container:viz-tiles/inline-size;margin:16px 0}
.viz-tiles{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:12px;margin:0;padding:0}
${TILE_QUERIES}
.viz-tile{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.viz-tile a{color:inherit;text-decoration:none}
.viz-tile a:hover .viz-tile-label,.viz-tile a:focus-visible .viz-tile-label{text-decoration:underline}
.viz-tile-label{color:var(--text-secondary);font-size:13px;margin:0}
.viz-tile-value{color:var(--text-primary);font-size:32px;font-weight:600;line-height:1.15;margin:0;font-variant-numeric:proportional-nums}
.viz-tile-sub{color:var(--text-secondary);font-size:12px;margin:0}
.viz-status{display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);font-size:12px}
.viz-status .icon{font-weight:700}
.viz-status.good .icon{color:var(--good)}
.viz-status.serious .icon{color:var(--serious)}
.viz-status.neutral .icon{color:var(--muted)}
.viz-grid .viz-table td,.viz-grid .viz-table th{text-align:left;white-space:nowrap}
.viz-grid.viz-compact .viz-table th,.viz-grid.viz-compact .viz-table td:first-child{white-space:normal}
.viz-grid.viz-compact .viz-table{font-size:12px}
.viz-grid .viz-table caption.viz-caption{white-space:normal}
.viz-grid .icon{font-weight:700;margin-right:3px}
.viz-grid .win .icon{color:var(--good)}
.viz-grid .loss .icon{color:var(--serious)}
.viz-grid .tie .icon,.viz-grid .nowork .icon{color:var(--muted)}
.viz-compact{padding:10px 12px;margin:10px 0}
.viz-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.viz-compact .viz-caption{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.viz-compact .viz-table th,.viz-compact .viz-table td{padding:4px 5px}
@media (forced-colors:active){.viz-status .icon,.viz-grid .icon{color:CanvasText}}
`;

function runtime() {
  const lib = `{${Object.values(LIB)
    .map(f => f.toString())
    .join(',\n')}}`;
  return `(function () {
  var LIB = ${lib};
  var VIEWS = ${JSON.stringify(VIEWS)};
  function tooltips(fig) {
    var tip = fig.querySelector('.viz-tip');
    var plot = fig.querySelector('.viz-plot');
    function show(el, clientX, clientY) {
      tip.textContent = '';
      var value = el.getAttribute('data-tip-value');
      var label = el.getAttribute('data-tip-label');
      var extra = el.getAttribute('data-tip-extra');
      var row = el.getAttribute('data-i');
      if (row !== null) {
        // A row of the table view: its first cell is the label, the .tip-v
        // cell the value, and the other cells the lines below.
        var tr = fig.querySelectorAll('.viz-tablebody tbody tr')[Number(row)];
        var th = fig.querySelectorAll('.viz-tablebody thead th');
        var lines = [];
        if (tr) tr.querySelectorAll('td').forEach(function (td, i) {
          if (i === 0) label = td.textContent;
          else if (td.classList.contains('tip-v')) value = td.textContent;
          else if (th[i]) lines.push(th[i].textContent + ': ' + td.textContent);
        });
        extra = lines.join('\\n');
      }
      var b = document.createElement('b');
      b.textContent = value;
      var s = document.createElement('span');
      s.textContent = label;
      tip.appendChild(b);
      tip.appendChild(s);
      if (extra) {
        var e = document.createElement('span');
        e.textContent = '\\n' + extra;
        tip.appendChild(e);
      }
      tip.hidden = false;
      var box = fig.getBoundingClientRect();
      var r = el.getBoundingClientRect();
      var x = (clientX == null ? r.left + r.width / 2 : clientX) - box.left;
      var y = (clientY == null ? r.top : clientY) - box.top;
      var left = Math.min(Math.max(8, x + 14), box.width - tip.offsetWidth - 8);
      tip.style.left = left + 'px';
      var above = y - tip.offsetHeight - 12;
      tip.style.top = (above >= 8 ? above : y + 18) + 'px';
      var cross = plot.querySelector('.crosshair');
      if (cross) {
        if (el.hasAttribute('data-x')) {
          cross.setAttribute('x1', el.getAttribute('data-x'));
          cross.setAttribute('x2', el.getAttribute('data-x'));
          cross.setAttribute('y1', el.getAttribute('data-y1'));
          cross.setAttribute('y2', el.getAttribute('data-y2'));
          cross.setAttribute('visibility', 'visible');
        } else {
          cross.setAttribute('visibility', 'hidden');
        }
      }
    }
    function hide() {
      tip.hidden = true;
      var cross = plot.querySelector('.crosshair');
      if (cross) cross.setAttribute('visibility', 'hidden');
    }
    plot.addEventListener('pointermove', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-tip-value],[data-i]');
      if (el) show(el, ev.clientX, ev.clientY);
      else hide();
    });
    plot.addEventListener('pointerleave', hide);
    plot.addEventListener('focusin', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-tip-value],[data-i]');
      if (el) show(el);
    });
    plot.addEventListener('focusout', hide);
  }
  function setup(fig) {
    var data = JSON.parse(fig.querySelector('script.viz-data').textContent);
    var state = JSON.parse(fig.getAttribute('data-state'));
    var view = LIB[VIEWS[fig.getAttribute('data-viz')]];
    fig.querySelectorAll('[data-control]').forEach(function (el) {
      el.addEventListener('change', function () {
        var key = el.getAttribute('data-control');
        state[key] = typeof state[key] === 'number' ? Number(el.value) : el.value;
        var out = view(data, state);
        fig.querySelector('.viz-plot').innerHTML = out.plot;
        fig.querySelector('.viz-tablebody').innerHTML = out.table;
        fig.querySelector('.viz-note').innerHTML = out.note;
      });
    });
    tooltips(fig);
  }
  function init() {
    document.querySelectorAll('figure.viz[data-viz]').forEach(setup);
    document.querySelectorAll('.viz-card').forEach(function (card) {
      if (card.querySelector('[data-tip-value],[data-i]')) tooltips(card);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();`;
}

// The results table's slowdown colors: OKLCH stops (green, yellow, red),
// lighter to darker in light mode and darker to lighter in dark mode so the
// order also reads in lightness, interpolated into HEAT_STEPS + 1 classes.
// Cell text is the primary ink, which stays readable on every step.
const HEAT_STOPS = {
  light: [[0.93, 0.07, 145], [0.87, 0.1, 90], [0.77, 0.11, 25]],
  dark: [[0.31, 0.06, 150], [0.39, 0.07, 80], [0.47, 0.1, 25]],
};
function oklchHex(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const gamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255).toString(16).padStart(2, '0')).join('');
}
function heatColors(mode) {
  const [g, y, r] = HEAT_STOPS[mode];
  const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  return Array.from({length: HEAT_STEPS + 1}, (_, i) => {
    const t = i / HEAT_STEPS;
    return oklchHex(...(t < 0.5 ? lerp(g, y, t * 2) : lerp(y, r, (t - 0.5) * 2)));
  });
}
function heatRules(mode, scope) {
  const cs = heatColors(mode);
  return `${cs.map((c, i) => `${scope} .h${i}{background:${c}}`).join('')}${scope} .rt-bar{background:linear-gradient(90deg,${cs.join(',')})}${scope} .rt-faster{background:${cs[0]}}${scope} .rt-slower{background:${cs[HEAT_STEPS]}}`;
}
const RESULTS_CSS = `
.rt{--rt-tie:#ecebe7;--rt-head:#f4f3f0}
${heatRules('light', '.rt')}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .rt{--rt-tie:#2c2c2a;--rt-head:#222221}${heatRules('dark', ':root:where(:not([data-theme="light"])) .rt')}}
:root[data-theme="dark"] .rt{--rt-tie:#2c2c2a;--rt-head:#222221}${heatRules('dark', ':root[data-theme="dark"] .rt')}
.rt-scroll{border:1px solid var(--grid);border-radius:8px;margin-top:8px}
.rt-scroll.rt-wide{overflow-x:auto}
.rt-table tr.rt-rep th{background:var(--rt-head);position:static;text-align:center;font-weight:600;white-space:normal}
.rt-table tr.rt-rep small{display:block;font-weight:400;color:var(--text-secondary)}
.rt-table{border-collapse:separate;border-spacing:0;font-size:12px;line-height:1.35;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.rt-table th,.rt-table td{padding:5px 6px;border-right:1px solid var(--grid);border-bottom:1px solid var(--grid);text-align:right;vertical-align:top;white-space:nowrap}
.rt-table thead th,.rt-table thead td{background:var(--rt-head);text-align:center;position:sticky;z-index:2}
.rt-table thead tr > *{top:var(--rt-top,0)}
.rt-table th[scope=colgroup]{font-weight:600}
.rt-table .rt-names th{font-weight:600;width:68px;white-space:normal}
.rt-table .rt-names small{display:block;font-weight:400;color:var(--text-secondary)}
.rt-table .rt-notes td{white-space:normal;width:68px;font-size:11px;color:var(--text-secondary)}
.rt-table .rt-tools a{display:block;margin-bottom:3px}
.rt-table tbody th[scope=row],.rt-table .rt-corner{position:sticky;left:0;z-index:1;background:var(--surface-1);text-align:left}
.rt-table .rt-corner{z-index:3;background:var(--rt-head);vertical-align:bottom;color:var(--text-secondary);font-weight:600}
.rt-table td b{font-weight:600;display:block}
.rt-table td small{font-size:10.5px;display:block}
.rt-table td i{font-style:normal;white-space:nowrap;display:block}
.rt-table .rt-range{display:block}
.rt-table .rt-group th{text-align:left;background:var(--surface-1);font-weight:400;padding-top:12px;white-space:normal}
.rt-table .rt-group th > span{position:sticky;left:9px;display:inline-block;max-width:760px}
.rt-table .rt-gm th{font-weight:600;white-space:normal}
.rt-table tbody th[scope=row]{white-space:normal;min-width:140px;max-width:170px}
.rt-table .rt-foot tr:first-child > *{border-top:2px solid var(--axis)}
.rt-table .rt-none{color:var(--text-secondary)}
.rt button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}
.rt .rt-sort{display:block}
.rt .rt-sort b{display:block;font-weight:600}
.rt .rt-sort span{color:var(--text-secondary)}
.rt .rt-sort[aria-pressed=true] b{text-decoration:underline}
.rt .rt-cmp{border:1px solid var(--border);border-radius:5px;padding:1px 6px;font-size:11.5px;color:var(--text-secondary)}
.rt .rt-cmp[aria-pressed=true]{background:var(--text-primary);color:var(--surface-1)}
.rt button:focus-visible,.rt a:focus-visible,.rt-scroll:focus-visible{outline:2px solid var(--series-1);outline-offset:1px}
.rt.rt-sorted .rt-colgroups th[scope=colgroup]{visibility:hidden}
.rt .rt-same{background:var(--rt-tie)}
.rt .rt-base{box-shadow:inset 0 0 0 2px var(--text-primary)}
.rt-scale{display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px;color:var(--text-secondary);margin:6px 0 4px}
.rt .rt-bar{position:relative;display:inline-block;width:220px;height:12px;border-radius:3px;margin-bottom:14px}
.rt .rt-bar i{position:absolute;top:13px;transform:translateX(-50%);font-style:normal;font-size:11px;color:var(--text-secondary)}
.rt .rt-bar i:first-child{transform:none}.rt .rt-bar i:last-child{transform:translateX(-100%)}
.rt-cmp-legend{font-size:12.5px;margin:6px 0}
.rt-cmp-legend button{text-decoration:underline}
@media (forced-colors:active){.rt-table td{forced-color-adjust:auto}}
`;

// The results table's sorting and compare mode. Plain browser code.
function resultsRuntime() {
  return `(function () {
  // Per-restart means are arrays by restart key, paired where both have one.
  function restartsAgree(a, b) {
    if (!a || !b) return null;
    var signs = {};
    var paired = 0;
    for (var i = 0; i < a.length; i++) {
      if (a[i] === null || b[i] === null) continue;
      paired++;
      signs[Math.sign(a[i] - b[i])] = true;
    }
    if (paired === 0) return null;
    var list = Object.keys(signs);
    return list.length === 1 && list[0] !== '0';
  }
  function setup(root) {
    var data = JSON.parse(root.querySelector('script.rt-data').textContent);
    // Cells arrive as [e, mean, sem, restarts] in integers times 10^e.
    data.rows = data.rows.map(function (row) {
      return row.map(function (c) {
        if (!c) return null;
        var f = Math.pow(10, c[0]);
        var q = function (v) { return v === null || v === undefined ? null : v * f; };
        return [q(c[1]), q(c[2]), c[3] ? c[3].map(q) : null];
      });
    });
    var table = root.querySelector('table');
    var legend = root.querySelector('.rt-cmp-legend');
    var n = data.cols.length;
    // Body cells carry their column index from here on, so sorting can move
    // them.
    table.querySelectorAll('tbody tr').forEach(function (tr) {
      var tds = tr.querySelectorAll(':scope > td');
      if (tds.length === n) tds.forEach(function (td, j) { td.setAttribute('data-c', j); });
    });
    var sortRow = null;
    var base = null;
    function rows() { return table.querySelectorAll('tbody tr[data-r]'); }
    function order(ix) {
      table.querySelectorAll('tr').forEach(function (tr) {
        var cells = Array.prototype.slice.call(tr.querySelectorAll(':scope > [data-c]'));
        if (cells.length !== n) return;
        var byCol = [];
        cells.forEach(function (td) { byCol[Number(td.getAttribute('data-c'))] = td; });
        ix.forEach(function (j) { tr.appendChild(byCol[j]); });
      });
    }
    function sortBy(r) {
      var ix = [];
      for (var j = 0; j < n; j++) ix.push(j);
      if (r !== null) {
        var cells = data.rows[r];
        ix.sort(function (a, b) {
          var x = cells[a] ? cells[a][0] : Infinity;
          var y = cells[b] ? cells[b][0] : Infinity;
          return x - y || a - b;
        });
      }
      order(ix);
      root.classList.toggle('rt-sorted', r !== null);
      root.querySelectorAll('.rt-sort').forEach(function (b) {
        b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-r')) === r));
      });
      sortRow = r;
    }
    function remember(td) {
      if (!td.hasAttribute('data-h')) {
        td.setAttribute('data-h', td.className);
        var s = td.querySelector('i');
        if (s) td.setAttribute('data-s', s.textContent);
      }
    }
    function restore(td) {
      if (!td.hasAttribute('data-h')) return;
      td.className = td.getAttribute('data-h');
      var s = td.querySelector('i');
      if (s) s.textContent = td.getAttribute('data-s');
    }
    function compare(j) {
      var anyRestarts = false;
      var allRestarts = true;
      rows().forEach(function (tr) {
        var r = data.rows[Number(tr.getAttribute('data-r'))];
        var b = r[j];
        tr.querySelectorAll('td[data-c]').forEach(function (td) {
          var k = Number(td.getAttribute('data-c'));
          var a = r[k];
          if (!a) return;
          remember(td);
          var s = td.querySelector('i');
          if (j === null) return restore(td);
          if (k === j) {
            td.className = 'rt-base';
            s.textContent = '(baseline)';
            return;
          }
          if (!b) { td.className = 'rt-same'; s.textContent = '(n/a)'; return; }
          var outside = Math.abs(a[0] - b[0]) > 2 * Math.sqrt((a[1] || 0) * (a[1] || 0) + (b[1] || 0) * (b[1] || 0));
          var agree = restartsAgree(a[2], b[2]);
          if (agree === null) allRestarts = false; else anyRestarts = true;
          var sig = outside && agree !== false;
          var word = !sig ? 'tie' : a[0] < b[0] ? 'faster' : 'slower';
          td.className = word === 'tie' ? 'rt-same' : word === 'faster' ? 'rt-faster' : 'rt-slower';
          s.textContent = '(' + (a[0] / b[0]).toFixed(2) + ', ' + word + ')';
        });
      });
      table.querySelectorAll('.rt-gm td[data-c]').forEach(function (td) {
        remember(td);
        if (j === null) return restore(td);
        td.className = 'rt-same';
      });
      root.querySelectorAll('.rt-cmp').forEach(function (b) {
        b.setAttribute('aria-pressed', String(Number(b.getAttribute('data-c')) === j));
      });
      base = j;
      root.classList.toggle('rt-comparing', j !== null);
      if (j === null) {
        legend.hidden = true;
        legend.textContent = '';
        return;
      }
      legend.textContent = '';
      var text = document.createElement('span');
      text.textContent =
        'Compared with ' + data.cols[j] + ' (outlined). Green: faster, red: slower, gray: a tie. In parentheses: the ratio to the baseline. A difference counts when it is outside two standard errors' +
        (allRestarts ? ' and every restart agrees on its direction (the verdict rule). ' : anyRestarts ? ' and every restart agrees where restart data exists (the two-standard-error test alone elsewhere). ' : '. There is no restart data here, so this is the two-standard-error test alone. ') +
        'The geometric means are uncolored in this mode. ';
      var reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'rt-reset';
      reset.textContent = 'Reset to slowdown colors';
      legend.appendChild(text);
      legend.appendChild(reset);
      legend.hidden = false;
    }
    root.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.classList.contains('rt-sort')) {
        var r = Number(b.getAttribute('data-r'));
        sortBy(sortRow === r ? null : r);
      } else if (b.classList.contains('rt-cmp')) {
        var c = Number(b.getAttribute('data-c'));
        compare(base === c ? null : c);
      } else if (b.classList.contains('rt-reset')) {
        compare(null);
      }
      layout();
    });
    layout();
    window.addEventListener('resize', layout);
    // The table takes its full height in the page. When it fits its column,
    // the header rows stick to the top of the window as the page scrolls.
    // When it's wider, it scrolls sideways in its own box (the first column
    // stays put), which ends page-level sticky, so the column names repeat
    // under each scenario heading instead. Run again whenever sorting or
    // compare changes the widths.
    function layout() {
      var box = table.parentElement;
      box.classList.remove('rt-wide');
      var wide = table.scrollWidth > box.clientWidth + 1;
      box.classList.toggle('rt-wide', wide);
      table.querySelectorAll('tr.rt-rep').forEach(function (tr) { tr.remove(); });
      if (wide) {
        var names = table.querySelector('thead tr.rt-names');
        table.querySelectorAll('tbody tr.rt-group').forEach(function (g) {
          var rep = document.createElement('tr');
          rep.className = 'rt-rep';
          rep.setAttribute('aria-hidden', 'true');
          var corner = document.createElement('th');
          corner.className = 'rt-corner';
          rep.appendChild(corner);
          names.querySelectorAll(':scope > th[data-c]').forEach(function (th) {
            var c = th.cloneNode(true);
            c.removeAttribute('scope');
            rep.appendChild(c);
          });
          g.after(rep);
        });
      }
      measure();
    }
    // Sticky header rows stack at their measured heights.
    function measure() {
      var top = 0;
      table.querySelectorAll('thead tr').forEach(function (tr) {
        tr.style.setProperty('--rt-top', top + 'px');
        top += tr.getBoundingClientRect().height;
      });
    }
  }
  function init() { document.querySelectorAll('.rt').forEach(function (root) { if (root.querySelector('script.rt-data')) setup(root); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();`;
}

// {"extras": true} adds the styles for stat tiles, the verdict grid and
// compact cards. Off by default, so pages that don't use them keep the same
// bytes.
function assets({extras = false, results = false} = {}) {
  return `<style>${CSS}${extras ? EXTRA_CSS : ''}${results ? RESULTS_CSS : ''}</style>\n<script>${runtime()}</script>${results ? `\n<script>${resultsRuntime()}</script>` : ''}`;
}
