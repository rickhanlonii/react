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
  // Entity colors: the same library keeps its slot in every chart.
  color(name) {
    if (name === 'store') return 's1';
    if (name === 'redux') return 's2';
    if (name === 'zustand') return 's3';
    if (name === 'store-memo' || name === 'store-keyed') return 's4';
    return 'muted';
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

  // A dot plot on a log scale: one row per variant, compiler on (filled) and
  // off (ring) with their interquartile range.
  dots(rows, axisLabel) {
    const W = 640;
    const left = 150;
    const right = 24;
    const top = 10;
    const rowH = 34;
    const bottom = 44;
    const H = top + rows.length * rowH + bottom;
    const all = rows.flatMap(r =>
      [r.on, r.off].filter(Boolean).flatMap(e => [e.p25, e.median, e.p75])
    );
    const [lo, hi] = LIB.logDomain(all);
    const span = Math.log10(hi) - Math.log10(lo) || 1;
    const x = v =>
      left +
      ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / span) *
        (W - left - right);
    let svg = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LIB.esc(axisLabel)}">`;
    for (const t of LIB.logTicks(lo, hi)) {
      svg += `<line class="grid" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${top}" y2="${H - bottom}"/>`;
      svg += `<text class="axis" x="${x(t).toFixed(1)}" y="${H - bottom + 16}" text-anchor="middle">${LIB.tick(t)}</text>`;
    }
    svg += `<line class="baseline" x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}"/>`;
    svg += `<text class="axis" x="${left + (W - left - right) / 2}" y="${H - 6}" text-anchor="middle">${LIB.esc(axisLabel)}</text>`;
    rows.forEach((r, i) => {
      const cy = top + i * rowH + rowH / 2;
      svg += `<text class="label${r.emph ? ' emph' : ''}" x="${left - 10}" y="${cy + 4}" text-anchor="end">${LIB.esc(r.label)}</text>`;
      for (const [which, e, dy] of [
        ['on', r.on, -6],
        ['off', r.off, 6],
      ]) {
        if (!e) continue;
        const y = cy + dy;
        const cls = r.emph ? 's1' : 'muted';
        svg += `<g class="${cls}">`;
        svg += `<line class="whisker" x1="${x(e.p25).toFixed(1)}" x2="${x(e.p75).toFixed(1)}" y1="${y}" y2="${y}"/>`;
        svg += `<circle class="${which === 'on' ? 'dot-on' : 'dot-off'}" cx="${x(e.median).toFixed(1)}" cy="${y}" r="4.5"/>`;
        const label = `${r.label}, compiler ${which}`;
        const extra = `middle half ${LIB.ms(e.p25)}–${LIB.ms(e.p75)} ms · p95 ${LIB.ms(e.p95)} ms · ${LIB.int(e.count)} samples`;
        svg += `<circle class="hit" cx="${x(e.median).toFixed(1)}" cy="${y}" r="12"${LIB.tipAttrs(LIB.ms(e.median) + ' ms', label, extra)}/>`;
        svg += `</g>`;
      }
    });
    return svg + '</svg>';
  },

  // Small multiples of line charts over categorical x positions. Each panel
  // is {title, series: [{name, values}]}; series named in LIB.color get a
  // categorical slot and an end label, the rest are gray context.
  lines(panels, xs, {log, yLabel, xLabel}) {
    const cols = Math.min(panels.length, 2);
    const PW = 320;
    const PH = 220;
    const W = PW * cols;
    const rowsN = Math.ceil(panels.length / cols);
    const H = PH * rowsN;
    const left = 46;
    const right = 92;
    const top = 26;
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
    let svg = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LIB.esc(yLabel + ' by ' + xLabel)}">`;
    panels.forEach((p, pi) => {
      const ox = (pi % cols) * PW;
      const oy = Math.floor(pi / cols) * PH;
      const x = i =>
        ox +
        left +
        (xs.length === 1 ? 0 : (i / (xs.length - 1)) * (PW - left - right));
      const y = v =>
        oy +
        top +
        (PH - top - bottom) *
          (1 -
            (log
              ? (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / span
              : (v - lo) / span));
      svg += `<text class="ptitle" x="${ox + left}" y="${oy + 14}">${LIB.esc(p.title)}</text>`;
      for (const t of ticks) {
        svg += `<line class="grid" x1="${ox + left}" x2="${ox + PW - right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
        svg += `<text class="axis" x="${ox + left - 6}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${LIB.tick(t)}</text>`;
      }
      xs.forEach((label, i) => {
        svg += `<text class="axis" x="${x(i).toFixed(1)}" y="${oy + PH - bottom + 16}" text-anchor="middle">${LIB.esc(label)}</text>`;
      });
      svg += `<text class="axis" x="${ox + left + (PW - left - right) / 2}" y="${oy + PH - 8}" text-anchor="middle">${LIB.esc(xLabel)}</text>`;
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
        if (cls !== 'muted') {
          for (const [a, b] of pts)
            svg += `<circle class="dot-on" cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="4"/>`;
          const last = pts[pts.length - 1];
          ends.push({name: s.name, x: last[0], y: last[1], cls});
        }
        svg += `</g>`;
      }
      // End labels, pushed apart when they collide, with a leader line back
      // to the line's end.
      ends.sort((a, b) => a.y - b.y);
      for (const e of ends) e.ly = e.y;
      for (let i = 1; i < ends.length; i++) {
        ends[i].ly = Math.max(ends[i].ly, ends[i - 1].ly + 13);
      }
      // Keep them inside the plot, clear of the x-axis labels.
      const floor = oy + PH - bottom - 4;
      for (let i = ends.length - 1; i >= 0; i--) {
        const limit = i === ends.length - 1 ? floor : ends[i + 1].ly - 13;
        ends[i].ly = Math.min(ends[i].ly, limit);
      }
      for (const e of ends) {
        const ly = e.ly ?? e.y;
        if (Math.abs(ly - e.y) > 1) {
          svg += `<line class="leader" x1="${(e.x + 5).toFixed(1)}" y1="${e.y.toFixed(1)}" x2="${(e.x + 12).toFixed(1)}" y2="${ly.toFixed(1)}"/>`;
        }
        svg += `<text class="endlabel" x="${(e.x + 14).toFixed(1)}" y="${(ly + 4).toFixed(1)}">${LIB.esc(e.name)}</text>`;
      }
      // One hit column per x position: the tooltip lists every series there.
      xs.forEach((label, i) => {
        const w =
          xs.length === 1
            ? PW - left - right
            : (PW - left - right) / (xs.length - 1);
        const rows = p.series
          .filter(s => s.values[i] !== null)
          .map(s => [s.name, s.values[i]])
          .sort((a, b) => a[1] - b[1])
          .map(([n, v]) => `${n}: ${LIB.ms(v)} ms`);
        svg += `<rect class="hit col" x="${(x(i) - w / 2).toFixed(1)}" y="${oy + top}" width="${w.toFixed(1)}" height="${PH - top - bottom}" data-x="${x(i).toFixed(1)}" data-y1="${oy + top}" data-y2="${oy + PH - bottom}"${LIB.tipAttrs(p.title + ' · ' + label, xLabel, rows.join('\n'))}/>`;
      });
    });
    return (
      svg +
      `<line class="crosshair" x1="0" x2="0" y1="0" y2="0" visibility="hidden"/></svg>`
    );
  },

  // Horizontal bars from a zero baseline, value at the tip.
  bars(rows, axisLabel, unit) {
    const W = 640;
    const left = 150;
    const right = 90;
    const top = 6;
    const rowH = 30;
    const bottom = 40;
    const H = top + rows.length * rowH + bottom;
    const ticks = LIB.linearTicks(Math.max(...rows.map(r => r.value), 0));
    const hi = ticks[ticks.length - 1] || 1;
    const x = v => left + (v / hi) * (W - left - right);
    let svg = `<svg class="viz-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${LIB.esc(axisLabel)}">`;
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
      label: v,
      emph: v.startsWith('store'),
      on: cell.variants[v]?.on ?? null,
      off: cell.variants[v]?.off ?? null,
    }));
    const plot = LIB.dots(rows, 'ms per update, log scale (lower is better)');
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
    const note = cell.verdict
      ? `store + compiler vs ${LIB.esc(d.headline)} (${LIB.esc(cell.best)}): <strong>${LIB.esc(cell.verdict.text)}</strong>` +
        (cell.granular ? ` · vs the granular control: ${LIB.esc(cell.granular.text)}` : '')
      : '';
    return {plot, table, note};
  },

  viewSpike(d, st) {
    const xs = d.ks.map(k => `K=${k}`);
    const order = ['redux', 'zustand', 'store', 'store-memo'];
    const panels = d.families.map(f => ({
      title: f,
      series: [...d.variants]
        .sort(
          (a, b) =>
            (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) ||
            a.localeCompare(b)
        )
        .map(v => ({
          name: v,
          values: d.ks.map(
            k =>
              d.cells[`${f}|${k}|${st.throttle}`]?.variants[v]?.median ?? null
          ),
        })),
    }));
    const plot = LIB.lines(panels, xs, {
      log: false,
      yLabel: 'ms per update',
      xLabel: 'readers per category',
    });
    const head = [
      'variant',
      ...d.families.flatMap(f => d.ks.map(k => `${LIB.esc(f)} K=${k}`)),
    ];
    const rows = panels[0].series.map(s => [
      LIB.esc(s.name),
      ...d.families.flatMap(f =>
        d.ks.map(k => {
          const e = d.cells[`${f}|${k}|${st.throttle}`]?.variants[s.name];
          return e
            ? `${LIB.ms(e.median)} <small>${e.vsRedux === null ? '' : e.vsRedux.toFixed(2) + '×'}</small>`
            : '–';
        })
      ),
    ]);
    return {
      plot,
      table: LIB.table(head, rows),
      note: 'Median ms per update with the compiler; small numbers are the ratio of means to redux. store-derived is fast but tears under transitions.',
    };
  },

  viewSweep(d, st) {
    const coverage = d.configs.filter(c => c.key.endsWith('-w8'));
    const widths = ['c100-w4', 'c100-w8', 'c100-w16'];
    const pick =
      st.view === 'width'
        ? widths.map(k => d.configs.find(c => c.key === k)).filter(Boolean)
        : coverage;
    const xs = pick.map(c =>
      st.view === 'width'
        ? c.key.replace(/^c100-w/, '')
        : c.key === 'c0-w8'
          ? 'none'
          : c.key.replace(/^c(\d+)-w8$/, '$1%')
    );
    const panels = d.scenarios.map(s => ({
      title: s,
      series: d.libraries.map(lib => ({
        name: lib,
        values: pick.map(
          c =>
            d.cells[`${s}|${st.throttle}|${c.key}`]?.libraries[lib]?.median ??
            null
        ),
      })),
    }));
    const plot = LIB.lines(panels, xs, {
      log: true,
      yLabel: 'ms per update, log scale',
      xLabel:
        st.view === 'width'
          ? 'props per row (all compiled)'
          : 'rows compiled (8 props)',
    });
    const head = [
      'scenario',
      'configuration',
      ...d.libraries.map(LIB.esc),
      ...d.stores.map(s => `${LIB.esc(s)} vs best`),
    ];
    const rows = d.scenarios.flatMap(s =>
      pick.map(c => {
        const cell = d.cells[`${s}|${st.throttle}|${c.key}`];
        return [
          LIB.esc(s),
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
      note: 'Median ms per update at N=1,000. "vs best" compares with the faster of redux and zustand at the same configuration.',
    };
  },

  viewMemory(d, st) {
    const rows = d.rows
      .filter(r => r.n === st.n && r.compiler === 'on')
      .map(r => ({
        label: r.variant,
        value: r.bytesPerRow,
        emph: r.variant.startsWith('store'),
        extra: `mount ${r.mountMs.toFixed(1)} ms · ${r.runs} ${r.runs === 1 ? 'run' : 'runs'}`,
      }));
    const plot = rows.length
      ? LIB.bars(
          rows,
          'bytes per row after mount (compiler on)',
          'bytes per row'
        )
      : '<p class="viz-empty">No data.</p>';
    const table = LIB.table(
      ['variant', 'compiler', 'bytes per row', 'mount ms', 'runs'],
      d.rows
        .filter(r => r.n === st.n)
        .map(r => [
          LIB.esc(r.variant),
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
<figcaption class="viz-title">${esc(title)}</figcaption>
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
        `<span><svg width="22" height="12" aria-hidden="true"><g class="${cls}">${shape === 'line' ? '<line class="line" x1="1" x2="21" y1="6" y2="6"/>' : shape === 'ring' ? '<circle class="dot-off" cx="11" cy="6" r="4.5"/>' : shape === 'bar' ? '<rect class="bar" x="1" y="2" width="20" height="8" rx="2"/>' : '<circle class="dot-on" cx="11" cy="6" r="4.5"/>'}</g></svg>${esc(label)}</span>`
    )
    .join('')}</div>`;
}

function card(inner, caption) {
  return `<div class="viz viz-card">${inner}${caption ? `<p class="viz-caption">${caption}</p>` : ''}</div>`;
}

function table(head, rows, cls = '') {
  return `<div class="viz-scroll"><table class="viz-table${cls ? ' ' + cls : ''}"><thead><tr>${head
    .map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .map(
      r =>
        `<tr${r.cls ? ` class="${r.cls}"` : ''}>${(r.cells ?? r).map((c, i) => `<td${i ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`
    )
    .join('')}</tbody></table></div>`;
}

function tallyCell(t) {
  if (!t || (t.total === 0 && !t.noWork))
    return '<span class="muted">no data</span>';
  const parts = [
    t.wins && `${t.wins} faster`,
    t.ties && `${t.ties} tie`,
    t.losses && `${t.losses} slower`,
    t.noWork && `${t.noWork} no work`,
  ].filter(Boolean);
  // The range without the counts describe() appends; they're on their own line.
  const range = t.range.replace(/\s*\([^)]*\)$/, '').replace(/, and \d+ with no work$/, '');
  return `<span class="sb-count">${t.wins + t.ties}/${t.total}</span><span class="sb-range">${esc(range)}</span><span class="sb-parts">${parts.join(' · ')}</span>`;
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
function mainForBrowser(d) {
  return {
    ...d,
    cells: mapValues(d.cells, c => ({
      verdict: c.verdict ? {text: c.verdict.text} : null,
      granular: c.granular ? {text: c.granular.text} : null,
      best: c.best,
      variants: mapValues(c.variants, v => ({
        on: pick(v.on, ENTRY),
        off: pick(v.off, ENTRY),
      })),
    })),
  };
}
function spikeForBrowser(d) {
  return {
    families: d.families,
    ks: d.ks,
    throttles: d.throttles,
    variants: d.variants,
    cells: mapValues(d.cells, c => ({
      variants: mapValues(c.variants, v => pick(v, ['median', 'vsRedux'])),
    })),
  };
}
function sweepForBrowser(d) {
  return {
    scenarios: d.scenarios,
    throttles: d.throttles,
    libraries: d.libraries,
    stores: d.stores,
    configs: d.configs,
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

function scoreboard(data) {
  const sb = data.series.scoreboard;
  // The granular control last: it's reported, but it isn't the headline.
  const ids = [
    'selectors',
    'redux',
    'zustand',
    'context',
    'context-split',
    'zustand-granular',
  ];
  const head = [
    'scenario',
    ...ids.map(id =>
      esc(sb.comparisons[id].replace(/^store \+ compiler vs /, 'vs '))
    ),
  ];
  const rows = sb.rows.map(r => [
    esc(r.title),
    ...ids.map(id => tallyCell(r.tallies[id])),
  ]);
  rows.push({
    cls: 'total',
    cells: ['every scenario', ...ids.map(id => tallyCell(sb.all[id]))],
  });
  return card(
    placeholderBanner(data) + table(head, rows, 'scoreboard'),
    'use(store) with the compiler against each library at its faster compiler setting, over every size and CPU throttle. The bold count is configurations matched or beaten; a tie is a difference in means within two standard errors.'
  );
}

function scoreboardControls(data) {
  const sb = data.series.scoreboard;
  const ids = ['single-selectors', 'nocompiler-selectors', 'compiler-gain'];
  const head = ['scenario', ...ids.map(id => esc(sb.comparisons[id]))];
  const rows = sb.rows.map(r => [
    esc(r.title),
    ...ids.map(id => tallyCell(r.tallies[id])),
  ]);
  rows.push({
    cls: 'total',
    cells: ['every scenario', ...ids.map(id => tallyCell(sb.all[id]))],
  });
  return card(
    placeholderBanner(data) + table(head, rows, 'scoreboard'),
    'Controls: one store without selectors, everything without the compiler, and what the compiler buys use(store).'
  );
}

function mainChart(data) {
  const d = data.series.main;
  const state = {
    scenario: d.scenarios[0]?.key,
    n: d.ns.includes(1000) ? 1000 : d.ns[0],
    throttle: d.throttles[0],
  };
  return (
    placeholderBanner(data) +
    figure('main', {
      title: 'Update cost by variant',
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
      data: mainForBrowser(d),
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'dot', 'use(store), compiler on'],
        ['s1', 'ring', 'use(store), compiler off'],
        ['muted', 'dot', 'others, compiler on'],
        ['muted', 'ring', 'others, compiler off'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function mainVerdicts(data) {
  const d = data.series.main;
  const cols = d.ns.flatMap(n => d.throttles.map(t => [n, t]));
  const head = [
    'scenario',
    ...cols.map(([n, t]) => `N=${n.toLocaleString('en-US')} · ${t}×`),
  ];
  const rows = d.scenarios.map(s => [
    esc(s.title),
    ...cols.map(([n, t]) => {
      const c = d.cells[`${s.key}|${n}|${t}`];
      if (!c?.verdict) return '–';
      const granular = c.granular ? `<br><small class="muted">granular control: ${esc(c.granular.text)}</small>` : '';
      return `${esc(c.verdict.text)}<br><small class="muted">vs ${esc(c.best)}</small>${granular}`;
    }),
  ]);
  return card(
    placeholderBanner(data) + table(head, rows),
    `use(store) with the compiler against ${esc(d.headline)}, each at its faster compiler setting. The small line is the granular control (a Zustand store per entity), which isn't part of the headline.`
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
              `${esc(v)}${c === 'on' ? ' + compiler' : ''}`,
              ...cols.map(([n, t]) =>
                ms(
                  d.cells[`${s.key}|${n}|${t}`]?.variants[v]?.[c]?.median ??
                    null
                )
              ),
            ])
        );
        return (
          `<h4 class="viz-h">${esc(s.title)}</h4>` +
          card(
            table(
              [
                'variant',
                ...cols.map(
                  ([n, t]) => `N=${n.toLocaleString('en-US')} · ${t}×`
                ),
              ],
              rows
            )
          )
        );
      })
      .join('\n')
  );
}

function countsTable(data) {
  const rows = data.series.counts.filter(
    r => r.suite === 'main' && r.compiler === 'on'
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
  return card(
    table(
      [
        'scenario',
        'variant',
        'component renders',
        'Row renders',
        'selector calls',
      ],
      ordered.map(r => [
        esc(r.scenario),
        esc(r.variant),
        LIB.int(r.renders),
        LIB.int(r.rows),
        LIB.int(r.selectors),
      ])
    ),
    'From the counting build at N=1,000, every component compiled: work for one update.'
  );
}

function suiteTable(data, suite) {
  const s = data.series.suites.find(x => x.suite === suite);
  if (!s)
    return card('<p class="viz-empty">No pinned results for this suite.</p>');
  const head = [
    'scenario',
    ...s.variants.map(esc),
    ...s.lefts.map(l => `${esc(l)} vs best`),
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
    ];
  });
  return card(
    placeholderBanner(data) + table(head, rows),
    `Median ms per update with the compiler; small numbers are the ratio of means to redux. Verdicts compare with the fastest of ${esc(s.opponents.join(', '))}, each at its faster compiler setting.`
  );
}

function spikeChart(data) {
  const d = data.series.spike;
  if (!d) return card('<p class="viz-empty">No pinned spike results.</p>');
  return (
    placeholderBanner(data) +
    figure('spike', {
      title: 'Shared derived data: cost as readers per category grow',
      controls: [
        {
          key: 'throttle',
          label: 'CPU',
          options: d.throttles.map(t => [t, `${t}× throttle`]),
        },
      ],
      state: {throttle: d.throttles[0]},
      data: spikeForBrowser(d),
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'line', 'store (per component)'],
        ['s2', 'line', 'redux'],
        ['s3', 'line', 'zustand'],
        ['s4', 'line', 'store-memo (weakMemo)'],
        ['muted', 'line', 'other sharing options'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function sweepChart(data) {
  const d = data.series.sweeps;
  if (!d) return card('<p class="viz-empty">No pinned sweep results.</p>');
  return (
    placeholderBanner(data) +
    figure('sweep', {
      title: 'Selection and compiler coverage',
      controls: [
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
      state: {view: 'coverage', throttle: d.throttles[0]},
      data: sweepForBrowser(d),
    }).replace(
      '<div class="viz-plot">',
      legend([
        ['s1', 'line', 'store'],
        ['s4', 'line', 'store-keyed'],
        ['s2', 'line', 'redux'],
        ['s3', 'line', 'zustand'],
      ]) + '<div class="viz-plot">'
    )
  );
}

function typingTable(data, which) {
  const rows = data.series.typing[which] ?? [];
  if (rows.length === 0)
    return card('<p class="viz-empty">No pinned typing results.</p>');
  return card(
    placeholderBanner(data) +
      table(
        [
          'variant',
          'CPU',
          'p50 ms',
          'p95 ms',
          'max ms',
          'settled after ms',
          'runs',
        ],
        rows.map(r => [
          `${esc(r.variant)}${r.compiler === 'on' ? ' + compiler' : ''}`,
          `${r.throttle}×`,
          r.p50.toFixed(1),
          r.p95.toFixed(1),
          r.max.toFixed(1),
          LIB.int(r.settle),
          String(r.runs),
        ])
      ),
    'Keydown to next frame while the list re-filters, over every key of every run.'
  );
}

function memoryChart(data) {
  const rows = data.series.memory;
  if (rows.length === 0)
    return card('<p class="viz-empty">No pinned memory results.</p>');
  const ns = [...new Set(rows.map(r => r.n))].sort((a, b) => a - b);
  return (
    placeholderBanner(data) +
    figure('memory', {
      title: 'Memory per row',
      controls: [
        {
          key: 'n',
          label: 'Rows',
          options: ns.map(n => [n, n.toLocaleString('en-US')]),
        },
      ],
      state: {n: ns[ns.length - 1]},
      data: {rows},
    })
  );
}

function lossesTable(data) {
  const rows = data.series.losses;
  const v = data.values;
  const headline = data.series.main.headline ?? 'the headline opponents';
  const areas = [
    ['main', `Main suite, vs ${headline}`],
    ['granular', 'Main suite, vs the granular control (a Zustand store per entity; not part of the headline)'],
    ['suites', 'Ported Redux suites and fairness'],
    ['sweeps', 'Sweeps: selection and compiler coverage'],
    ['spike', 'Shared derived data, plain store and store-memo vs Redux'],
  ];
  const head = ['where', 'store side', 'median ms', 'mean ms', 'against', 'median ms', 'mean ms', 'verdict (means)'];
  const sections = areas
    .filter(([a]) => v[`losses.${a}.of`])
    .map(([a, title]) => {
      const list = rows.filter(r => r.area === a);
      const summary = `${v[`losses.${a}.count`].display} of ${v[`losses.${a}.of`].display} lost`;
      const body = list.length
        ? list
            .map(
              r =>
                `<tr><td>${esc(r.where)}</td><td class="r">${esc(r.left)}</td><td class="r">${ms(r.leftMedian)}</td><td class="r">${ms(r.leftMean)}</td><td class="r">${esc(r.opponent)}</td><td class="r">${ms(r.opponentMedian)}</td><td class="r">${ms(r.opponentMean)}</td><td class="r">${esc(r.text)}</td></tr>` +
                (r.reason ? `<tr class="reason"><td colspan="${head.length}">${esc(r.reason)}</td></tr>` : ''),
            )
            .join('')
        : `<tr><td colspan="${head.length}" class="muted">No losses outside two standard errors.</td></tr>`;
      return `<tr class="area"><th colspan="${head.length}">${esc(title)} <small>${esc(summary)}</small></th></tr>${body}`;
    })
    .join('');
  return card(
    placeholderBanner(data) +
      `<div class="viz-scroll"><table class="viz-table losses"><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${sections}</tbody></table></div>`,
    'Every comparison the store side loses outside two standard errors, with what the counting build says each side did for one update of that scenario. Verdicts compare means, which include the slow tail: where a median is lower but the mean is higher, the store side has more slow updates.',
  );
}

function nobailoutTable(data) {
  const d = data.series.nobailout;
  if (!d) return card('<p class="viz-empty">No pinned results without the same-element bailout.</p>');
  const head = [
    'configuration',
    ...d.variants.map(esc),
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
    sweeps = `<h4 class="viz-h">Sweeps without the bailout</h4>` + table(['configuration', ...sw.libraries.map(esc), ...sw.stores.map(l => `${esc(l)} vs best`)], swRows);
  }
  return card(
    placeholderBanner(data) + table(head, rows) + sweeps,
    'React built with enableSameElementBailout off, compiler on, median ms per update. Never part of the headline. "What the bailout buys" compares store + compiler on the head build with this build in the same configuration.',
  );
}

export const generators = {
  'charts-assets': () => assets(),
  'build-label': buildLabel,
  scoreboard,
  'scoreboard-controls': scoreboardControls,
  'main-chart': mainChart,
  'main-verdicts': mainVerdicts,
  'main-table': mainTable,
  'counts-table': countsTable,
  'suite-derived-selectors': d => suiteTable(d, 'derived-selectors'),
  'suite-rapid-dispatch': d => suiteTable(d, 'rapid-dispatch'),
  'suite-many-components-same-slice': d =>
    suiteTable(d, 'many-components-same-slice'),
  'suite-deeptree-nested-hooks': d => suiteTable(d, 'deeptree-nested-hooks'),
  'suite-fairness': d => suiteTable(d, 'fairness'),
  'spike-chart': spikeChart,
  'sweep-chart': sweepChart,
  'typing-table': d => typingTable(d, 'main'),
  'typing-suite-table': d => typingTable(d, 'suite'),
  'memory-chart': memoryChart,
  'losses-table': lossesTable,
  'nobailout-table': nobailoutTable,
};

export const generatorDocs = {
  'charts-assets':
    'The chart CSS and runtime (filters, tooltips). Put it once per page, in the `<head>`.',
  'build-label':
    'The build provenance line (React version and sha, compiler hash, pin date), or a placeholder warning. G5 requires it on every page that cites numbers.',
  scoreboard:
    'Main suite scoreboard: store + compiler vs the faster of Redux/Zustand, and vs each library and context, per scenario and overall.',
  'scoreboard-controls':
    'Main suite controls: store-single vs selectors, everything without the compiler, and store with vs without the compiler.',
  'main-chart':
    'Interactive dot plot of the main suite: every variant, compiler on and off, median and middle half, filterable by scenario, rows and CPU; with the verdict and a table view.',
  'main-verdicts':
    'Main suite verdict grid: store + compiler vs the faster of Redux/Zustand for every scenario × size × CPU.',
  'main-table':
    'Main suite medians: one table per scenario, every variant and compiler setting × size × CPU.',
  'counts-table':
    'Work for one update at N=1,000 (counting build, compiled): component renders, Row renders, selector calls.',
  'suite-derived-selectors':
    'Redux suite derived-selectors: medians and store / store-memo verdicts.',
  'suite-rapid-dispatch':
    'Redux suite rapid-dispatch: medians and the store verdict.',
  'suite-many-components-same-slice':
    'Redux suite many-components-same-slice: medians and the store verdict.',
  'suite-deeptree-nested-hooks':
    'Redux suite deeptree-nested-hooks: medians and the store verdict.',
  'suite-fairness':
    'Fairness controls (redux-plain, redux-nofreeze) at N=1,000: medians and the store verdict.',
  'spike-chart':
    'Shared derived data spike: ms per update vs readers per category (K=5/20/50), small multiples per update family, CPU filter, table view.',
  'sweep-chart':
    'Sweeps at N=1,000: store, store-keyed, redux and zustand by compiler coverage or props per row, selection and entity, CPU filter, table view with verdicts.',
  'typing-table':
    'Typing latency in the main app (p50, p95, max, settle) per variant and CPU.',
  'typing-suite-table':
    'Typing latency with the useDeferredValue variants of Redux and Zustand.',
  'memory-chart':
    'Bytes per row after mount (bars, compiler on), filterable by rows, with mount time in the tooltip and a table view.',
  'nobailout-table':
    'Without the same-element bailout (react-builds/head-nobailout): main-suite medians, store vs the headline opponents and vs the granular control, and what the bailout buys store; plus the sweeps when pinned. Separate from the headline.',
  'losses-table':
    "Where it doesn't win: every comparison the store side loses outside two standard errors, by area (main vs the headline opponents, main vs the granular control, suites, sweeps, spike), each with the counting build's renders, selector calls and derivations for both sides.",
};

// ---------------------------------------------------------------- assets

const CSS = `
.viz{--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--border:rgba(11,11,11,.10);--series-1:#2a78d6;--series-2:#eb6834;--series-3:#1baf7a;--series-4:#eda100;color-scheme:light;color:var(--text-primary);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .viz{--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--series-4:#c98500;color-scheme:dark}}
:root[data-theme="dark"] .viz{--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--border:rgba(255,255,255,.10);--series-1:#3987e5;--series-2:#d95926;--series-3:#199e70;--series-4:#c98500;color-scheme:dark}
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
.viz .s1{--c:var(--series-1)}.viz .s2{--c:var(--series-2)}.viz .s3{--c:var(--series-3)}.viz .s4{--c:var(--series-4)}.viz .muted{--c:var(--muted)}
.viz .whisker{stroke:var(--c);stroke-width:2;stroke-linecap:round;opacity:.45}
.viz .dot-on{fill:var(--c);stroke:var(--surface-1);stroke-width:2}
.viz .dot-off{fill:var(--surface-1);stroke:var(--c);stroke-width:2}
.viz .line{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.viz g.muted .line{opacity:.55}
.viz .bar{fill:var(--c)}
.viz .hit{fill:transparent;cursor:default;outline:none}
.viz .hit:focus-visible{stroke:var(--text-primary);stroke-width:1}
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
.viz-table.scoreboard td,.viz-table.scoreboard th{text-align:left}
.viz .sb-count{display:block;font-weight:600;font-size:15px;color:var(--text-primary)}
.viz .sb-range{display:block}
.viz-scroll{overflow-x:auto}
.viz .sb-parts{display:block;color:var(--text-secondary);font-size:12px;white-space:nowrap}
.viz-build{color:var(--text-secondary,#52514e);font-size:13px}
.viz-build[data-build-status="placeholder"]{color:#d03b3b;font-weight:600}
.viz-h{margin:14px 0 4px}
.viz-empty{color:var(--text-secondary)}
@media (prefers-reduced-motion:reduce){.viz *{transition:none!important;animation:none!important}}
@media (forced-colors:active){.viz .dot-on,.viz .bar{fill:CanvasText}.viz .line,.viz .whisker,.viz .dot-off{stroke:CanvasText}}
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
      var b = document.createElement('b');
      b.textContent = el.getAttribute('data-tip-value');
      var s = document.createElement('span');
      s.textContent = el.getAttribute('data-tip-label');
      tip.appendChild(b);
      tip.appendChild(s);
      var extra = el.getAttribute('data-tip-extra');
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
      var el = ev.target.closest && ev.target.closest('[data-tip-value]');
      if (el) show(el, ev.clientX, ev.clientY);
      else hide();
    });
    plot.addEventListener('pointerleave', hide);
    plot.addEventListener('focusin', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-tip-value]');
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
      if (card.querySelector('[data-tip-value]')) tooltips(card);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();`;
}

function assets() {
  return `<style>${CSS}</style>\n<script>${runtime()}</script>`;
}
