'use strict';

// ---------------------------------------------------------------------------
// Source Map Resolver
//
// Loads webpack-generated .map files and resolves bundled source locations
// (bundle.js:12345:67) back to original file paths and line numbers.
//
// Used by the inspector proxy to translate stack frames in CDP messages
// (console errors, uncaught exceptions, Runtime.evaluate errors) before
// they reach Chrome DevTools.
// ---------------------------------------------------------------------------

const {SourceMapConsumer} = require('source-map');
const fs = require('fs');
const path = require('path');

class SourceMapResolver {
  constructor(buildDir) {
    this._buildDir = buildDir;
    this._consumers = {};
    this._loading = null;
  }

  /**
   * Load (or reload) the source map for a given bundle file.
   * @param {string} filename - e.g. 'bundle.js'
   */
  async load(filename) {
    const mapPath = path.join(this._buildDir, filename + '.map');
    if (!fs.existsSync(mapPath)) {
      console.log('[SourceMap] No source map found at ' + mapPath);
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      // Destroy previous consumer to free memory
      if (this._consumers[filename]) {
        this._consumers[filename].destroy();
      }
      this._consumers[filename] = await new SourceMapConsumer(raw);
      console.log('[SourceMap] Loaded ' + mapPath);
    } catch (e) {
      console.error('[SourceMap] Failed to load ' + mapPath + ': ' + e.message);
    }
  }

  /**
   * Load source maps for all .js.map files in the build directory.
   */
  async loadAll() {
    const files = fs.readdirSync(this._buildDir).filter(f => f.endsWith('.js.map'));
    for (const file of files) {
      const jsName = file.slice(0, -4); // remove '.map'
      await this.load(jsName);
    }
  }

  /**
   * Resolve a single CDP callFrame to its original source location.
   * Returns the frame unchanged if no mapping is found.
   *
   * @param {{url: string, lineNumber: number, columnNumber: number, functionName: string, scriptId: string}} frame
   * @returns {{url: string, lineNumber: number, columnNumber: number, functionName: string, scriptId: string}}
   */
  resolveFrame(frame) {
    if (!frame || !frame.url) return frame;
    const filename = path.basename(frame.url);
    const consumer = this._consumers[filename];
    if (!consumer) return frame;

    const pos = consumer.originalPositionFor({
      line: frame.lineNumber + 1,   // CDP is 0-based, source-map lib is 1-based
      column: frame.columnNumber,
    });

    if (!pos.source) return frame;

    // Resolve scriptId to match the Debugger.scriptParsed 'source-N' IDs
    const scriptId = (this._sourceToScriptId && this._sourceToScriptId.get(pos.source)) || frame.scriptId;

    return {
      functionName: pos.name || frame.functionName,
      scriptId: scriptId,
      url: pos.source,
      lineNumber: pos.line - 1,     // back to 0-based for CDP
      columnNumber: pos.column || 0,
    };
  }

  /**
   * Resolve all callFrames in a CDP StackTrace object.
   *
   * @param {{callFrames: Array}} stackTrace
   * @returns {{callFrames: Array}}
   */
  resolveStackTrace(stackTrace) {
    if (!stackTrace || !stackTrace.callFrames) return stackTrace;
    return {
      callFrames: stackTrace.callFrames.map(f => this.resolveFrame(f)),
    };
  }

  /**
   * Resolve stack traces inside a CDP exceptionDetails object.
   *
   * @param {object} exceptionDetails
   * @returns {object}
   */
  resolveExceptionDetails(exceptionDetails) {
    if (!exceptionDetails) return exceptionDetails;
    const resolved = Object.assign({}, exceptionDetails);

    // Resolve the stack trace first
    if (resolved.stackTrace) {
      resolved.stackTrace = this.resolveStackTrace(resolved.stackTrace);
    }

    // Use the first resolved callFrame for top-level fields — the top-level
    // exceptionDetails often lacks a precise columnNumber, so resolving it
    // independently picks a wrong source map mapping. The first callFrame
    // has exact column info and resolves correctly.
    if (resolved.stackTrace && resolved.stackTrace.callFrames && resolved.stackTrace.callFrames.length > 0) {
      const first = resolved.stackTrace.callFrames[0];
      resolved.url = first.url;
      resolved.lineNumber = first.lineNumber;
      resolved.columnNumber = first.columnNumber;
      resolved.scriptId = first.scriptId;
    } else if (resolved.url) {
      const topFrame = this.resolveFrame({
        url: resolved.url,
        lineNumber: resolved.lineNumber || 0,
        columnNumber: resolved.columnNumber || 0,
        functionName: '',
        scriptId: resolved.scriptId || '0',
      });
      resolved.url = topFrame.url;
      resolved.lineNumber = topFrame.lineNumber;
      resolved.columnNumber = topFrame.columnNumber;
      resolved.scriptId = topFrame.scriptId;
    }

    return resolved;
  }

  /**
   * Build a flat index of all original sources across all loaded source maps.
   * Each entry gets a unique scriptId ('source-0', 'source-1', ...).
   * Also builds a reverse map (source URL → scriptId) for resolveFrame.
   *
   * @returns {{scriptId: string, source: string, filename: string}[]}
   */
  buildSourceIndex() {
    this._sourceIndex = [];
    this._sourceToScriptId = new Map();
    for (const filename of Object.keys(this._consumers)) {
      const consumer = this._consumers[filename];
      for (var i = 0; i < consumer.sources.length; i++) {
        const source = consumer.sources[i];
        if (this._sourceToScriptId.has(source)) continue; // dedupe across chunks
        const scriptId = 'source-' + this._sourceIndex.length;
        this._sourceIndex.push({scriptId: scriptId, source: source, filename: filename});
        this._sourceToScriptId.set(source, scriptId);
      }
    }
    return this._sourceIndex;
  }

  /**
   * Get the list of bundle filenames that have loaded consumers.
   * @returns {string[]}
   */
  getConsumerFilenames() {
    return Object.keys(this._consumers);
  }

  /**
   * Get the original source content for a given source path,
   * searching across all loaded source maps.
   * @param {string} source - an original source path
   * @returns {string|null}
   */
  getSourceContent(source) {
    for (const filename of Object.keys(this._consumers)) {
      const consumer = this._consumers[filename];
      const content = consumer.sourceContentFor(source, true);
      if (content != null) return content;
    }
    return null;
  }

  /**
   * Watch source map files for changes and reload automatically.
   * Call this once after initial load.
   */
  watchForChanges() {
    const dir = this._buildDir;
    const self = this;
    fs.watch(dir, function (eventType, filename) {
      if (filename && filename.endsWith('.js.map')) {
        const jsName = filename.slice(0, -4);
        console.log('[SourceMap] Detected change in ' + filename + ', reloading...');
        self.load(jsName);
      }
    });
  }
}

module.exports = {SourceMapResolver};
