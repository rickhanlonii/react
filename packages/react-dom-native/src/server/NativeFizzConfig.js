'use strict';

// NativeFizzConfig — Fizz server config for react-dom-native
//
// Implements the ReactFizzConfig + ReactServerStreamConfig interfaces.
// Produces JSON-line instructions for native shadow tree construction:
//
//   ["O","div",{...props}]   Open element
//   ["T","text content"]      Text node
//   ["C"]                     Close element
//   ["B",id]                  Begin Suspense boundary (fallback follows)
//   ["/B"]                    End boundary
//   ["S",id]                  Begin completed segment
//   ["/S"]                    End completed segment
//   ["X",id]                  Execute boundary reveal
//   ["R"]                     Root shell complete
//   ["P",id]                  Placeholder for pending segment
//   ["D","flight_row"]        Embedded Flight data
//   ["E",id,"digest"]         Client-render boundary (error)

// ---------------------------------------------------------------------------
// Text context elements — reused from HostConfig.js
// ---------------------------------------------------------------------------

const TEXT_CONTEXT_ELEMENTS = new Set([
  'p', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
  'small', 'code', 'kbd', 'samp', 'cite', 'dfn', 'var', 'sub', 'sup', 'q',
  'time', 'abbr', 'data', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'label', 'li',
]);

// Event handler props that should be stripped for SSR (only needed post-hydration)
const EVENT_HANDLER_RE = /^on[A-Z]/;

// ---------------------------------------------------------------------------
// Prop filtering — strip children and event handlers for SSR
// ---------------------------------------------------------------------------

function filterProps(props) {
  if (props == null) return {};
  const filtered = {};
  for (const key in props) {
    if (key === 'children') continue;
    if (EVENT_HANDLER_RE.test(key)) continue;
    filtered[key] = props[key];
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Instruction encoding helpers
// ---------------------------------------------------------------------------

function writeInstruction(target, instruction) {
  const line = JSON.stringify(instruction) + '\n';
  target.push(line);
}

// =========================================================================
// ReactFizzConfig exports
// =========================================================================

// -- Rendering functions --

exports.pushStartInstance = function pushStartInstance(
  target,
  type,
  props,
  resumableState,
  renderState,
  hoistableState,
  formatContext,
  textEmbedded,
  isFallback,
) {
  const filteredProps = filterProps(props);
  // Only include props object if non-empty
  const hasProps = Object.keys(filteredProps).length > 0;
  if (hasProps) {
    writeInstruction(target, ['O', type, filteredProps]);
  } else {
    writeInstruction(target, ['O', type]);
  }
  // Return children for Fizz to render
  return props.children;
};

exports.pushEndInstance = function pushEndInstance(
  target,
  type,
  props,
  resumableState,
  formatContext,
) {
  writeInstruction(target, ['C']);
};

exports.pushTextInstance = function pushTextInstance(
  target,
  text,
  renderState,
  textEmbedded,
) {
  if (text !== '') {
    writeInstruction(target, ['T', text]);
  }
  return false;
};

exports.pushSegmentFinale = function pushSegmentFinale(
  target,
  renderState,
  lastPushedText,
  textEmbedded,
) {
  // No-op for native instructions
};

// -- Format context --

exports.createRootFormatContext = function createRootFormatContext(namespaceURI) {
  return {isTextContext: false};
};

exports.getChildFormatContext = function getChildFormatContext(
  parentContext,
  type,
  props,
) {
  if (TEXT_CONTEXT_ELEMENTS.has(type)) {
    if (parentContext.isTextContext) {
      return parentContext;
    }
    return {isTextContext: true};
  }
  if (parentContext.isTextContext) {
    return {isTextContext: false};
  }
  return parentContext;
};

exports.getSuspenseFallbackFormatContext = function getSuspenseFallbackFormatContext(
  parentContext,
) {
  return parentContext;
};

exports.getSuspenseContentFormatContext = function getSuspenseContentFormatContext(
  parentContext,
) {
  return parentContext;
};

exports.getViewTransitionFormatContext = function getViewTransitionFormatContext(
  parentContext,
) {
  return parentContext;
};

// -- Resumable/Render state --

exports.createRenderState = function createRenderState(
  resumableState,
  nonce,
  externalRuntimeConfig,
  importMap,
  onHeaders,
  maxHeadersLength,
) {
  return {};
};

exports.createResumableState = function createResumableState(
  identifierPrefix,
  externalRuntimeConfig,
  bootstrapScriptContent,
  bootstrapScripts,
  bootstrapModules,
) {
  return {};
};

exports.resetResumableState = function resetResumableState(
  resumableState,
  renderState,
) {
  // No-op
};

exports.completeResumableState = function completeResumableState(resumableState) {
  // No-op
};

// -- ID generation --

exports.makeId = function makeId(resumableState, treeId, localId) {
  return ':' + treeId + localId + ':';
};

// -- Form state markers --

exports.pushFormStateMarkerIsMatching = function pushFormStateMarkerIsMatching(target) {
  // No-op
};

exports.pushFormStateMarkerIsNotMatching = function pushFormStateMarkerIsNotMatching(target) {
  // No-op
};

// -- Shell/root completion --

exports.writeCompletedRoot = function writeCompletedRoot(
  destination,
  renderState,
) {
  const line = JSON.stringify(['R']) + '\n';
  return destination.write(line);
};

// -- Suspense boundaries (inline in shell) --

exports.writeStartCompletedSuspenseBoundary = function writeStartCompletedSuspenseBoundary(
  destination,
  renderState,
  suspenseState,
) {
  // Emit a #suspense wrapper so hydration can match via canHydrateSuspenseInstance
  const line = JSON.stringify(['O', '#suspense']) + '\n';
  return destination.write(line);
};

exports.writeEndCompletedSuspenseBoundary = function writeEndCompletedSuspenseBoundary(
  destination,
  renderState,
) {
  const line = JSON.stringify(['C']) + '\n';
  return destination.write(line);
};

exports.writeStartPendingSuspenseBoundary = function writeStartPendingSuspenseBoundary(
  destination,
  renderState,
  id,
) {
  const line = JSON.stringify(['B', id]) + '\n';
  return destination.write(line);
};

exports.writeEndPendingSuspenseBoundary = function writeEndPendingSuspenseBoundary(
  destination,
  renderState,
) {
  const line = JSON.stringify(['/B']) + '\n';
  return destination.write(line);
};

exports.writeStartClientRenderedSuspenseBoundary = function writeStartClientRenderedSuspenseBoundary(
  destination,
  renderState,
  errorDigest,
  errorMsg,
  errorStack,
  errorComponentStack,
) {
  // Client-rendered boundaries are handled via the E instruction
  return true;
};

exports.writeEndClientRenderedSuspenseBoundary = function writeEndClientRenderedSuspenseBoundary(
  destination,
  renderState,
) {
  return true;
};

// -- Segments --

exports.writeStartSegment = function writeStartSegment(
  destination,
  renderState,
  formatContext,
  id,
) {
  const line = JSON.stringify(['S', id]) + '\n';
  return destination.write(line);
};

exports.writeEndSegment = function writeEndSegment(
  destination,
  formatContext,
) {
  const line = JSON.stringify(['/S']) + '\n';
  return destination.write(line);
};

// -- Placeholder --

exports.writePlaceholder = function writePlaceholder(
  destination,
  renderState,
  id,
) {
  const line = JSON.stringify(['P', id]) + '\n';
  return destination.write(line);
};

// -- Streaming instructions --

exports.writeCompletedSegmentInstruction = function writeCompletedSegmentInstruction(
  destination,
  resumableState,
  renderState,
  segmentID,
) {
  // Segment content is already written inline via S/segment
  return true;
};

exports.writeCompletedBoundaryInstruction = function writeCompletedBoundaryInstruction(
  destination,
  resumableState,
  renderState,
  boundaryID,
  contentState,
) {
  const line = JSON.stringify(['X', boundaryID]) + '\n';
  return destination.write(line);
};

exports.writeClientRenderBoundaryInstruction = function writeClientRenderBoundaryInstruction(
  destination,
  resumableState,
  renderState,
  boundaryID,
  errorDigest,
  errorMsg,
  errorStack,
  errorComponentStack,
) {
  const line = JSON.stringify(['E', boundaryID, errorDigest || null]) + '\n';
  return destination.write(line);
};

// -- Activity boundaries (no-op for native) --

exports.pushStartActivityBoundary = function pushStartActivityBoundary(target) {
  // No-op
};

exports.pushEndActivityBoundary = function pushEndActivityBoundary(target) {
  // No-op
};

// -- Preamble/postamble (no-op for native — no HTML document structure) --

exports.writePreambleStart = function writePreambleStart(
  destination,
  renderState,
  willFlushAllSegments,
) {
  // No-op
};

exports.writePreambleEnd = function writePreambleEnd(
  destination,
  renderState,
) {
  // No-op
};

exports.writeHoistables = function writeHoistables(
  destination,
  resumableState,
  renderState,
) {
  // No-op
};

exports.writeHoistablesForBoundary = function writeHoistablesForBoundary(
  destination,
  hoistableState,
  renderState,
) {
  // No-op
};

exports.writePostamble = function writePostamble(
  destination,
  resumableState,
) {
  // No-op
};

// -- Resource management (all no-ops for native) --

exports.createHoistableState = function createHoistableState() {
  return null;
};

exports.hoistHoistables = function hoistHoistables(
  parentState,
  childState,
) {
  // No-op
};

exports.hoistPreambleState = function hoistPreambleState(
  parentState,
  preambleState,
) {
  // No-op
};

exports.emitEarlyPreloads = function emitEarlyPreloads(
  renderState,
  resumableState,
  shellFlushTime,
) {
  // No-op
};

// -- Preamble state --

exports.createPreambleState = function createPreambleState() {
  return null;
};

exports.canHavePreamble = function canHavePreamble(formatContext) {
  return false;
};

exports.isPreambleContext = function isPreambleContext(formatContext) {
  return false;
};

exports.isPreambleReady = function isPreambleReady(preambleState) {
  return true;
};

// -- Suspense content (for detecting suspensey resources) --

exports.hasSuspenseyContent = function hasSuspenseyContent(hoistableState) {
  return false;
};

// -- Transition status --

exports.NotPendingTransition = null;

// -- Console binding --

exports.bindToConsole = function bindToConsole(methodName, args) {
  return Function.prototype.bind.apply(console[methodName], [
    console,
    ...args,
  ]);
};

// -- Renderer flags --

exports.isPrimaryRenderer = false;
exports.supportsClientAPIs = false;
exports.supportsRequestStorage = false;
exports.requestStorage = null;

// =========================================================================
// ReactServerStreamConfig exports
// =========================================================================

exports.scheduleWork = function scheduleWork(callback) {
  setImmediate(callback);
};

exports.scheduleMicrotask = function scheduleMicrotask(callback) {
  queueMicrotask(callback);
};

exports.beginWriting = function beginWriting(destination) {
  // No-op
};

exports.writeChunk = function writeChunk(destination, chunk) {
  destination.write(chunk);
};

exports.writeChunkAndReturn = function writeChunkAndReturn(destination, chunk) {
  return destination.write(chunk);
};

exports.completeWriting = function completeWriting(destination) {
  // No-op
};

exports.flushBuffered = function flushBuffered(destination) {
  // Node streams handle buffering internally
};

exports.close = function close(destination) {
  destination.end();
};

exports.closeWithError = function closeWithError(destination, error) {
  destination.destroy(error);
};

exports.stringToChunk = function stringToChunk(content) {
  return content;
};

exports.stringToPrecomputedChunk = function stringToPrecomputedChunk(content) {
  return content;
};

exports.typedArrayToBinaryChunk = function typedArrayToBinaryChunk(content) {
  return Buffer.from(content);
};

exports.byteLengthOfChunk = function byteLengthOfChunk(chunk) {
  return typeof chunk === 'string'
    ? Buffer.byteLength(chunk, 'utf8')
    : chunk.byteLength;
};

exports.byteLengthOfBinaryChunk = function byteLengthOfBinaryChunk(chunk) {
  return chunk.byteLength;
};

exports.createFastHash = function createFastHash(input) {
  // Simple hash for resource deduplication (not security-critical)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
};

exports.readAsDataURL = function readAsDataURL(blob) {
  throw new Error('readAsDataURL: Not supported in native SSR');
};
