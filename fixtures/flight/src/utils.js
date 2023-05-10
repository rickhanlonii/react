export function getRandomColor() { 
  const h = 360 * Math.random();
  const s = (25 + 70 * Math.random());
  const l = (85 + 10 * Math.random());
  const rgb = HSLToRGB(h, s, l)
  return 'rgb(' + rgb.join(',') + ')';
}

const HSLToRGB = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
};

export function filterFiles(files, query) {
  return files.filter(f => f.split('-').some(word => word.startsWith(query)));
}
