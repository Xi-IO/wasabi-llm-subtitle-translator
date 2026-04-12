import { DEFAULT_EPUB_PROMPT_PATH, translateAll } from "../../core/translation.js";
import { extractTranslationUnits, applyTranslationUnits } from "../../epub/translation-units.js";

export function extractEpubItems(epubDoc) {
  const allItems = [];
  const rollup = {
    blockCandidates: 0,
    producedUnits: 0,
    skippedReasons: {},
  };

  for (const chapter of epubDoc.chapters) {
    const diagnostics = {};
    const units = extractTranslationUnits(chapter, diagnostics);
    const chapterItems = units.map((unit) => ({
      key: unit.key,
      kind: unit.kind,
      sourceText: unit.sourceText,
      sourceNodeIds: unit.sourceNodeIds,
      chapter: unit.chapter,
      blockNodeId: unit.blockNodeId,
      placeholderMap: unit.placeholderMap,
      text: unit.sourceText,
    }));
    allItems.push(...chapterItems);

    rollup.blockCandidates += diagnostics.blockCandidates || 0;
    rollup.producedUnits += diagnostics.producedUnits || 0;
    for (const [reason, count] of Object.entries(diagnostics.skippedReasons || {})) {
      rollup.skippedReasons[reason] = (rollup.skippedReasons[reason] || 0) + count;
    }

    const reasonText = Object.entries(diagnostics.skippedReasons || {})
      .map(([reason, count]) => `${reason}=${count}`)
      .join(", ") || "none";
    console.log(
      `[EPUB识别] ${chapter.entryName}: candidates=${diagnostics.blockCandidates || 0}, units=${diagnostics.producedUnits || 0}, skipped=${reasonText}`,
    );
  }

  const totalReasonText = Object.entries(rollup.skippedReasons)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(", ") || "none";
  console.log(
    `[EPUB识别汇总] candidates=${rollup.blockCandidates}, units=${rollup.producedUnits}, skipped=${totalReasonText}`,
  );

  return allItems;
}

export function applyEpubTranslations(epubDoc, items, translationMap) {
  const unitsByChapter = new Map();
  for (const item of items) {
    const bucket = unitsByChapter.get(item.chapter) || [];
    bucket.push(item);
    unitsByChapter.set(item.chapter, bucket);
  }

  epubDoc.chapters.forEach((chapter) => {
    applyTranslationUnits(chapter, translationMap, unitsByChapter.get(chapter.entryName) || []);
  });

  return epubDoc;
}

export async function translateEpubItems(items, cachePath, langOptions, options = {}) {
  return translateAll(items, cachePath, langOptions, {
    promptPath: DEFAULT_EPUB_PROMPT_PATH,
    persistNodeResults: true,
    returnNodeResults: false,
    ...options,
  });
}
