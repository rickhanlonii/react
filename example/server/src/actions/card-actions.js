'use server';

var React = require('react');
var http = require('http');

var ALLOWED_TYPES = ['div', 'span', 'p', 'h1', 'h2', 'h3'];

// In-memory card storage (shared across requests for the demo).
// Stored on globalThis so it survives require.cache invalidation
// (clearServerSourceCache() wipes module-scoped vars on every request).
if (!globalThis.__cardStore) {
  globalThis.__cardStore = {
    nextId: 1,
    cards: [],
  };
}

function jsonToJsx(node) {
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'number') {
    return String(node);
  }
  if (node === null || node === undefined) {
    return null;
  }
  if (Array.isArray(node)) {
    return node.map(jsonToJsx);
  }
  var type = ALLOWED_TYPES.indexOf(node.type) !== -1 ? node.type : 'div';
  var style = node.style || {};
  var children = node.children != null ? jsonToJsx(node.children) : null;
  return React.createElement(type, {style: style}, children);
}

var SYSTEM_PROMPT = [
  'You generate simple UI components as JSON. Respond with ONLY valid JSON, no markdown, no code fences, no explanation.',
  'Schema: {type, style, children} where:',
  '- type: one of "div", "span", "p", "h1", "h2", "h3"',
  '- style: CSS-in-JS object (camelCase properties, numeric values for px)',
  '- children: a string, or an array of nodes',
  'Use colorful styles with backgroundColor, borderRadius, padding, etc.',
  'Keep it simple: max 3-5 nested elements. Do NOT generate deeply nested or complex structures.',
  'Example: {"type":"div","style":{"backgroundColor":"#e3f2fd","padding":16,"borderRadius":12},"children":[{"type":"h2","style":{"color":"#1565c0","marginTop":0},"children":"Hello"},{"type":"p","style":{"color":"#333","marginBottom":0},"children":"World"}]}',
].join(' ');

function callClaude(prompt) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{role: 'user', content: 'Generate a UI component for: ' + prompt}],
    });

    // Use x2p proxy to reach Anthropic API
    var proxyHost = 'localhost';
    var proxyPort = 10054;
    var catToken = process.env.X2P_INJECT_CAT || '';

    var options = {
      hostname: proxyHost,
      port: proxyPort,
      path: 'http://plugboard.x2p.facebook.net/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': 'placeholder',
        'x-x2pagentd-inject-cat': catToken,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    var req = http.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        try {
          var parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API error'));
            return;
          }
          var text = parsed.content && parsed.content[0] && parsed.content[0].text;
          resolve(text || '');
        } catch (e) {
          reject(new Error('Failed to parse API response'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, function () {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.write(body);
    req.end();
  });
}

async function generateCard(previousState, formData) {
  // useActionState calls with (previousState, formData).
  // In hydrated mode, formData is a plain object {prompt: "..."} from native form collection.
  // In MPA mode, formData is a web FormData object from decodeAction.
  var prompt = formData && (typeof formData.get === 'function' ? formData.get('prompt') : formData.prompt);
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return {error: 'Please enter a prompt'};
  }

  try {
    var result = await callClaude(prompt.trim());

    // Extract JSON from response — Claude might wrap it in markdown code blocks
    var jsonStr = result.trim();
    var fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }
    // Fallback: find the outermost { ... } in the response
    if (jsonStr.charAt(0) !== '{') {
      var startIdx = jsonStr.indexOf('{');
      var endIdx = jsonStr.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }
    }

    var parsed = JSON.parse(jsonStr);
    var jsx = jsonToJsx(parsed);

    // Store the card in server-side state
    globalThis.__cardStore.cards.unshift({
      id: globalThis.__cardStore.nextId++,
      prompt: prompt.trim(),
      content: jsx,
    });

    return {error: null};
  } catch (err) {
    return {error: err.message || 'Failed to generate'};
  }
}

function getCards() {
  return globalThis.__cardStore.cards;
}

exports.generateCard = generateCard;
exports.getCards = getCards;
