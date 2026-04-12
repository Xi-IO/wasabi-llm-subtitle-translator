import test from "node:test";
import assert from "node:assert/strict";

import { resolveChapterSelector, formatChapterSelection } from "../src/cli/chapter-selector.js";

const CHAPTERS = [
  { index: 1, title: "Introduction", file: "intro.xhtml" },
  { index: 2, title: "Chapter 1", file: "ch1.xhtml" },
  { index: 3, title: "Stir-Fried Eel Shreds", file: "dish.xhtml" },
  { index: 4, title: "Chapter Five", file: "ch5.xhtml" },
  { index: 5, title: "Appendix", file: "appendix.xhtml" },
  { index: 6, title: "Notes", file: "notes.xhtml" },
  { index: 7, title: "Conclusion", file: "end.xhtml" },
  { index: 8, title: "Introductory Note", file: "intro-note.xhtml" },
];

function toSortedArray(set) {
  return [...set].sort((a, b) => a - b);
}

test("single numeric selection", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("3", CHAPTERS)), [3]);
});

test("numeric list", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("1,3,7", CHAPTERS)), [1, 3, 7]);
});

test("numeric range", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("1-3", CHAPTERS)), [1, 2, 3]);
});

test("mixed numeric selectors", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("1-3,7,6-8", CHAPTERS)), [1, 2, 3, 6, 7, 8]);
});

test("single title match", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("'Stir-Fried Eel Shreds'", CHAPTERS)), [3]);
});

test("multiple title matches", () => {
  assert.deepEqual(toSortedArray(resolveChapterSelector("'Introduction','Conclusion'", CHAPTERS)), [1, 7]);
});

test("title range by document order", () => {
  assert.deepEqual(
    toSortedArray(resolveChapterSelector("'Introduction'-'Appendix'", CHAPTERS)),
    [1, 2, 3, 4, 5],
  );
});

test("mixed numeric + title selectors", () => {
  assert.deepEqual(
    toSortedArray(resolveChapterSelector("1-2,'Stir-Fried Eel Shreds','Chapter Five'-'Notes',7", CHAPTERS)),
    [1, 2, 3, 4, 5, 6, 7],
  );
});

test("invalid syntax", () => {
  assert.throws(() => resolveChapterSelector("1,,3", CHAPTERS), /Invalid --chap syntax/);
  assert.throws(() => resolveChapterSelector("1-", CHAPTERS), /Invalid --chap syntax/);
  assert.throws(() => resolveChapterSelector(",", CHAPTERS), /Invalid --chap syntax/);
});

test("out-of-range numeric index", () => {
  assert.throws(() => resolveChapterSelector("999", CHAPTERS), /Chapter index out of range: 999/);
});

test("invalid numeric range", () => {
  assert.throws(() => resolveChapterSelector("5-3", CHAPTERS), /Invalid numeric range: 5-3/);
});

test("no title match", () => {
  assert.throws(() => resolveChapterSelector("'Not Exists'", CHAPTERS), /No chapter matches: "Not Exists"/);
});

test("ambiguous title match", () => {
  assert.throws(() => resolveChapterSelector("'Intro'", CHAPTERS), /Ambiguous chapter name: "Intro"/);
});

test("invalid title range", () => {
  assert.throws(
    () => resolveChapterSelector("'Appendix'-'Chapter 1'", CHAPTERS),
    /Invalid title range: 'Appendix'-'Chapter 1' \(start comes after end\)/,
  );
});

test("formatChapterSelection returns full chapter objects in order", () => {
  const selected = resolveChapterSelector("1,3,2", CHAPTERS);
  const formatted = formatChapterSelection(selected, CHAPTERS);
  assert.deepEqual(formatted.map((x) => x.index), [1, 2, 3]);
  assert.deepEqual(formatted.map((x) => x.title), ["Introduction", "Chapter 1", "Stir-Fried Eel Shreds"]);
});
