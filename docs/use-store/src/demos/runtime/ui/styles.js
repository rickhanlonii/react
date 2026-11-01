// The explainers' styles. They use the page's colors when it defines them
// (--bg, --panel, --text, --muted, --border, --accent, ...), and fall back to
// a dark palette. Lanes are told apart by their text label first; color and
// border style only reinforce it (G8). No animation runs when the reader
// prefers reduced motion.

export const css = `
.explainer { margin: 24px 0; }
.ex-panel {
  --ex-bg: var(--panel, #171a21);
  --ex-bg-2: var(--panel-2, #1e222b);
  --ex-text: var(--text, #e6e8ee);
  --ex-muted: var(--muted, #9aa3b2);
  --ex-border: var(--border, #2a2f3a);
  --ex-accent: var(--accent, #58c4dc);
  --ex-good: var(--good, #4ade80);
  --ex-bad: var(--bad, #f87171);
  --ex-sync: #f59e0b;
  --ex-default: #58c4dc;
  --ex-transition: #a78bfa;
  --ex-rebase: #9aa3b2;
  background: var(--ex-bg);
  color: var(--ex-text);
  border: 1px solid var(--ex-border);
  border-radius: 12px;
  padding: 16px;
  font-size: 15px;
  line-height: 1.5;
}
.ex-panel h4 { margin: 0 0 8px; font-size: 14px; color: var(--ex-muted); font-weight: 600; letter-spacing: .02em; }
.ex-panel p { margin: 4px 0; }
.ex-panel button {
  font: inherit; font-size: 14px; color: var(--ex-text); background: var(--ex-bg-2);
  border: 1px solid var(--ex-border); border-radius: 8px; padding: 4px 10px; cursor: pointer;
}
.ex-panel button:hover:not(:disabled) { border-color: var(--ex-accent); }
.ex-panel button:focus-visible, .ex-panel input:focus-visible, .ex-panel summary:focus-visible {
  outline: 2px solid var(--ex-accent); outline-offset: 2px;
}
.ex-panel button:disabled { opacity: .5; cursor: default; }
.ex-panel button.ex-primary { border-color: var(--ex-accent); font-weight: 600; }
.ex-panel[aria-busy="true"] button, [aria-busy="true"] > .ex-panel button { cursor: progress; }
.ex-controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.ex-control-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ex-control-label { min-width: 88px; font-weight: 600; }
.ex-note, .ex-small, .ex-footnote, .ex-empty { color: var(--ex-muted); font-size: 13px; }
.ex-footnote { margin-top: 12px; }
.ex-sub { color: var(--ex-muted); font-size: 13px; margin-top: 8px; }
.ex-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ex-columns { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.ex-columns-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1000px) {
  .ex-columns-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .ex-grid, .ex-columns { grid-template-columns: minmax(0, 1fr); }
}
.ex-cell { background: var(--ex-bg-2); border: 1px solid var(--ex-border); border-radius: 10px; padding: 12px; min-width: 0; }
.ex-wide { grid-column: 1 / -1; }
.ex-big { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ex-frame { display: block; width: 100%; border: 1px dashed var(--ex-border); border-radius: 8px; background: transparent; }
.ex-frame-queue { height: 56px; }
.ex-frame-tearing { height: 48px; }
.ex-frame-rerenders { height: 200px; }
.ex-frame-subs { height: 96px; }
.ex-chips { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; padding: 0; }
.ex-chip {
  display: inline-flex; flex-direction: column; align-items: center; min-width: 64px;
  border: 2px solid var(--ex-border); border-radius: 8px; padding: 2px 8px; background: var(--ex-bg);
}
.ex-chip-op { font-weight: 700; font-variant-numeric: tabular-nums; }
.ex-chip-lane { font-size: 12px; color: var(--ex-muted); }
.ex-chip.ex-lane-sync { border-color: var(--ex-sync); }
.ex-chip.ex-lane-default { border-color: var(--ex-default); }
.ex-chip.ex-lane-transition { border-color: var(--ex-transition); border-style: double; border-width: 3px; }
.ex-chip.ex-lane-rebase { border-color: var(--ex-rebase); border-style: dotted; }
.ex-chip-inflight { opacity: .85; border-style: dashed; }
.ex-lane-btn.ex-lane-sync { border-left: 4px solid var(--ex-sync); }
.ex-lane-btn.ex-lane-default { border-left: 4px solid var(--ex-default); }
.ex-lane-btn.ex-lane-transition { border-left: 4px double var(--ex-transition); }
.ex-upcoming { margin: 4px 0; padding-left: 20px; }
.ex-upcoming li { margin: 2px 0; }
.ex-upcoming-lanes { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.ex-next { font-weight: 600; }
.ex-tag { margin-left: 8px; font-size: 12px; border: 1px solid var(--ex-accent); border-radius: 999px; padding: 0 6px; }
.ex-log { margin: 0; padding-left: 20px; font-size: 13px; color: var(--ex-muted); max-height: 180px; overflow: auto; }
.ex-log li:first-child { color: var(--ex-text); }
.ex-error { margin-top: 12px; border: 1px solid var(--ex-bad); border-radius: 8px; padding: 8px 12px; }
.ex-code-inline { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: var(--ex-muted); }
.ex-cells, .ex-events { list-style: none; margin: 4px 0; padding: 0; font-size: 13px; }
.ex-cells { display: flex; flex-wrap: wrap; gap: 4px; min-height: 24px; }
.ex-cell-chip { border: 1px solid var(--ex-border); border-radius: 6px; padding: 0 6px; }
.ex-events li { margin: 2px 0; }
.ex-ok::before { content: "\\2713  "; color: var(--ex-good); }
.ex-bad::before { content: "\\2717  "; color: var(--ex-bad); }
.ex-verdict { font-weight: 600; margin-top: 8px; }
.ex-counts { border-collapse: collapse; margin: 8px 0; font-size: 13px; width: 100%; }
.ex-counts caption { text-align: left; color: var(--ex-muted); padding-bottom: 4px; }
.ex-counts th, .ex-counts td { text-align: left; padding: 2px 8px 2px 0; border-bottom: 1px solid var(--ex-border); }
.ex-counts td { font-variant-numeric: tabular-nums; }
.ex-counts tr.ex-hit th::after { content: "  rendered"; font-weight: 400; color: var(--ex-muted); font-size: 12px; }
.ex-counts tr.ex-hit td { font-weight: 700; }
.ex-code summary { cursor: pointer; color: var(--ex-muted); font-size: 13px; margin-top: 6px; }
.ex-code pre { overflow: auto; font-size: 12px; background: var(--ex-bg); border: 1px solid var(--ex-border); border-radius: 8px; padding: 8px; }
@media (prefers-reduced-motion: no-preference) {
  .ex-chip { transition: border-color .2s; }
}
`;

// Styles inside the frames. The frames are transparent, so the panel shows
// through.
export const frameCss = `
html, body { margin: 0; background: transparent; color: #e6e8ee;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
#root { padding: 6px 8px; }
.queue-screen { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tear-row { display: flex; gap: 6px; }
.tear-cell { display: inline-block; min-width: 28px; text-align: center; border: 1px solid #2a2f3a; border-radius: 6px; font-weight: 700; }
.rows { list-style: none; margin: 0; padding: 0; }
.row { padding: 2px 6px; border: 1px solid transparent; border-radius: 6px; }
.row.selected { border-color: #58c4dc; font-weight: 700; }
.row.selected::before { content: "\\25B6  "; }
.subs-profile span { margin-right: 8px; }
.subs-badges { display: flex; gap: 6px; margin-top: 6px; }
.subs-badge { border: 1px solid #2a2f3a; border-radius: 999px; padding: 0 8px; }
`;
