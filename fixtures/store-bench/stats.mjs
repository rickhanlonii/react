// Statistics and formatting shared by report.mjs and report-suites.mjs.

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sem(values) {
  const m = mean(values);
  const variance =
    values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

// Summary of the durations of one configuration.
export function summarize(durations) {
  return {
    median: median(durations),
    mean: mean(durations),
    sem: sem(durations),
    p95: percentile(durations, 0.95),
  };
}

// Compares two results. "tie" when the difference in means is within two
// standard errors.
export function compare(a, b) {
  if (!a || !b) {
    return null;
  }
  const ratio = a.mean / b.mean;
  const noise = 2 * Math.sqrt(a.sem ** 2 + b.sem ** 2);
  const tie = Math.abs(a.mean - b.mean) <= noise;
  return {ratio, tie};
}

export function verdict(c) {
  if (c === null) {
    return '<span class="muted">n/a</span>';
  }
  if (c.tie) {
    return `<span class="tie">tie</span>`;
  }
  if (c.ratio < 1) {
    return `<span class="win">${(1 / c.ratio).toFixed(1)}× faster</span>`;
  }
  return `<span class="loss">${c.ratio.toFixed(1)}× slower</span>`;
}

export function ms(entry) {
  if (!entry) {
    return '–';
  }
  return entry.median < 1
    ? entry.median.toFixed(3)
    : entry.median < 10
      ? entry.median.toFixed(2)
      : entry.median.toFixed(1);
}
