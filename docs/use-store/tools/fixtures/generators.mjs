// A stand-in for tools/charts.mjs, for testing build-docs.mjs.
export const generators = {
  'demo-table'(data, {args}) {
    const rows = Object.entries(data.values)
      .slice(0, args.rows || 10)
      .map(([key, v]) => `<tr><td>${key}</td><td><span data-n="${key}"></span></td></tr>`);
    return `<table>${rows.join('')}</table>`;
  },
};
