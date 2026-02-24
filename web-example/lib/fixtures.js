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
import f12 from '@example/fixtures/12-contact-form';
import f13 from '@example/fixtures/13-fieldset';
import f14 from '@example/fixtures/14-button-variants';
import f15 from '@example/fixtures/15-image-square';
import f16 from '@example/fixtures/16-image-landscape';
import f17 from '@example/fixtures/17-image-row';
import f18 from '@example/fixtures/18-unordered-list';
import f19 from '@example/fixtures/19-ordered-list';
import f20 from '@example/fixtures/20-nested-list';
import f21 from '@example/fixtures/21-table';
import f22 from '@example/fixtures/22-meta-ai-homepage';
import f23 from '@example/fixtures/23-flight-async-await';
import f24 from '@example/fixtures/24-flight-parallel-async';
import f25 from '@example/fixtures/25-flight-server-error';
import f26 from '@example/fixtures/26-flight-aborted-suspense';
import f27 from '@example/fixtures/27-flight-deduped-component';
import f28 from '@example/fixtures/28-client-render-errors.js';

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
  {name: '12-contact-form', component: f12, ...(f12.fixture || {})},
  {name: '13-fieldset', component: f13, ...(f13.fixture || {})},
  {name: '14-button-variants', component: f14, ...(f14.fixture || {})},
  {name: '15-image-square', component: f15, ...(f15.fixture || {})},
  {name: '16-image-landscape', component: f16, ...(f16.fixture || {})},
  {name: '17-image-row', component: f17, ...(f17.fixture || {})},
  {name: '18-unordered-list', component: f18, ...(f18.fixture || {})},
  {name: '19-ordered-list', component: f19, ...(f19.fixture || {})},
  {name: '20-nested-list', component: f20, ...(f20.fixture || {})},
  {name: '21-table', component: f21, ...(f21.fixture || {})},
  {name: '22-meta-ai-homepage', component: f22, ...(f22.fixture || {})},
  {name: '23-flight-async-await', component: f23, ...(f23.fixture || {})},
  {name: '24-flight-parallel-async', component: f24, ...(f24.fixture || {})},
  {name: '25-flight-server-error', component: f25, ...(f25.fixture || {})},
  {name: '26-flight-aborted-suspense', component: f26, ...(f26.fixture || {})},
  {name: '27-flight-deduped-component', component: f27, ...(f27.fixture || {})},
  {name: '28-flight-deduped-component', component: f28, ...(f28.fixture || {})},
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
