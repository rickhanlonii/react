'use strict';

// ---------------------------------------------------------------------------
// DOM/CSS Agent (in-JSC)
//
// Handles CDP DOM and CSS domain requests forwarded from the inspector proxy.
// Calls $$ bridge functions that read the native shadow tree and Yoga layout.
//
// Incoming messages (via $$handleCDPRequest):
//   {requestId, domain: 'DOM'|'CSS', method, params}
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'cdp-response', requestId, result}
// ---------------------------------------------------------------------------

function handleDOMRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'enable':
    case 'disable':
      result = {};
      break;

    case 'getDocument': {
      if (typeof $$getDocumentTree === 'function') {
        result = $$getDocumentTree(0); // 0 = any active surface
      } else {
        result = {
          root: {
            nodeId: 1,
            backendNodeId: 1,
            nodeType: 9,
            nodeName: '#document',
            localName: '',
            nodeValue: '',
            childNodeCount: 1,
            children: [
              {
                nodeId: 2,
                backendNodeId: 2,
                nodeType: 1,
                nodeName: 'HTML',
                localName: 'html',
                nodeValue: '',
                childNodeCount: 2,
                children: [
                  {
                    nodeId: 3,
                    backendNodeId: 3,
                    nodeType: 1,
                    nodeName: 'HEAD',
                    localName: 'head',
                    nodeValue: '',
                    childNodeCount: 0,
                    children: [],
                    attributes: [],
                  },
                  {
                    nodeId: 4,
                    backendNodeId: 4,
                    nodeType: 1,
                    nodeName: 'BODY',
                    localName: 'body',
                    nodeValue: '',
                    childNodeCount: 0,
                    children: [],
                    attributes: [],
                  },
                ],
                attributes: [],
              },
            ],
            documentURL: 'falcon://app',
            baseURL: 'falcon://app',
            xmlVersion: '',
          },
        };
      }
      break;
    }

    case 'requestChildNodes':
      // Full tree already returned in getDocument
      result = {};
      break;

    case 'getOuterHTML': {
      if (typeof $$getOuterHTML === 'function' && params.nodeId) {
        result = $$getOuterHTML(params.nodeId);
      }
      if (!result) {
        result = {outerHTML: ''};
      }
      break;
    }

    case 'getPreviewHTML': {
      // Returns the full body HTML for web preview rendering.
      // Calls getDocumentTree to register nodes, then getOuterHTML on each
      // body child (body itself is synthetic and not in the node registry).
      var html = '';
      if (typeof $$getDocumentTree === 'function' && typeof $$getOuterHTML === 'function') {
        var doc = $$getDocumentTree(0);
        if (doc && doc.root && doc.root.children) {
          var htmlNode = doc.root.children[0];
          if (htmlNode && htmlNode.children) {
            var bodyNode = htmlNode.children[1];
            if (bodyNode && bodyNode.children) {
              var parts = [];
              for (var i = 0; i < bodyNode.children.length; i++) {
                var child = bodyNode.children[i];
                if (child && child.nodeId) {
                  var outerResult = $$getOuterHTML(child.nodeId);
                  if (outerResult && outerResult.outerHTML) {
                    parts.push(outerResult.outerHTML);
                  }
                }
              }
              html = parts.join('\n');
            }
          }
        }
      }
      result = {html: html};
      break;
    }

    case 'getBoxModel': {
      if (typeof $$getBoxModel === 'function' && params.nodeId) {
        result = $$getBoxModel(params.nodeId);
      }
      if (!result) {
        result = {model: {content: [0,0,0,0,0,0,0,0], padding: [0,0,0,0,0,0,0,0], border: [0,0,0,0,0,0,0,0], margin: [0,0,0,0,0,0,0,0], width: 0, height: 0}};
      }
      break;
    }

    case 'highlightNode': {
      var nodeId = params.nodeId || params.backendNodeId ||
        (params.highlightConfig && params.highlightConfig.nodeId);
      if (typeof $$highlightNode === 'function' && nodeId) {
        $$highlightNode(nodeId);
      }
      result = {};
      break;
    }

    case 'highlightRect':
      result = {};
      break;

    case 'hideHighlight': {
      if (typeof $$hideHighlight === 'function') {
        $$hideHighlight();
      }
      result = {};
      break;
    }

    case 'querySelector':
    case 'querySelectorAll':
      result = method === 'querySelector' ? {nodeId: 0} : {nodeIds: []};
      break;

    case 'resolveNode': {
      result = {object: {type: 'object', objectId: String(params.nodeId || 0)}};
      break;
    }

    case 'setInspectedNode': {
      if (typeof $$highlightNode === 'function' && params.nodeId) {
        $$highlightNode(params.nodeId);
      }
      result = {};
      break;
    }

    case 'pushNodesByBackendIdsToFrontend':
    case 'markUndoableState':
      result = {};
      break;

    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

function handleCSSRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'enable':
    case 'disable':
      result = {};
      break;

    case 'getComputedStyleForNode': {
      if (typeof $$getComputedStyle === 'function' && params.nodeId) {
        result = $$getComputedStyle(params.nodeId);
      }
      if (!result) {
        result = {computedStyle: []};
      }
      break;
    }

    case 'getInlineStylesForNode': {
      var inlineStyle = null;
      if (typeof $$getInlineStyle === 'function' && params.nodeId) {
        inlineStyle = $$getInlineStyle(params.nodeId);
      }
      result = {inlineStyle: inlineStyle || {cssProperties: [], shorthandEntries: []}};
      break;
    }

    case 'getMatchedStylesForNode': {
      // Return inline style as the only "matched rule"
      var style = null;
      if (typeof $$getInlineStyle === 'function' && params.nodeId) {
        style = $$getInlineStyle(params.nodeId);
      }
      if (!style) {
        style = {cssProperties: [], shorthandEntries: []};
      }
      result = {
        inlineStyle: style,
        matchedCSSRules: [],
        pseudoElements: [],
        inherited: [],
        cssKeyframesRules: [],
      };
      break;
    }

    case 'getMediaQueries':
      result = {medias: []};
      break;

    case 'getStyleSheetText':
      result = {text: ''};
      break;

    case 'getPlatformFontsForNode':
      result = {fonts: []};
      break;

    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

// Export for use by $$handleCDPRequest
globalThis.$$handleDOMRequest = handleDOMRequest;
globalThis.$$handleCSSRequest = handleCSSRequest;
