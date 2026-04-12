import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";

import { evaluateNodeQuality } from "../src/core/quality-checks.js";

async function loadTranslationModule() {
  process.env.QWEN_API_KEY = process.env.QWEN_API_KEY || "test-key";
  return import("../src/core/translation.js");
}

function makeItems() {
  return [
    { key: "n1", text: "This is the first narrative paragraph." },
    { key: "n2", text: "This is the second narrative paragraph." },
  ];
}

async function withCachePath(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-test-"));
  const cachePath = path.join(dir, "cache.json");
  try {
    await fn(cachePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("batch output length mismatch detection", async () => {
  const { __internal } = await loadTranslationModule();
  const items = makeItems();
  assert.throws(
    () => __internal.validateBatchOutput(items, [{ id: "n1", translation: "x" }]),
    /length mismatch/i,
  );
});

test("missing node id detection", async () => {
  const { __internal } = await loadTranslationModule();
  const items = makeItems();
  assert.throws(
    () => __internal.validateBatchOutput(items, [
      { id: "n1", translation: "x" },
      { id: "unknown", translation: "y" },
    ]),
    /unknown node id/i,
  );
});

test("batch failure falls back to per-node translation", async () => {
  const { translateAll } = await loadTranslationModule();
  await withCachePath(async (cachePath) => {
    const items = makeItems();
    let calls = 0;
    const results = await translateAll(items, cachePath, { from: "en", to: "zh-CN" }, {
      batchRetryDelayMs: 0,
      singleRetryDelayMs: 0,
      concurrency: 1,
      enableRepair: false,
      batchTranslator: async (batch) => {
        calls += 1;
        if (batch.length > 1) {
          throw new Error("batch failed");
        }
        return [{ id: batch[0].key, translation: `已翻译:${batch[0].text}` }];
      },
    });

    assert.equal(results.n1.startsWith("已翻译:"), true);
    assert.equal(results.n2.startsWith("已翻译:"), true);
    assert.equal(calls >= 3, true);
  });
});

test("unresolved nodes preserve source text", async () => {
  const { translateAll } = await loadTranslationModule();
  await withCachePath(async (cachePath) => {
    const item = [{ key: "n1", text: "keep me" }];
    const { translations, nodeResults } = await translateAll(item, cachePath, { from: "en", to: "zh-CN" }, {
      batchRetryDelayMs: 0,
      singleRetryDelayMs: 0,
      concurrency: 1,
      returnNodeResults: true,
      batchTranslator: async () => {
        throw new Error("always fail");
      },
    });

    assert.equal(translations.n1, "keep me");
    assert.equal(nodeResults.n1.status, "unresolved");
  });
});

test("suspicious detection via heuristics and mixed-language/glossary detection", () => {
  const mixed = evaluateNodeQuality({
    sourceText: "This paragraph is long enough to trigger quality checks and should be translated.",
    translation: "这是明显的中文译文部分，叙述也已经翻译成中文，但是 still a large part remains in English and keeps going for many words here.",
  });
  assert.equal(mixed.reasons.includes("source-language-residue"), true);

  const glossary = evaluateNodeQuality({
    sourceText: "He moved rapidly across the field.",
    translation: "他快速地移动，rapid（迅捷的）穿过了场地。",
  });
  assert.equal(glossary.reasons.includes("inline-glossary-artifact"), true);
});

test("only suspicious nodes trigger repair and clean nodes do not", async () => {
  const { translateAll } = await loadTranslationModule();
  await withCachePath(async (cachePath) => {
    const items = [
      { key: "clean", text: "Hello world." },
      { key: "sus", text: "The cat runs rapidly through the yard." },
    ];

    let repairCalls = 0;
    const { nodeResults } = await translateAll(items, cachePath, { from: "en", to: "zh-CN" }, {
      batchRetryDelayMs: 0,
      singleRetryDelayMs: 0,
      concurrency: 1,
      returnNodeResults: true,
      batchTranslator: async (batch) => batch.map((x) => ({
        id: x.key,
        translation: x.key === "sus"
          ? "猫跑得很快 rapid（迅捷的）在院子里。"
          : "你好，世界。",
      })),
      repairTranslator: async (_item, _draft) => {
        repairCalls += 1;
        return "猫在院子里飞快地奔跑。";
      },
    });

    assert.equal(repairCalls, 1);
    assert.equal(nodeResults.clean.status, "translated");
    assert.equal(nodeResults.sus.status, "translated");
  });
});

test("output count equals input count", async () => {
  const { translateAll } = await loadTranslationModule();
  await withCachePath(async (cachePath) => {
    const items = makeItems();
    const result = await translateAll(items, cachePath, { from: "en", to: "zh-CN" }, {
      concurrency: 1,
      batchRetryDelayMs: 0,
      singleRetryDelayMs: 0,
      batchTranslator: async (batch) => batch.map((x) => ({ id: x.key, translation: `T:${x.text}` })),
    });
    assert.equal(Object.keys(result).length, items.length);
  });
});
