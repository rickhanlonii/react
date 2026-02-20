import f01 from '@example/fixtures/01-rsc-only';
import f02 from '@example/fixtures/02-text-formatting';
import f03 from '@example/fixtures/03-single-suspense';
import f04 from '@example/fixtures/04-client-components';
import f05 from '@example/fixtures/05-nested-suspense';
import f06 from '@example/fixtures/06-kitchen-sink';
import f07 from '@example/fixtures/07-caught-errors';
import f08 from '@example/fixtures/08-uncaught-server-error';
import f09 from '@example/fixtures/09-uncaught-hydration-error';
import f10 from '@example/fixtures/10-uncaught-interaction-error';
import f11 from '@example/fixtures/11-recoverable-errors';

const allFixtures = [
  {name: '01-rsc-only', component: f01, ...(f01.fixture || {})},
  {name: '02-text-formatting', component: f02, ...(f02.fixture || {})},
  {name: '03-single-suspense', component: f03, ...(f03.fixture || {})},
  {name: '04-client-components', component: f04, ...(f04.fixture || {})},
  {name: '05-nested-suspense', component: f05, ...(f05.fixture || {})},
  {name: '06-kitchen-sink', component: f06, ...(f06.fixture || {})},
  {name: '07-caught-errors', component: f07, ...(f07.fixture || {})},
  {name: '08-uncaught-server-error', component: f08, ...(f08.fixture || {})},
  {name: '09-uncaught-hydration-error', component: f09, ...(f09.fixture || {})},
  {name: '10-uncaught-interaction-error', component: f10, ...(f10.fixture || {})},
  {name: '11-recoverable-errors', component: f11, ...(f11.fixture || {})},
];

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
