import assert from "node:assert/strict";
import {
  computeUtility,
  runGistAtThreshold,
  runGistSelection,
  suggestRadiusFromDistances,
} from "../src/lib/gist";
import { computeTopicDistinctiveness } from "../src/lib/gaps";
import { localEmbedBatch, cosineDistance, cosineSimilarity } from "../src/lib/embeddings";

function almost(a: number, b: number, eps = 1e-6) {
  assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);
}

// Utility: empty = 0, no fake floor
assert.equal(computeUtility("", "", []), 0);
assert.ok(computeUtility("seo контент уникальность статья ".repeat(40), "seo контент", ["H1", "H2", "H3"]) > 0.2);

// Identical vectors → distance 0 → bubble lock
{
  const v = [
    [1, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  const ids = ["a", "b", "c"];
  const utils = [0.9, 0.8, 0.7];
  const r = runGistAtThreshold(ids, utils, v, 0.2, 3);
  assert.deepEqual(r.selectedIds, ["a", "c"]);
  assert.equal(r.exclusionReason.b, "bubble");
  assert.equal(r.inBubbleOf.b, "a");
  assert.equal(r.exclusionReason.c, null);
}

// Capacity is NOT bubble
{
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const r = runGistAtThreshold(["a", "b", "c"], [0.9, 0.8, 0.7], v, 0.1, 2);
  assert.deepEqual(r.selectedIds, ["a", "b"]);
  assert.equal(r.exclusionReason.c, "capacity");
  assert.equal(r.inBubbleOf.c, null);
}

// Auto multi-threshold returns finite radius and selection
{
  const texts = [
    "кот собака животное дом",
    "кот собака животное двор",
    "ракета космос орбита спутник",
    "ракета космос станция марс",
  ];
  const vectors = localEmbedBatch(texts);
  const utils = texts.map((t) => computeUtility(t, "космос", []));
  const r = runGistSelection(
    ["a", "b", "c", "d"],
    utils,
    vectors,
    null,
    2,
  );
  assert.ok(r.selectedIds.length >= 1 && r.selectedIds.length <= 2);
  assert.ok(r.radius > 0 && r.radius < 1);
  assert.ok(r.totalUtility > 0);
}

// Distinctiveness null without competitors — no stub 0.5
assert.equal(computeTopicDistinctiveness("один два три четыре пять шесть семь восемь девять", []), null);

// Suggest radius from distances
{
  const d = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const s = suggestRadiusFromDistances(d);
  assert.ok(s >= 0.12 && s <= 0.75);
}

// Cosine sanity
{
  almost(cosineSimilarity([1, 0], [1, 0]), 1);
  almost(cosineDistance([1, 0], [0, 1]), 1);
}

console.log("gist.selftest: ok");
