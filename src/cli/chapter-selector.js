import path from "path";

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function splitByComma(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error(`Invalid --chap syntax: "${String(raw ?? "")}"`);

  const tokens = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
      quote = quote ? null : ch;
      current += ch;
      continue;
    }

    if (ch === "," && !quote) {
      const token = current.trim();
      if (!token) throw new Error(`Invalid --chap syntax: "${raw}"`);
      tokens.push(token);
      current = "";
      continue;
    }

    current += ch;
  }

  if (quote) throw new Error(`Invalid --chap syntax: "${raw}"`);

  const last = current.trim();
  if (!last) throw new Error(`Invalid --chap syntax: "${raw}"`);
  tokens.push(last);
  return tokens;
}

function decodeQuoted(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`Invalid --chap syntax: "${value}"`);

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    const inner = trimmed.slice(1, -1);
    if (!inner.trim()) throw new Error(`Invalid --chap syntax: "${value}"`);
    return inner;
  }
  return trimmed;
}

function parseToken(token, raw) {
  const text = token.trim();
  if (!text) throw new Error(`Invalid --chap syntax: "${raw}"`);

  const numberMatch = text.match(/^\d+$/);
  if (numberMatch) {
    return { type: "number", index: Number(text) };
  }

  const numberRangeMatch = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (numberRangeMatch) {
    return {
      type: "number-range",
      start: Number(numberRangeMatch[1]),
      end: Number(numberRangeMatch[2]),
      raw: text,
    };
  }

  const quotedRangeMatch = text.match(/^(["'])(.*?)\1\s*-\s*(["'])(.*?)\3$/);
  if (quotedRangeMatch) {
    const left = normalizeText(quotedRangeMatch[2]);
    const right = normalizeText(quotedRangeMatch[4]);
    if (!left || !right) throw new Error(`Invalid --chap syntax: "${raw}"`);
    return {
      type: "title-range",
      startTitle: left,
      endTitle: right,
      startRaw: `${quotedRangeMatch[1]}${quotedRangeMatch[2]}${quotedRangeMatch[1]}`,
      endRaw: `${quotedRangeMatch[3]}${quotedRangeMatch[4]}${quotedRangeMatch[3]}`,
      raw: text,
    };
  }

  if (/^\d+\s*-\s*$/.test(text) || /^\s*-\s*\d+$/.test(text) || /^.+\s*-\s*$/.test(text)) {
    throw new Error(`Invalid --chap syntax: "${raw}"`);
  }

  return { type: "title", title: normalizeText(decodeQuoted(text)), raw: text };
}

function resolveSingleTitle(query, chapterIndexList) {
  const normalizedQuery = normalizeText(query).toLowerCase();
  const matches = chapterIndexList.filter((chapter) => chapter.title.toLowerCase().includes(normalizedQuery));

  if (matches.length === 0) {
    throw new Error(`No chapter matches: "${query}"`);
  }

  if (matches.length > 1) {
    const lines = matches.map((chapter) => `  ${chapter.index}: ${chapter.title}`).join("\n");
    throw new Error(`Ambiguous chapter name: "${query}"\nMatches:\n${lines}`);
  }

  return matches[0].index;
}

function validateNumberIndex(index, max) {
  if (index < 1 || index > max) {
    throw new Error(`Chapter index out of range: ${index} (valid range: 1-${max})`);
  }
}

export function buildChapterIndexList(chapters) {
  return chapters.map((chapter, i) => ({
    index: i + 1,
    title: extractChapterTitle(chapter),
    file: chapter.entryName,
  }));
}

function extractText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  return (node.children || []).map((child) => extractText(child)).join(" ");
}

function findFirstTagText(node, tags) {
  if (!node) return "";
  if (node.type === "element" && tags.has(String(node.tagName || "").toLowerCase())) {
    const text = normalizeText(extractText(node));
    if (text) return text;
  }

  for (const child of node.children || []) {
    const found = findFirstTagText(child, tags);
    if (found) return found;
  }
  return "";
}

export function extractChapterTitle(chapter) {
  const titleTags = new Set(["title", "h1", "h2", "h3"]);
  const title = normalizeText(findFirstTagText(chapter.document, titleTags));
  if (title) return title;

  const base = path.basename(chapter.entryName || "chapter");
  return normalizeText(base.replace(/\.[^.]+$/, "")) || "Untitled";
}

export function resolveChapterSelector(rawSelector, chapterIndexList) {
  const max = chapterIndexList.length;
  if (max === 0) throw new Error("No chapters available for selection.");

  const raw = String(rawSelector ?? "");
  const tokens = splitByComma(raw);
  const parsed = tokens.map((token) => parseToken(token, raw));

  const selected = new Set();

  for (const token of parsed) {
    if (token.type === "number") {
      validateNumberIndex(token.index, max);
      selected.add(token.index);
      continue;
    }

    if (token.type === "number-range") {
      validateNumberIndex(token.start, max);
      validateNumberIndex(token.end, max);
      if (token.start > token.end) {
        throw new Error(`Invalid numeric range: ${token.raw} (start > end)`);
      }
      for (let i = token.start; i <= token.end; i++) selected.add(i);
      continue;
    }

    if (token.type === "title") {
      selected.add(resolveSingleTitle(token.title, chapterIndexList));
      continue;
    }

    if (token.type === "title-range") {
      const startIndex = resolveSingleTitle(token.startTitle, chapterIndexList);
      const endIndex = resolveSingleTitle(token.endTitle, chapterIndexList);
      if (startIndex > endIndex) {
        throw new Error(`Invalid title range: ${token.startRaw}-${token.endRaw} (start comes after end)`);
      }
      for (let i = startIndex; i <= endIndex; i++) selected.add(i);
      continue;
    }

    throw new Error(`Invalid --chap syntax: "${raw}"`);
  }

  if (selected.size === 0) {
    throw new Error(`Invalid --chap syntax: "${raw}"`);
  }

  return selected;
}

export function formatChapterSelection(selectedIndices, chapterIndexList) {
  const sorted = [...selectedIndices].sort((a, b) => a - b);
  return sorted.map((index) => chapterIndexList[index - 1]).filter(Boolean);
}
