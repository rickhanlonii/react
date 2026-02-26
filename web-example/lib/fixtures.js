// Auto-discovers all fixture files — just add a new .js file to
// example/server/src/fixtures/ and it appears here automatically.
var fixtureContext = require.context(
  '../../example/server/src/fixtures',
  false,
  /\.js$/,
);

var allFixtures = fixtureContext
  .keys()
  .sort()
  .map(function (key) {
    var mod = fixtureContext(key);
    var name = key.replace(/^\.\//, '').replace(/\.js$/, '');
    return {
      name: name,
      component: mod.default || mod,
      ...(mod.fixture || {}),
    };
  });

export function getCategories() {
  var categoryOrder = [];
  var categoryMap = {};
  for (var i = 0; i < allFixtures.length; i++) {
    var f = allFixtures[i];
    var cat = f.category || 'Other';
    if (!categoryMap[cat]) {
      categoryMap[cat] = [];
      categoryOrder.push(cat);
    }
    categoryMap[cat].push({
      name: f.name,
      title: f.title || f.name,
      description: f.description || '',
    });
  }
  return categoryOrder.map(function (cat) {
    return {category: cat, fixtures: categoryMap[cat]};
  });
}

export function getFixtureComponent(name) {
  var fixture = allFixtures.find(function (f) {
    return f.name === name;
  });
  return fixture ? fixture.component : null;
}
