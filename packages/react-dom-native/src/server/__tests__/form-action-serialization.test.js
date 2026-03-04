'use strict';

var React = require('react');
var NativeFizzConfig = require('../NativeFizzConfig');

// Test that Fizz serializes server reference actions in form instructions
describe('form action serialization', () => {
  var renderToInstructions;

  beforeEach(() => {
    // Helper to render an element through Fizz and collect instructions
    var {PassThrough} = require('stream');
    var {renderToPipeableStream} = require('../NativeFizzServerNode');

    renderToInstructions = function(element) {
      return new Promise(function(resolve, reject) {
        var chunks = [];
        var stream = renderToPipeableStream(element, {
          onShellReady: function() {
            var passThrough = new PassThrough();
            stream.pipe(passThrough);
            passThrough.on('data', function(chunk) {
              chunks.push(chunk.toString());
            });
            passThrough.on('end', function() {
              var instructions = [];
              chunks.join('').split('\n').forEach(function(line) {
                if (line.trim()) {
                  try {
                    instructions.push(JSON.parse(line));
                  } catch (e) {}
                }
              });
              resolve(instructions);
            });
          },
          onShellError: reject,
        });
      });
    };
  });

  it('serializes server reference action in form instructions', async () => {
    // Create a mock server reference with $$FORM_ACTION
    var action = function() {};
    action.$$FORM_ACTION = function(prefix) {
      return {
        name: '$ACTION_ID_test-module#testAction',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: new FormData(),
      };
    };

    var element = React.createElement('form', {action: action},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]._actionId).toBe('$ACTION_ID_test-module#testAction');
  });

  it('serializes server reference action with bound args in _actionData', async () => {
    var action = function() {};
    action.$$FORM_ACTION = function(prefix) {
      var data = new FormData();
      data.append('$ACTION_ID_mod#act', '');
      data.append('$ACTION_REF_1', 'bound-value');
      return {
        name: '$ACTION_ID_mod#act',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: data,
      };
    };

    var element = React.createElement('form', {action: action},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]._actionId).toBe('$ACTION_ID_mod#act');
    expect(openForm[2]._actionData).toBeDefined();
    expect(openForm[2]._actionData['$ACTION_ID_mod#act']).toBe('');
    expect(openForm[2]._actionData['$ACTION_REF_1']).toBe('bound-value');
  });

  it('strips client-only function actions for SSR', async () => {
    var action = function() {}; // No $$FORM_ACTION = client-only

    var element = React.createElement('form', {action: action},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    // action should be stripped (not serialized as a function)
    expect(openForm[2]).toBeUndefined();
  });

  it('passes through string action prop unchanged', async () => {
    var element = React.createElement('form', {action: '/api/submit'},
      React.createElement('button', {type: 'submit'}, 'Submit')
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/api/submit'});
  });

  it('serializes button formAction server reference with _formActionId', async () => {
    var formAction = function() {};
    formAction.$$FORM_ACTION = function(prefix) {
      var data = new FormData();
      data.append('$ACTION_ID_btn#submit', '');
      return {
        name: '$ACTION_ID_btn#submit',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: data,
      };
    };

    var element = React.createElement('button', {formAction: formAction}, 'Submit');
    var instructions = await renderToInstructions(element);
    var openButton = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'button';
    });
    expect(openButton).toBeDefined();
    expect(openButton[2]._formActionId).toBe('$ACTION_ID_btn#submit');
    expect(openButton[2]._formActionData).toBeDefined();
    expect(openButton[2]._formActionData['$ACTION_ID_btn#submit']).toBe('');
  });

  it('serializes input formAction server reference with _formActionId', async () => {
    var formAction = function() {};
    formAction.$$FORM_ACTION = function(prefix) {
      var data = new FormData();
      data.append('$ACTION_ID_inp#submit', '');
      return {
        name: '$ACTION_ID_inp#submit',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: data,
      };
    };

    var element = React.createElement('input', {type: 'submit', formAction: formAction});
    var instructions = await renderToInstructions(element);
    var openInput = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'input';
    });
    expect(openInput).toBeDefined();
    expect(openInput[2]._formActionId).toBe('$ACTION_ID_inp#submit');
    expect(openInput[2]._formActionData).toBeDefined();
    expect(openInput[2]._formActionData['$ACTION_ID_inp#submit']).toBe('');
  });

  it('strips client-only formAction function on button', async () => {
    var formAction = function() {}; // No $$FORM_ACTION

    var element = React.createElement('button', {formAction: formAction}, 'Submit');
    var instructions = await renderToInstructions(element);
    var openButton = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'button';
    });
    expect(openButton).toBeDefined();
    // formAction should be stripped, and no other props remain
    expect(openButton[2]).toBeUndefined();
  });

  it('emits FSM true and false instructions for form state markers', () => {
    var target = [];
    NativeFizzConfig.pushFormStateMarkerIsMatching(target);
    expect(JSON.parse(target[0])).toEqual(['FSM', true]);

    var target2 = [];
    NativeFizzConfig.pushFormStateMarkerIsNotMatching(target2);
    expect(JSON.parse(target2[0])).toEqual(['FSM', false]);
  });

  it('createResumableState includes nextFormID starting at 0', () => {
    var state = NativeFizzConfig.createResumableState();
    expect(state.nextFormID).toBe(0);
    expect(state.idPrefix).toBe('');
  });

  it('createResumableState with identifier prefix', () => {
    var state = NativeFizzConfig.createResumableState('pfx_');
    expect(state.idPrefix).toBe('pfx_');
  });

  it('multiple forms get unique prefixes (nextFormID increments)', async () => {
    var prefixesSeen = [];

    var action1 = function() {};
    action1.$$FORM_ACTION = function(prefix) {
      prefixesSeen.push(prefix);
      var data = new FormData();
      data.append(prefix + '_ACTION_ID', '');
      return {
        name: prefix + '_ACTION_ID',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: data,
      };
    };

    var action2 = function() {};
    action2.$$FORM_ACTION = function(prefix) {
      prefixesSeen.push(prefix);
      var data = new FormData();
      data.append(prefix + '_ACTION_ID', '');
      return {
        name: prefix + '_ACTION_ID',
        action: '',
        encType: 'multipart/form-data',
        method: 'POST',
        target: '',
        data: data,
      };
    };

    var element = React.createElement('div', null,
      React.createElement('form', {action: action1},
        React.createElement('button', {type: 'submit'}, 'Form 1')
      ),
      React.createElement('form', {action: action2},
        React.createElement('button', {type: 'submit'}, 'Form 2')
      )
    );
    var instructions = await renderToInstructions(element);
    var formInstructions = instructions.filter(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(formInstructions.length).toBe(2);
    // Each form should get a different prefix
    expect(prefixesSeen.length).toBe(2);
    expect(prefixesSeen[0]).not.toBe(prefixesSeen[1]);
  });

  it('non-form elements are unaffected', async () => {
    var element = React.createElement('div', null,
      React.createElement('span', null, 'hello')
    );
    var instructions = await renderToInstructions(element);
    var openDiv = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'div';
    });
    expect(openDiv).toBeDefined();
    // No props on div since it has no attributes
    expect(openDiv[2]).toBeUndefined();

    var openSpan = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'span';
    });
    expect(openSpan).toBeDefined();
    expect(openSpan[2]).toBeUndefined();

    // No _actionId or _actionData anywhere
    instructions.forEach(function(i) {
      if (i[2] && typeof i[2] === 'object') {
        expect(i[2]._actionId).toBeUndefined();
        expect(i[2]._actionData).toBeUndefined();
      }
    });
  });

  it('form with no action prop renders normally', async () => {
    var element = React.createElement('form', null,
      React.createElement('input', {type: 'text'})
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function(i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    // No props on form
    expect(openForm[2]).toBeUndefined();
    // No _actionId or _actionData
    if (openForm[2]) {
      expect(openForm[2]._actionId).toBeUndefined();
      expect(openForm[2]._actionData).toBeUndefined();
    }
  });
});
