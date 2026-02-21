'use strict';

let messages = [];
global.$$sendInspectorMessage = jest.fn(function (json) {
  messages.push(JSON.parse(json));
});
global.$$performanceNow = () => 5000; // 5000ms

describe('NetworkAgent', () => {
  let originalFetch;

  beforeEach(() => {
    messages = [];
    global.$$sendInspectorMessage.mockClear();
    jest.resetModules();

    // Save original fetch (if any) and install mock
    originalFetch = global.fetch;
    global.fetch = jest.fn(function () {
      return Promise.resolve({
        status: 200,
        statusText: 'OK',
        headers: {
          get: function () { return 'application/json'; },
          entries: function () {
            var items = [['content-type', 'application/json']];
            var idx = 0;
            return {
              next: function () {
                if (idx < items.length) return {done: false, value: items[idx++]};
                return {done: true};
              },
            };
          },
        },
        text: function () { return Promise.resolve('{"ok":true}'); },
      });
    });

    require('../NetworkAgent');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('intercepted fetch emits requestWillBeSent', async () => {
    await fetch('https://example.com/api');

    const requestMsg = messages.find(
      function (m) { return m.type === 'cdp-event' && m.method === 'Network.requestWillBeSent'; },
    );
    expect(requestMsg).toBeDefined();
    expect(requestMsg.params.request.url).toBe('https://example.com/api');
    expect(requestMsg.params.request.method).toBe('GET');
    expect(requestMsg.params.initiator.type).toBe('script');
  });

  test('intercepted fetch emits responseReceived', async () => {
    await fetch('https://example.com/api');

    const responseMsg = messages.find(
      function (m) { return m.type === 'cdp-event' && m.method === 'Network.responseReceived'; },
    );
    expect(responseMsg).toBeDefined();
    expect(responseMsg.params.response.status).toBe(200);
    expect(responseMsg.params.response.url).toBe('https://example.com/api');
  });

  test('intercepted fetch emits loadingFinished', async () => {
    await fetch('https://example.com/api');

    const finishMsg = messages.find(
      function (m) { return m.type === 'cdp-event' && m.method === 'Network.loadingFinished'; },
    );
    expect(finishMsg).toBeDefined();
    expect(finishMsg.params.requestId).toBeDefined();
  });

  test('fetch with POST method is captured', async () => {
    await fetch('https://example.com/submit', {method: 'POST', body: '{"data":1}'});

    const requestMsg = messages.find(
      function (m) { return m.type === 'cdp-event' && m.method === 'Network.requestWillBeSent'; },
    );
    expect(requestMsg.params.request.method).toBe('POST');
    expect(requestMsg.params.request.postData).toBe('{"data":1}');
  });

  test('fetch error emits loadingFailed', async () => {
    // Replace mock fetch with one that rejects
    var wrappedFetch = global.fetch; // The NetworkAgent-wrapped version
    // We need to make the original (inner) fetch fail
    // Reset and install a failing mock
    jest.resetModules();
    global.fetch = jest.fn(function () {
      return Promise.reject(new Error('network error'));
    });
    messages = [];
    global.$$sendInspectorMessage.mockClear();
    require('../NetworkAgent');

    try {
      await fetch('https://example.com/fail');
    } catch (e) {
      // Expected
    }

    const failMsg = messages.find(
      function (m) { return m.type === 'cdp-event' && m.method === 'Network.loadingFailed'; },
    );
    expect(failMsg).toBeDefined();
    expect(failMsg.params.errorText).toContain('network error');
  });

  test('requestIds are sequential', async () => {
    await fetch('https://example.com/a');
    await fetch('https://example.com/b');

    const requests = messages.filter(
      function (m) { return m.method === 'Network.requestWillBeSent'; },
    );
    expect(requests.length).toBe(2);
    expect(requests[0].params.requestId).not.toBe(requests[1].params.requestId);
  });
});
