# Multibyte Character Encoding (Unicode, Emoji, CJK Characters)

## Category
fizz

## Description
Validates that the Fizz renderer correctly handles multibyte characters including Unicode text, emoji, CJK (Chinese, Japanese, Korean) characters, and other non-ASCII content. The renderer must produce correctly encoded UTF-8 output that browsers can parse without corruption, and hydration must match character-for-character.

## References
- `packages/react-dom/src/__tests__/ReactDOMFizzServer-test.js` (encoding tests)
- `packages/react-server/src/ReactFizzServer.js` (text encoding)

## App Setup
```jsx
function MultibyteApp() {
  return (
    <div>
      {/* Basic Unicode */}
      <p id="unicode">Cafe\u0301 r\u00e9sum\u00e9</p>

      {/* Emoji */}
      <p id="emoji">Hello World! 🌍🌎🌏</p>

      {/* Complex emoji (multi-codepoint) */}
      <p id="complex-emoji">Family: 👨‍👩‍👧‍👦 Flag: 🇺🇸</p>

      {/* Chinese characters */}
      <p id="chinese">你好世界 - React 是一个 JavaScript 库</p>

      {/* Japanese (Hiragana, Katakana, Kanji) */}
      <p id="japanese">こんにちは世界 - リアクト</p>

      {/* Korean */}
      <p id="korean">안녕하세요 세계</p>

      {/* Arabic (RTL) */}
      <p id="arabic" dir="rtl">مرحبا بالعالم</p>

      {/* Mixed scripts */}
      <p id="mixed">English 中文 日本語 한국어 العربية</p>

      {/* Special Unicode characters */}
      <p id="special">
        Em dash: — En dash: – Ellipsis: … Copyright: © Degree: 90°
      </p>

      {/* Multibyte in attributes */}
      <div id="mb-attr" title="日本語タイトル" data-label="标签">
        Multibyte attributes
      </div>

      {/* Multibyte adjacent text nodes */}
      <p id="mb-adjacent">
        {'你好'}{'世界'}
      </p>
    </div>
  );
}
```

Server renders via `renderToPipeableStream(<MultibyteApp />)`.

## Load Sequence
1. Server renders all text content with multibyte characters.
2. The output stream is UTF-8 encoded.
3. HTML is flushed to the client with proper encoding.
4. Browser parses the UTF-8 content.
5. Client hydrates, matching the multibyte content exactly.

## Actions
1. Server-render `<MultibyteApp />` and collect the HTML output as a UTF-8 string.
2. Verify the raw HTML bytes represent valid UTF-8 sequences.
3. Parse the HTML into a DOM.
4. Check `textContent` of each element.
5. Hydrate with `hydrateRoot`.

## Assertions
1. `#unicode` textContent is `Café résumé` (combining accent and precomposed character both work).
2. `#emoji` textContent includes the three globe emoji characters.
3. `#complex-emoji` textContent includes the family emoji (ZWJ sequence) and flag emoji (regional indicator sequence).
4. `#chinese` textContent is `你好世界 - React 是一个 JavaScript 库`.
5. `#japanese` textContent is `こんにちは世界 - リアクト`.
6. `#korean` textContent is `안녕하세요 세계`.
7. `#arabic` textContent is `مرحبا بالعالم` and has `dir="rtl"`.
8. `#mixed` contains all five scripts in the correct order.
9. `#special` contains em dash, en dash, ellipsis, copyright, and degree symbols.
10. `#mb-attr` has `title="日本語タイトル"` and `data-label="标签"` attributes with correct multibyte values.
11. `#mb-adjacent` has text separators between `你好` and `世界` to maintain them as separate text nodes.
12. Hydration completes without mismatch warnings for any multibyte content.
13. The byte length of the raw HTML output is greater than the character count for elements containing multibyte characters (confirming multi-byte encoding, not truncation).
