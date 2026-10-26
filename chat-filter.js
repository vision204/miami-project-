import fs from 'node:fs';

// Compile once at startup. Only literal, owner-selected phrases are supported.
const segments = new Intl.Segmenter('ko', {granularity:'grapheme'});
const skip = /[\p{White_Space}\p{P}\p{S}\p{Cf}]/u;
function normalized(text, compact) {
  const chars = [], spans = [];
  for (const part of segments.segment(text)) {
    for (const char of part.segment.normalize('NFKC').toLowerCase()) {
      if (/\p{Cf}/u.test(char) || (compact && skip.test(char))) continue;
      chars.push(char); spans.push([part.index, part.index + part.segment.length]);
    }
  }
  return {chars, spans};
}
export function createChatFilter(config) {
  if (!Array.isArray(config?.words) || config.words.length > 2000) throw Error('Invalid chat-filter words');
  const rules = config.words.map(word => {
    if (typeof word !== 'string' || !word.trim() || word.length > 200) throw Error('Invalid chat-filter phrase');
    // Keep punctuation significant for phrases such as 야~~: do not block every 야.
    const compact = !/[\p{P}\p{S}]/u.test(word);
    return {compact, chars:normalized(word.trim(), compact).chars};
  });
  if (rules.some(rule => !rule.chars.length)) throw Error('Empty normalized chat-filter phrase');
  return text => {
    const marks = new Uint8Array(text.length), forms = new Map();
    for (const rule of rules) {
      if (!forms.has(rule.compact)) forms.set(rule.compact, normalized(text, rule.compact));
      const {chars, spans} = forms.get(rule.compact);
      for (let i = 0; i <= chars.length - rule.chars.length; i++) {
        if (!rule.chars.every((c, j) => c === chars[i+j])) continue;
        marks.fill(1, spans[i][0], spans[i+rule.chars.length-1][1]);
      }
    }
    // Mark entire source graphemes, including split Hangul and emoji safely.
    return Array.from(segments.segment(text), p => marks[p.index] ? '#'.repeat(Array.from(p.segment.normalize('NFC')).length) : p.segment).join('');
  };
}
export const maskChat = createChatFilter(JSON.parse(fs.readFileSync(new URL('./chat-filter.json', import.meta.url), 'utf8')));
