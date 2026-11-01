// Builds the shipped reports from their hand-written sources:
//
//   docs/use-store/src/<page>.src.html  ->  docs/use-store/<page>.html
//
//   node docs/use-store/tools/build-docs.mjs            build every page
//   node docs/use-store/tools/build-docs.mjs --check    fail if an output is stale
//
// Options: --src=<dir> --out=<dir> --data=<bench-data.json>
//          --generators=<charts.mjs> --pages=explainer,benchmark-report
//          --no-demos (don't rebuild the explainers' generated scripts)
//
// In order, it:
//   1. fills <!-- gen:NAME {args} -->…<!-- /gen:NAME --> (or <!-- gen:NAME /-->)
//      with generators[NAME](data, {page, args}) from tools/charts.mjs. The
//      markers stay in the output. Built in:
//        gen:code:<path>[#Function]  a code block (code-examples.mjs block()).
//          <path> starts at the repo root if it starts with fixtures/ or
//          packages/, otherwise at src/. Bench sources lose their counting
//          instrumentation and are formatted, as in code-examples.mjs.
//          Args: marks, bad, notes (as block()), compiled (run the React
//          Compiler first), width (prettier printWidth), format.
//        gen:sandbox-build  what the sandboxes run (from vendor/VERSIONS.json)
//   2. fills <span data-n="key"></span> with values[key].display from
//      data/bench-data.json.
//   3. inlines the code of <div class="sandbox" data-src="file.jsx"></div>
//      (src/-relative) as <script type="text/plain">, adds data-steps when
//      file.steps.json exists, and with data-compile="react-compiler" runs the
//      React Compiler on it first.
//   4. adds sandbox/host.css, sandbox/host.js and sandbox/code.css to <head>
//      when the page needs them.
// Anything it can't resolve (an unknown generator, a missing key or file) is
// an error. Nothing is left half-filled.

import {createRequire} from 'module';
import {fileURLToPath, pathToFileURL} from 'url';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, '..');
const repo = path.resolve(docs, '../..');
const compilerPath = path.join(
  repo,
  'compiler/packages/babel-plugin-react-compiler/dist/index.js',
);

function option(args, name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

// ---------------------------------------------------------------- inputs

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function loadGenerators(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  const mod = await import(pathToFileURL(file).href);
  const generators =
    mod.generators || (mod.default && mod.default.generators) || mod.default;
  if (!generators || typeof generators !== 'object') {
    throw new Error(`${file} doesn't export generators`);
  }
  return generators;
}

let codeExamples = null;
async function loadCodeExamples() {
  if (codeExamples === null) {
    codeExamples = await import(
      pathToFileURL(path.join(repo, 'fixtures/store-bench/code-examples.mjs')).href
    );
  }
  return codeExamples;
}

function compilerTransform(code, filename) {
  const babel = require(require.resolve('@babel/core', {paths: [repo]}));
  const reactCompiler = require(compilerPath);
  const errors = [];
  const result = babel.transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx']},
    plugins: [
      [
        reactCompiler,
        {
          target: '19',
          panicThreshold: 'all_errors',
          logger: {
            logEvent(_, event) {
              if (event.kind === 'CompileError') errors.push(event);
            },
          },
        },
      ],
    ],
  });
  if (errors.length > 0) {
    throw new Error(
      `React Compiler failed on ${filename}: ` +
        JSON.stringify(errors[0].detail || errors[0]),
    );
  }
  return result.code;
}

// ---------------------------------------------------------------- built-ins

function resolveSource(ref, srcDir) {
  return /^(fixtures|packages|compiler)\//.test(ref)
    ? path.join(repo, ref)
    : path.join(srcDir, ref);
}

async function codeBlock(spec, args, ctx) {
  const [ref, name] = spec.split('#');
  const file = resolveSource(ref, ctx.srcDir);
  if (!fs.existsSync(file)) {
    throw new Error(`gen:code: no file ${toPosix(path.relative(repo, file))}`);
  }
  const {block, extract, transform, format, stripInstrumentation} =
    await loadCodeExamples();
  let code = fs.readFileSync(file, 'utf8');
  const isBench = file.startsWith(path.join(repo, 'fixtures/store-bench/src/'));
  if (isBench) {
    code = transform(code, file, [stripInstrumentation]);
  }
  if (args.compiled) {
    code = compilerTransform(code, file);
  }
  if (isBench || args.compiled || args.format) {
    code = await format(code, args.width || (args.compiled ? 80 : 64));
  }
  if (name) {
    code = extract(code.endsWith('\n') ? code : code + '\n', name);
  }
  return block(code.trimEnd(), {
    marks: args.marks || [],
    bad: args.bad || [],
    notes: args.notes || {},
  });
}

function sandboxBuild(ctx) {
  const file = path.join(docs, 'vendor/VERSIONS.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      'gen:sandbox-build: no vendor/VERSIONS.json. Run tools/build-vendor.mjs.',
    );
  }
  const {react} = loadJSON(file);
  return (
    `The sandboxes run React ${escapeHTML(react.version)} ` +
    `(${escapeHTML(react.sha.slice(0, 10))}${react.dirtyAffectsBuild ? ', dirty' : ''}), ` +
    'the development build, without the React Compiler, with StrictMode off ' +
    'unless a sandbox turns it on.'
  );
}

// ---------------------------------------------------------------- passes

const GEN_OPEN = /<!--\s*gen:(\S+?)(?:\s+(\{[\s\S]*?\}))?\s*(\/?)-->/g;

async function fillGenerated(html, ctx) {
  let out = '';
  let index = 0;
  GEN_OPEN.lastIndex = 0;
  let m;
  while ((m = GEN_OPEN.exec(html)) !== null) {
    const [opener, name, json, selfClosing] = m;
    const where = `${ctx.page}:${lineOf(html, m.index)}`;
    let end = m.index + opener.length;
    if (!selfClosing) {
      const close = new RegExp(
        `<!--\\s*/gen:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`,
        'g',
      );
      close.lastIndex = end;
      const c = close.exec(html);
      if (c === null) {
        throw new Error(`${where}: <!-- gen:${name} --> has no <!-- /gen:${name} -->`);
      }
      end = c.index + c[0].length;
    }
    let args = {};
    if (json) {
      try {
        args = JSON.parse(json);
      } catch (error) {
        throw new Error(`${where}: bad JSON args for gen:${name}: ${error.message}`);
      }
    }
    let generated;
    try {
      if (name.startsWith('code:')) {
        generated = await codeBlock(name.slice(5), args, ctx);
      } else if (name === 'sandbox-build') {
        generated = sandboxBuild(ctx);
      } else {
        if (ctx.generators === null) {
          throw new Error(`no generators module (${toPosix(path.relative(repo, ctx.generatorsFile))})`);
        }
        const generator = ctx.generators[name];
        if (typeof generator !== 'function') {
          throw new Error(
            `unknown generator. Known: ${Object.keys(ctx.generators).sort().join(', ')}`,
          );
        }
        generated = await generator(ctx.data(), {page: ctx.page, args});
        if (typeof generated !== 'string') {
          throw new Error('the generator returned ' + typeof generated);
        }
      }
    } catch (error) {
      throw new Error(`${where}: gen:${name}: ${error.message}`);
    }
    const openTag = `<!-- gen:${name}${json ? ' ' + json : ''} -->`;
    out += html.slice(index, m.index) + openTag + generated + `<!-- /gen:${name} -->`;
    index = end;
    GEN_OPEN.lastIndex = end;
  }
  return out + html.slice(index);
}

const DATA_N = /(<span\b[^>]*\bdata-n="([^"]+)"[^>]*>)([\s\S]*?)(<\/span>)/g;

function fillNumbers(html, ctx) {
  const missing = [];
  const result = html.replace(DATA_N, (match, open, key, inner, close, offset) => {
    if (/<span\b/.test(inner)) {
      missing.push(`${ctx.page}:${lineOf(html, offset)}: data-n="${key}" can't contain another span`);
      return match;
    }
    const values = ctx.data().values || {};
    const entry = values[key];
    if (!entry || entry.display === undefined) {
      missing.push(`${ctx.page}:${lineOf(html, offset)}: no display value for data-n="${key}"`);
      return match;
    }
    return open + escapeHTML(entry.display) + close;
  });
  if (missing.length > 0) {
    throw new Error(missing.join('\n'));
  }
  return result;
}

const SANDBOX_OPEN = /<div\b([^>]*)>/g;

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function escapeScript(code) {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

async function inlineSandboxes(html, ctx) {
  let out = '';
  let index = 0;
  const ids = new Set();
  SANDBOX_OPEN.lastIndex = 0;
  let m;
  while ((m = SANDBOX_OPEN.exec(html)) !== null) {
    let attrs = m[1];
    const cls = attr(attrs, 'class');
    if (cls === null || !cls.split(/\s+/).includes('sandbox')) continue;
    const where = `${ctx.page}:${lineOf(html, m.index)}`;
    const id = attr(attrs, 'id');
    if (!id) throw new Error(`${where}: a sandbox needs an id`);
    if (ids.has(id)) throw new Error(`${where}: two sandboxes have the id ${id}`);
    ids.add(id);
    const src = attr(attrs, 'data-src');
    if (src === null) continue;
    const closeAt = html.indexOf('</div>', m.index + m[0].length);
    if (closeAt === -1 || html.slice(m.index + m[0].length, closeAt).trim() !== '') {
      throw new Error(`${where}: a sandbox with data-src must be empty in the source`);
    }
    const file = resolveSource(src, ctx.srcDir);
    if (!fs.existsSync(file)) {
      throw new Error(`${where}: no file ${toPosix(path.relative(repo, file))}`);
    }
    let code = fs.readFileSync(file, 'utf8');
    if (attr(attrs, 'data-compile') === 'react-compiler') {
      const {format} = await loadCodeExamples();
      code = await format(compilerTransform(code, file), 80);
    } else if (attr(attrs, 'data-compile') !== null) {
      throw new Error(`${where}: unknown data-compile`);
    }
    const steps = file.replace(/\.[jt]sx?$/, '') + '.steps.json';
    if (attr(attrs, 'data-steps') === null && fs.existsSync(steps)) {
      // Validate it here, so a broken steps file fails the build, not G3.
      try {
        loadJSON(steps);
      } catch (error) {
        throw new Error(`${where}: ${path.basename(steps)}: ${error.message}`);
      }
      attrs += ` data-steps="${escapeHTML(toPosix(path.relative(ctx.outDir, steps)))}"`;
    }
    out +=
      html.slice(index, m.index) +
      `<div${attrs}>\n<script type="text/plain">\n${escapeScript(code.trimEnd())}\n</script>\n</div>`;
    index = closeAt + '</div>'.length;
    SANDBOX_OPEN.lastIndex = index;
  }
  return out + html.slice(index);
}

function addHead(html, ctx) {
  const rel = file => toPosix(path.relative(ctx.outDir, path.join(docs, file)));
  const tags = [];
  if (/<div\b[^>]*\bclass="[^"]*\bsandbox\b/.test(html)) {
    if (!html.includes('sandbox/host.css')) {
      tags.push(`<link rel="stylesheet" href="${rel('sandbox/host.css')}">`);
    }
    if (!html.includes('sandbox/host.js')) {
      tags.push(`<script src="${rel('sandbox/host.js')}" defer></script>`);
    }
  }
  if (html.includes('<!-- gen:code:') && !html.includes('sandbox/code.css')) {
    tags.push(`<link rel="stylesheet" href="${rel('sandbox/code.css')}">`);
  }
  if (tags.length > 0) {
    if (!html.includes('</head>')) {
      throw new Error(`${ctx.page}: no </head> to add ${tags.join(' ')} to`);
    }
    html = html.replace('</head>', tags.join('\n') + '\n</head>');
  }
  const banner =
    `<!-- Generated by docs/use-store/tools/build-docs.mjs from ` +
    `${toPosix(path.relative(docs, ctx.srcFile))}. Edit the source, not this file. -->`;
  return html.replace(/^(<!doctype html>\s*)?/i, doctype => doctype + banner + '\n');
}

// ---------------------------------------------------------------- main

export async function buildPage(srcFile, options) {
  const page = path.basename(srcFile).replace(/\.src\.html$/, '');
  let data = null;
  const ctx = {
    page,
    srcFile,
    srcDir: options.srcDir,
    outDir: options.outDir,
    generators: options.generators,
    generatorsFile: options.generatorsFile,
    data() {
      if (data === null) {
        if (!fs.existsSync(options.dataFile)) {
          throw new Error(`no ${toPosix(path.relative(repo, options.dataFile))}`);
        }
        data = loadJSON(options.dataFile);
      }
      return data;
    },
  };
  let html = fs.readFileSync(srcFile, 'utf8');
  html = await fillGenerated(html, ctx);
  html = fillNumbers(html, ctx);
  html = await inlineSandboxes(html, ctx);
  html = addHead(html, ctx);
  return {page, html, outFile: path.join(options.outDir, page + '.html')};
}

export async function buildDocs(args = process.argv.slice(2)) {
  const srcDir = path.resolve(option(args, 'src', path.join(docs, 'src')));
  const outDir = path.resolve(option(args, 'out', docs));
  const dataFile = path.resolve(option(args, 'data', path.join(docs, 'data/bench-data.json')));
  const generatorsFile = path.resolve(
    option(args, 'generators', path.join(docs, 'tools/charts.mjs')),
  );
  const check = args.includes('--check');
  const only = option(args, 'pages', null);

  let pages = fs.existsSync(srcDir)
    ? fs.readdirSync(srcDir).filter(f => f.endsWith('.src.html'))
    : [];
  if (only !== null) {
    const wanted = only.split(',');
    const unknown = wanted.filter(p => !pages.includes(p + '.src.html'));
    if (unknown.length > 0) {
      throw new Error(`No source for ${unknown.join(', ')} in ${toPosix(path.relative(repo, srcDir))}`);
    }
    pages = wanted.map(p => p + '.src.html');
  }
  if (pages.length === 0) {
    throw new Error(`No *.src.html in ${toPosix(path.relative(repo, srcDir))}`);
  }

  const generators = await loadGenerators(generatorsFile);

  // Pages with interactive explainers need their generated scripts
  // (sandbox/explainers/generated/, from src/demos/build-demos.mjs) to be
  // current. --check only compares, so it doesn't rebuild them.
  const demos = path.join(docs, 'src/demos/build-demos.mjs');
  const needsDemos = pages.some(file =>
    fs.readFileSync(path.join(srcDir, file), 'utf8').includes('data-explainer'),
  );
  if (needsDemos && !check && !args.includes('--no-demos') && fs.existsSync(demos)) {
    const {buildDemos} = await import(pathToFileURL(demos).href);
    await buildDemos({log: () => {}});
    console.log('built  docs/use-store/sandbox/explainers/generated/ (buildDemos)');
  }

  const stale = [];
  for (const file of pages) {
    const built = await buildPage(path.join(srcDir, file), {
      srcDir,
      outDir,
      dataFile,
      generators,
      generatorsFile,
    });
    const rel = toPosix(path.relative(repo, built.outFile));
    if (check) {
      const current = fs.existsSync(built.outFile) ? fs.readFileSync(built.outFile, 'utf8') : null;
      if (current !== built.html) {
        const a = (current || '').split('\n');
        const b = built.html.split('\n');
        let line = 0;
        while (line < a.length && a[line] === b[line]) line++;
        stale.push(`${rel} differs from a fresh build at line ${line + 1}`);
      } else {
        console.log(`ok     ${rel}`);
      }
    } else {
      fs.mkdirSync(path.dirname(built.outFile), {recursive: true});
      fs.writeFileSync(built.outFile, built.html);
      console.log(`built  ${rel} (${(built.html.length / 1024).toFixed(0)} KB)`);
    }
  }
  if (stale.length > 0) {
    throw new Error(stale.join('\n') + '\nRun node docs/use-store/tools/build-docs.mjs');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDocs().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
