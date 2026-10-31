/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const babel = require('@babel/core');
const {wrap} = require('jest-snapshot-serializer-raw');
const freshPlugin = require('react-refresh/babel');

function transform(input, options = {}) {
  return wrap(
    babel.transform(input, {
      babelrc: false,
      configFile: false,
      envName: options.envName,
      plugins: [
        '@babel/syntax-jsx',
        '@babel/syntax-dynamic-import',
        [
          freshPlugin,
          {
            skipEnvCheck:
              options.skipEnvCheck === undefined ? true : options.skipEnvCheck,
            // To simplify debugging tests:
            emitFullSignatures: true,
            ...options.freshOptions,
          },
        ],
        ...(options.plugins || []),
      ],
    }).code,
  );
}

describe('ReactFreshBabelPlugin', () => {
  it('registers top-level function declarations', () => {
    // Hello and Bar should be registered, handleClick shouldn't.
    expect(
      transform(`
        function Hello() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        }

        function Bar() {
          return <Hello />;
        }
    `),
    ).toMatchInlineSnapshot(`
function Hello() {
  function handleClick() {}
  return <h1 onClick={handleClick}>Hi</h1>;
}
_c = Hello;
function Bar() {
  return <Hello />;
}
_c2 = Bar;
var _c, _c2;
$RefreshReg$(_c, "Hello");
$RefreshReg$(_c2, "Bar");
`);
  });

  it('registers top-level exported function declarations', () => {
    expect(
      transform(`
        export function Hello() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        }

        export default function Bar() {
          return <Hello />;
        }

        function Baz() {
          return <h1>OK</h1>;
        }

        const NotAComp = 'hi';
        export { Baz, NotAComp };

        export function sum() {}
        export const Bad = 42;
    `),
    ).toMatchInlineSnapshot(`
export function Hello() {
  function handleClick() {}
  return <h1 onClick={handleClick}>Hi</h1>;
}
_c = Hello;
export default function Bar() {
  return <Hello />;
}
_c2 = Bar;
function Baz() {
  return <h1>OK</h1>;
}
_c3 = Baz;
const NotAComp = 'hi';
export { Baz, NotAComp };
export function sum() {}
export const Bad = 42;
var _c, _c2, _c3;
$RefreshReg$(_c, "Hello");
$RefreshReg$(_c2, "Bar");
$RefreshReg$(_c3, "Baz");
`);
  });

  it('registers top-level exported named arrow functions', () => {
    expect(
      transform(`
        export const Hello = () => {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        };

        export let Bar = (props) => <Hello />;

        export default () => {
          // This one should be ignored.
          // You should name your components.
          return <Hello />;
        };
    `),
    ).toMatchInlineSnapshot(`
export const Hello = () => {
  function handleClick() {}
  return <h1 onClick={handleClick}>Hi</h1>;
};
_c = Hello;
export let Bar = props => <Hello />;
_c2 = Bar;
export default (() => {
  // This one should be ignored.
  // You should name your components.
  return <Hello />;
});
var _c, _c2;
$RefreshReg$(_c, "Hello");
$RefreshReg$(_c2, "Bar");
`);
  });

  it('uses original function declaration if it get reassigned', () => {
    // This should register the original version.
    // TODO: in the future, we may *also* register the wrapped one.
    expect(
      transform(`
        function Hello() {
          return <h1>Hi</h1>;
        }
        Hello = connect(Hello);
    `),
    ).toMatchInlineSnapshot(`
function Hello() {
  return <h1>Hi</h1>;
}
_c = Hello;
Hello = connect(Hello);
var _c;
$RefreshReg$(_c, "Hello");
`);
  });

  it('only registers pascal case functions', () => {
    // Should not get registered.
    expect(
      transform(`
        function hello() {
          return 2 * 2;
        }
    `),
    ).toMatchInlineSnapshot(`
function hello() {
  return 2 * 2;
}
`);
  });

  it('registers top-level variable declarations with function expressions', () => {
    // Hello and Bar should be registered; handleClick, sum, Baz, and Qux shouldn't.
    expect(
      transform(`
        let Hello = function() {
          function handleClick() {}
          return <h1 onClick={handleClick}>Hi</h1>;
        };
        const Bar = function Baz() {
          return <Hello />;
        };
        function sum() {}
        let Baz = 10;
        var Qux;
    `),
    ).toMatchInlineSnapshot(`
let Hello = function () {
  function handleClick() {}
  return <h1 onClick={handleClick}>Hi</h1>;
};
_c = Hello;
const Bar = function Baz() {
  return <Hello />;
};
_c2 = Bar;
function sum() {}
let Baz = 10;
var Qux;
var _c, _c2;
$RefreshReg$(_c, "Hello");
$RefreshReg$(_c2, "Bar");
`);
  });

  it('registers top-level variable declarations with arrow functions', () => {
    // Hello, Bar, and Baz should be registered; handleClick and sum shouldn't.
    expect(
      transform(`
        let Hello = () => {
          const handleClick = () => {};
          return <h1 onClick={handleClick}>Hi</h1>;
        }
        const Bar = () => {
          return <Hello />;
        };
        var Baz = () => <div />;
        var sum = () => {};
    `),
    ).toMatchInlineSnapshot(`
let Hello = () => {
  const handleClick = () => {};
  return <h1 onClick={handleClick}>Hi</h1>;
};
_c = Hello;
const Bar = () => {
  return <Hello />;
};
_c2 = Bar;
var Baz = () => <div />;
_c3 = Baz;
var sum = () => {};
var _c, _c2, _c3;
$RefreshReg$(_c, "Hello");
$RefreshReg$(_c2, "Bar");
$RefreshReg$(_c3, "Baz");
`);
  });

  it('ignores HOC definitions', () => {
    // TODO: we might want to handle HOCs at usage site, however.
    // TODO: it would be nice if we could always avoid registering
    // a function that is known to return a function or other non-node.
    expect(
      transform(`
        let connect = () => {
          function Comp() {
            const handleClick = () => {};
            return <h1 onClick={handleClick}>Hi</h1>;
          }
          return Comp;
        };
        function withRouter() {
          return function Child() {
            const handleClick = () => {};
            return <h1 onClick={handleClick}>Hi</h1>;
          }
        };
    `),
    ).toMatchInlineSnapshot(`
let connect = () => {
  function Comp() {
    const handleClick = () => {};
    return <h1 onClick={handleClick}>Hi</h1>;
  }
  return Comp;
};
function withRouter() {
  return function Child() {
    const handleClick = () => {};
    return <h1 onClick={handleClick}>Hi</h1>;
  };
}
;
`);
  });

  it('ignores complex definitions', () => {
    expect(
      transform(`
        let A = foo ? () => {
          return <h1>Hi</h1>;
        } : null
        const B = (function Foo() {
          return <h1>Hi</h1>;
        })();
        let C = () => () => {
          return <h1>Hi</h1>;
        };
        let D = bar && (() => {
          return <h1>Hi</h1>;
        });
    `),
    ).toMatchInlineSnapshot(`
let A = foo ? () => {
  return <h1>Hi</h1>;
} : null;
const B = function Foo() {
  return <h1>Hi</h1>;
}();
let C = () => () => {
  return <h1>Hi</h1>;
};
let D = bar && (() => {
  return <h1>Hi</h1>;
});
`);
  });

  it('ignores unnamed function declarations', () => {
    expect(
      transform(`
        export default function() {}
    `),
    ).toMatchInlineSnapshot(`export default function () {}`);
  });

  it('registers likely HOCs with inline functions', () => {
    expect(
      transform(`
        const A = forwardRef(function() {
          return <h1>Foo</h1>;
        });
        const B = memo(React.forwardRef(() => {
          return <h1>Foo</h1>;
        }));
        export default React.memo(forwardRef((props, ref) => {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchInlineSnapshot(`
const A = forwardRef(_c = function () {
  return <h1>Foo</h1>;
});
_c2 = A;
const B = memo(_c4 = React.forwardRef(_c3 = () => {
  return <h1>Foo</h1>;
}));
_c5 = B;
export default _c8 = React.memo(_c7 = forwardRef(_c6 = (props, ref) => {
  return <h1>Foo</h1>;
}));
var _c, _c2, _c3, _c4, _c5, _c6, _c7, _c8;
$RefreshReg$(_c, "A$forwardRef");
$RefreshReg$(_c2, "A");
$RefreshReg$(_c3, "B$memo$React.forwardRef");
$RefreshReg$(_c4, "B$memo");
$RefreshReg$(_c5, "B");
$RefreshReg$(_c6, "%default%$React.memo$forwardRef");
$RefreshReg$(_c7, "%default%$React.memo");
$RefreshReg$(_c8, "%default%");
`);
    expect(
      transform(`
        export default React.memo(forwardRef(function (props, ref) {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchInlineSnapshot(`
export default _c3 = React.memo(_c2 = forwardRef(_c = function (props, ref) {
  return <h1>Foo</h1>;
}));
var _c, _c2, _c3;
$RefreshReg$(_c, "%default%$React.memo$forwardRef");
$RefreshReg$(_c2, "%default%$React.memo");
$RefreshReg$(_c3, "%default%");
`);
    expect(
      transform(`
        export default React.memo(forwardRef(function Named(props, ref) {
          return <h1>Foo</h1>;
        }));
    `),
    ).toMatchInlineSnapshot(`
export default _c3 = React.memo(_c2 = forwardRef(_c = function Named(props, ref) {
  return <h1>Foo</h1>;
}));
var _c, _c2, _c3;
$RefreshReg$(_c, "%default%$React.memo$forwardRef");
$RefreshReg$(_c2, "%default%$React.memo");
$RefreshReg$(_c3, "%default%");
`);
  });

  it('ignores higher-order functions that are not HOCs', () => {
    expect(
      transform(`
        const throttledAlert = throttle(function() {
          alert('Hi');
        });
        const TooComplex = (function() { return hello })(() => {});
        if (cond) {
          const Foo = thing(() => {});
        }
    `),
    ).toMatchInlineSnapshot(`
const throttledAlert = throttle(function () {
  alert('Hi');
});
const TooComplex = function () {
  return hello;
}(() => {});
if (cond) {
  const Foo = thing(() => {});
}
`);
  });

  it('registers identifiers used in JSX at definition site', () => {
    // When in doubt, register variables that were used in JSX.
    // Foo, Header, and B get registered.
    // A doesn't get registered because it's not declared locally.
    // Alias doesn't get registered because its definition is just an identifier.
    expect(
      transform(`
        import A from './A';
        import Store from './Store';

        Store.subscribe();

        const Header = styled.div\`color: red\`
        const StyledFactory1 = styled('div')\`color: hotpink\`
        const StyledFactory2 = styled('div')({ color: 'hotpink' })
        const StyledFactory3 = styled(A)({ color: 'hotpink' })
        const FunnyFactory = funny.factory\`\`;

        let Alias1 = A;
        let Alias2 = A.Foo;
        const Dict = {};

        function Foo() {
          return (
            <div><A /><B /><StyledFactory1 /><StyledFactory2 /><StyledFactory3 /><Alias1 /><Alias2 /><Header /><Dict.X /></div>
          );
        }

        const B = hoc(A);
        // This is currently registered as a false positive:
        const NotAComponent = wow(A);
        // We could avoid it but it also doesn't hurt.
    `),
    ).toMatchInlineSnapshot(`
import A from './A';
import Store from './Store';
Store.subscribe();
const Header = styled.div\`color: red\`;
_c = Header;
const StyledFactory1 = styled('div')\`color: hotpink\`;
_c2 = StyledFactory1;
const StyledFactory2 = styled('div')({
  color: 'hotpink'
});
_c3 = StyledFactory2;
const StyledFactory3 = styled(A)({
  color: 'hotpink'
});
_c4 = StyledFactory3;
const FunnyFactory = funny.factory\`\`;
let Alias1 = A;
let Alias2 = A.Foo;
const Dict = {};
function Foo() {
  return <div><A /><B /><StyledFactory1 /><StyledFactory2 /><StyledFactory3 /><Alias1 /><Alias2 /><Header /><Dict.X /></div>;
}
_c5 = Foo;
const B = hoc(A);
// This is currently registered as a false positive:
_c6 = B;
const NotAComponent = wow(A);
// We could avoid it but it also doesn't hurt.
_c7 = NotAComponent;
var _c, _c2, _c3, _c4, _c5, _c6, _c7;
$RefreshReg$(_c, "Header");
$RefreshReg$(_c2, "StyledFactory1");
$RefreshReg$(_c3, "StyledFactory2");
$RefreshReg$(_c4, "StyledFactory3");
$RefreshReg$(_c5, "Foo");
$RefreshReg$(_c6, "B");
$RefreshReg$(_c7, "NotAComponent");
`);
  });

  it('registers identifiers used in React.createElement at definition site', () => {
    // When in doubt, register variables that were used in JSX.
    // Foo, Header, and B get registered.
    // A doesn't get registered because it's not declared locally.
    // Alias doesn't get registered because its definition is just an identifier.
    expect(
      transform(`
        import A from './A';
        import Store from './Store';

        Store.subscribe();

        const Header = styled.div\`color: red\`
        const StyledFactory1 = styled('div')\`color: hotpink\`
        const StyledFactory2 = styled('div')({ color: 'hotpink' })
        const StyledFactory3 = styled(A)({ color: 'hotpink' })
        const FunnyFactory = funny.factory\`\`;

        let Alias1 = A;
        let Alias2 = A.Foo;
        const Dict = {};

        function Foo() {
          return [
            React.createElement(A),
            React.createElement(B),
            React.createElement(StyledFactory1),
            React.createElement(StyledFactory2),
            React.createElement(StyledFactory3),
            React.createElement(Alias1),
            React.createElement(Alias2),
            jsx(Header),
            React.createElement(Dict.X),
          ];
        }

        React.createContext(Store);

        const B = hoc(A);
        // This is currently registered as a false positive:
        const NotAComponent = wow(A);
        // We could avoid it but it also doesn't hurt.
    `),
    ).toMatchInlineSnapshot(`
import A from './A';
import Store from './Store';
Store.subscribe();
const Header = styled.div\`color: red\`;
_c = Header;
const StyledFactory1 = styled('div')\`color: hotpink\`;
_c2 = StyledFactory1;
const StyledFactory2 = styled('div')({
  color: 'hotpink'
});
_c3 = StyledFactory2;
const StyledFactory3 = styled(A)({
  color: 'hotpink'
});
_c4 = StyledFactory3;
const FunnyFactory = funny.factory\`\`;
let Alias1 = A;
let Alias2 = A.Foo;
const Dict = {};
function Foo() {
  return [React.createElement(A), React.createElement(B), React.createElement(StyledFactory1), React.createElement(StyledFactory2), React.createElement(StyledFactory3), React.createElement(Alias1), React.createElement(Alias2), jsx(Header), React.createElement(Dict.X)];
}
_c5 = Foo;
React.createContext(Store);
const B = hoc(A);
// This is currently registered as a false positive:
_c6 = B;
const NotAComponent = wow(A);
// We could avoid it but it also doesn't hurt.
_c7 = NotAComponent;
var _c, _c2, _c3, _c4, _c5, _c6, _c7;
$RefreshReg$(_c, "Header");
$RefreshReg$(_c2, "StyledFactory1");
$RefreshReg$(_c3, "StyledFactory2");
$RefreshReg$(_c4, "StyledFactory3");
$RefreshReg$(_c5, "Foo");
$RefreshReg$(_c6, "B");
$RefreshReg$(_c7, "NotAComponent");
`);
  });

  it('registers capitalized identifiers in HOC calls', () => {
    expect(
      transform(`
        function Foo() {
          return <h1>Hi</h1>;
        }

        export default hoc(Foo);
        export const A = hoc(Foo);
        const B = hoc(Foo);
    `),
    ).toMatchInlineSnapshot(`
function Foo() {
  return <h1>Hi</h1>;
}
_c = Foo;
export default _c2 = hoc(Foo);
export const A = hoc(Foo);
_c3 = A;
const B = hoc(Foo);
_c4 = B;
var _c, _c2, _c3, _c4;
$RefreshReg$(_c, "Foo");
$RefreshReg$(_c2, "%default%");
$RefreshReg$(_c3, "A");
$RefreshReg$(_c4, "B");
`);
  });

  it('generates signatures for function declarations calling hooks', () => {
    // store-semantics: use(store) doesn't match the Hook naming convention
    // (use[A-Z]), so the plugin leaves it out of the signature.
    expect(
      transform(`
        export default function App() {
          const foo = use(fooStore);
          React.useEffect(() => {});
          return <h1>{foo}</h1>;
        }
    `),
    ).toMatchInlineSnapshot(`
var _s = $RefreshSig$();
export default function App() {
  _s();
  const foo = use(fooStore);
  React.useEffect(() => {});
  return <h1>{foo}</h1>;
}
_s(App, "useEffect{}");
_c = App;
var _c;
$RefreshReg$(_c, "App");
`);
  });

  it('generates signatures for function expressions calling hooks', () => {
    // Unlike __register__, we want to sign all functions -- not just top level.
    // This lets us support editing HOCs better.
    // For function declarations, __signature__ is called on next line.
    // For function expressions, it wraps the expression.
    // In order for this to work, __signature__ returns its first argument.
    // store-semantics: use(store) doesn't match the Hook naming convention
    // (use[A-Z]), so the plugin leaves it out of the signature.
    expect(
      transform(`
        export const A = React.memo(React.forwardRef((props, ref) => {
          const foo = use(fooStore);
          React.useEffect(() => {});
          return <h1 ref={ref}>{foo}</h1>;
        }));

        export const B = React.memo(React.forwardRef(function(props, ref) {
          const foo = use(fooStore);
          React.useEffect(() => {});
          return <h1 ref={ref}>{foo}</h1>;
        }));

        function hoc() {
          return function Inner() {
            const foo = use(fooStore);
            React.useEffect(() => {});
            return <h1 ref={ref}>{foo}</h1>;
          };
        }

        export let C = hoc();
    `),
    ).toMatchInlineSnapshot(`
var _s = $RefreshSig$(),
  _s2 = $RefreshSig$();
export const A = _s(React.memo(_c2 = _s(React.forwardRef(_c = _s((props, ref) => {
  _s();
  const foo = use(fooStore);
  React.useEffect(() => {});
  return <h1 ref={ref}>{foo}</h1>;
}, "useEffect{}")), "useEffect{}")), "useEffect{}");
_c3 = A;
export const B = _s2(React.memo(_c5 = _s2(React.forwardRef(_c4 = _s2(function (props, ref) {
  _s2();
  const foo = use(fooStore);
  React.useEffect(() => {});
  return <h1 ref={ref}>{foo}</h1>;
}, "useEffect{}")), "useEffect{}")), "useEffect{}");
_c6 = B;
function hoc() {
  var _s3 = $RefreshSig$();
  return _s3(function Inner() {
    _s3();
    const foo = use(fooStore);
    React.useEffect(() => {});
    return <h1 ref={ref}>{foo}</h1>;
  }, "useEffect{}");
}
export let C = hoc();
var _c, _c2, _c3, _c4, _c5, _c6;
$RefreshReg$(_c, "A$React.memo$React.forwardRef");
$RefreshReg$(_c2, "A$React.memo");
$RefreshReg$(_c3, "A");
$RefreshReg$(_c4, "B$React.memo$React.forwardRef");
$RefreshReg$(_c5, "B$React.memo");
$RefreshReg$(_c6, "B");
`);
  });

  it('includes custom hooks into the signatures', () => {
    // store-semantics: use(store) doesn't match the Hook naming convention
    // (use[A-Z]), so the plugin leaves it out of the signature.
    expect(
      transform(`
        function useFancyState() {
          const foo = React.use(fooStore);
          useFancyEffect();
          return foo;
        }

        const useFancyEffect = () => {
          React.useEffect(() => {});
        };

        export default function App() {
          const bar = useFancyState();
          return <h1>{bar}</h1>;
        }
    `),
    ).toMatchInlineSnapshot(`
var _s = $RefreshSig$(),
  _s2 = $RefreshSig$(),
  _s3 = $RefreshSig$();
function useFancyState() {
  _s();
  const foo = React.use(fooStore);
  useFancyEffect();
  return foo;
}
_s(useFancyState, "useFancyEffect{}", false, function () {
  return [useFancyEffect];
});
const useFancyEffect = () => {
  _s2();
  React.useEffect(() => {});
};
_s2(useFancyEffect, "useEffect{}");
export default function App() {
  _s3();
  const bar = useFancyState();
  return <h1>{bar}</h1>;
}
_s3(App, "useFancyState{bar}", false, function () {
  return [useFancyState];
});
_c = App;
var _c;
$RefreshReg$(_c, "App");
`);
  });

  it('includes custom hooks into the signatures when commonjs target is used', () => {
    // this test is passing with Babel 6
    // but would fail for Babel 7 _without_ custom hook node being cloned for signature
    expect(
      transform(
        `
        import {useFancyState} from './hooks';

        export default function App() {
          const bar = useFancyState();
          return <h1>{bar}</h1>;
        }
    `,
        {
          plugins: ['@babel/transform-modules-commonjs'],
        },
      ),
    ).toMatchInlineSnapshot(`
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = App;
var _hooks = require("./hooks");
var _s = $RefreshSig$();
function App() {
  _s();
  const bar = (0, _hooks.useFancyState)();
  return <h1>{bar}</h1>;
}
_s(App, "useFancyState{bar}", false, function () {
  return [_hooks.useFancyState];
});
_c = App;
var _c;
$RefreshReg$(_c, "App");
`);
  });

  it('generates valid signature for exotic ways to call Hooks', () => {
    // store-semantics: use(store) doesn't match the Hook naming convention
    // (use[A-Z]), so the plugin leaves it out of the signature.
    expect(
      transform(`
        import FancyHook from 'fancy';

        export default function App() {
          function useFancyState() {
            const foo = React.use(fooStore);
            useFancyEffect();
            return foo;
          }
          const bar = useFancyState();
          const baz = FancyHook.useThing();
          React.use(store);
          useThePlatform();
          return <h1>{bar}{baz}</h1>;
        }
    `),
    ).toMatchInlineSnapshot(`
var _s2 = $RefreshSig$();
import FancyHook from 'fancy';
export default function App() {
  _s2();
  var _s = $RefreshSig$();
  function useFancyState() {
    _s();
    const foo = React.use(fooStore);
    useFancyEffect();
    return foo;
  }
  _s(useFancyState, "useFancyEffect{}", true);
  const bar = useFancyState();
  const baz = FancyHook.useThing();
  React.use(store);
  useThePlatform();
  return <h1>{bar}{baz}</h1>;
}
_s2(App, "useFancyState{bar}\\nuseThing{baz}\\nuseThePlatform{}", true, function () {
  return [FancyHook.useThing];
});
_c = App;
var _c;
$RefreshReg$(_c, "App");
`);
  });

  it('does not consider require-like methods to be HOCs', () => {
    // None of these were declared in this file.
    // It's bad to register them because that would trigger
    // modules to execute in an environment with inline requires.
    // So we expect the transform to skip all of them even though
    // they are used in JSX.
    expect(
      transform(`
        const A = require('A');
        const B = foo ? require('X') : require('Y');
        const C = requireCond(gk, 'C');
        const D = import('D');

        export default function App() {
          return (
            <div>
              <A />
              <B />
              <C />
              <D />
            </div>
          );
        }
    `),
    ).toMatchInlineSnapshot(`
const A = require('A');
const B = foo ? require('X') : require('Y');
const C = requireCond(gk, 'C');
const D = import('D');
export default function App() {
  return <div>
              <A />
              <B />
              <C />
              <D />
            </div>;
}
_c = App;
var _c;
$RefreshReg$(_c, "App");
`);
  });

  it('can handle implicit arrow returns', () => {
    expect(
      transform(`
        export default () => useContext(X);
        export const Foo = () => useContext(X);
        module.exports = () => useContext(X);
        const Bar = () => useContext(X);
        const Baz = memo(() => useContext(X));
        const Qux = () => (0, useContext(X));
      `),
    ).toMatchInlineSnapshot(`
var _s = $RefreshSig$(),
  _s2 = $RefreshSig$(),
  _s3 = $RefreshSig$(),
  _s4 = $RefreshSig$(),
  _s5 = $RefreshSig$(),
  _s6 = $RefreshSig$();
export default _s(() => {
  _s();
  return useContext(X);
}, "useContext{}");
export const Foo = () => {
  _s2();
  return useContext(X);
};
_s2(Foo, "useContext{}");
_c = Foo;
module.exports = _s3(() => {
  _s3();
  return useContext(X);
}, "useContext{}");
const Bar = () => {
  _s4();
  return useContext(X);
};
_s4(Bar, "useContext{}");
_c2 = Bar;
const Baz = _s5(memo(_c3 = _s5(() => {
  _s5();
  return useContext(X);
}, "useContext{}")), "useContext{}");
_c4 = Baz;
const Qux = () => {
  _s6();
  return 0, useContext(X);
};
_s6(Qux, "useContext{}");
_c5 = Qux;
var _c, _c2, _c3, _c4, _c5;
$RefreshReg$(_c, "Foo");
$RefreshReg$(_c2, "Bar");
$RefreshReg$(_c3, "Baz$memo");
$RefreshReg$(_c4, "Baz");
$RefreshReg$(_c5, "Qux");
`);
  });

  it('uses custom identifiers for $RefreshReg$ and $RefreshSig$', () => {
    expect(
      transform(
        `export default function Bar () {
        useContext(X)
        return <Foo />
      };`,
        {
          freshOptions: {
            refreshReg: 'import.meta.refreshReg',
            refreshSig: 'import.meta.refreshSig',
          },
        },
      ),
    ).toMatchInlineSnapshot(`
var _s = import.meta.refreshSig();
export default function Bar() {
  _s();
  useContext(X);
  return <Foo />;
}
_s(Bar, "useContext{}");
_c = Bar;
;
var _c;
import.meta.refreshReg(_c, "Bar");
`);
  });

  it("respects Babel's envName option", () => {
    const envName = 'random';
    expect(() =>
      transform(`export default function BabelEnv () { return null };`, {
        envName,
        skipEnvCheck: false,
      }),
    ).toThrow(
      'React Refresh Babel transform should only be enabled in development environment. ' +
        'Instead, the environment is: "' +
        envName +
        '". If you want to override this check, pass {skipEnvCheck: true} as plugin options.',
    );
  });

  it('does not get tripped by IIFEs', () => {
    expect(
      transform(`
        while (item) {
          (item => {
            useFoo();
          })(item);
        }
      `),
    ).toMatchInlineSnapshot(`
while (item) {
  var _s = $RefreshSig$();
  _s(item => {
    _s();
    useFoo();
  }, "useFoo{}", true)(item);
}
`);
  });

  it('supports typescript namespace syntax', () => {
    expect(
      transform(
        `
        namespace Foo {
          export namespace Bar {
            export const A = () => {};

            function B() {};
            export const B1 = B;
          }

          export const C = () => {};
          export function D() {};

          namespace NotExported {
            export const E = () => {};
          }
        }
      `,
        {plugins: [['@babel/plugin-syntax-typescript', {isTSX: true}]]},
      ),
    ).toMatchInlineSnapshot(`
namespace Foo {
  export namespace Bar {
    export const A = () => {};
    _c = A;
    function B() {}
    _c2 = B;
    ;
    export const B1 = B;
  }
  export const C = () => {};
  _c3 = C;
  export function D() {}
  _c4 = D;
  ;
  namespace NotExported {
    export const E = () => {};
  }
}
var _c, _c2, _c3, _c4;
$RefreshReg$(_c, "Foo$Bar$A");
$RefreshReg$(_c2, "Foo$Bar$B");
$RefreshReg$(_c3, "Foo$C");
$RefreshReg$(_c4, "Foo$D");
`);
  });
});
