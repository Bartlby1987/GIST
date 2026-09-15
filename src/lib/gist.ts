import { cosineDistance, cosineSimilarity, tokenize } from "./embeddings";

export type ExclusionReason = "bubble" | "capacity" | null;

export type GistSelectionResult = {
  selectedIds: string[];
  /** Кто выбил документ зоной (только реальная близость, не лимит k) */
  inBubbleOf: Record<string, string | null>;
  /** Почему не в отборе */
  exclusionReason: Record<string, ExclusionReason>;
  nearestSelected: Record<string, { id: string; distance: number } | null>;
  radius: number;
  /** Суммарная полезность отобранных */
  totalUtility: number;
};

/**
 * Полезность (utility) — без заглушек.
 * Нормализуем вклады так, чтобы итог был честным 0..1 по данным текста.
 */
export function computeUtility(text: string, query: string, headings: string[]): number {
  const words = tokenize(text);
  if (words.length === 0) return 0;

  const unique = new Set(words);
  const lengthScore = clamp01(Math.log10(words.length + 1) / Math.log10(3000));
  const density = clamp01(unique.size / Math.max(words.length, 1));
  const headingScore = clamp01(headings.length / 12);

  const qTokens = tokenize(query);
  let queryScore = 0;
  let hasQuery = false;
  if (qTokens.length > 0) {
    hasQuery = true;
    let hits = 0;
    for (const t of qTokens) if (unique.has(t)) hits += 1;
    queryScore = hits / qTokens.length;
  }

  // Если запроса нет — его вес отдаём длине и плотности
  const wQuery = hasQuery ? 0.28 : 0;
  const wLength = hasQuery ? 0.34 : 0.48;
  const wDensity = hasQuery ? 0.22 : 0.32;
  const wHeadings = hasQuery ? 0.16 : 0.2;

  const raw =
    wLength * lengthScore +
    wDensity * density +
    wQuery * queryScore +
    wHeadings * headingScore;

  return Math.round(clamp01(raw) * 1000) / 1000;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Авто-радиус: доля пар считается «слишком близкими». */
export function suggestRadiusFromDistances(distances: number[]): number {
  if (distances.length === 0) return 0.35;
  const sorted = [...distances].sort((a, b) => a - b);
  // 40-й перцентиль дистанций: типичный порог «рядом» для этого набора
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(sorted.length * 0.4)));
  const value = sorted[idx];
  return Math.round(clamp01(Math.max(0.12, Math.min(0.75, value))) * 1000) / 1000;
}

export function allPairDistances(vectors: number[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      out.push(cosineDistance(vectors[i], vectors[j]));
    }
  }
  return out;
}

/**
 * Один шаг GIST при фиксированном пороге d (как в статье):
 * жадно берём точки с max utility, пока между выбранными distance >= d.
 */
export function runGistAtThreshold(
  ids: string[],
  utilities: number[],
  vectors: number[][],
  radius: number,
  k: number,
): GistSelectionResult {
  const order = ids
    .map((id, i) => ({ id, i, utility: utilities[i] }))
    .sort((a, b) => b.utility - a.utility || a.id.localeCompare(b.id));

  const selected: number[] = [];
  const selectedIds: string[] = [];
  const inBubbleOf: Record<string, string | null> = {};
  const exclusionReason: Record<string, ExclusionReason> = {};
  const nearestSelected: Record<string, { id: string; distance: number } | null> = {};

  for (const item of order) {
    let blockedBy: string | null = null;
    let minDist = Infinity;
    let nearestId: string | null = null;

    for (const s of selected) {
      const d = cosineDistance(vectors[item.i], vectors[s]);
      if (d < minDist) {
        minDist = d;
        nearestId = ids[s];
      }
      // Первый в selected = самый полезный VIP среди уже взятых
      if (blockedBy == null && d < radius) {
        blockedBy = ids[s];
      }
    }

    nearestSelected[item.id] =
      nearestId == null || !Number.isFinite(minDist)
        ? null
        : { id: nearestId, distance: Math.round(minDist * 1000) / 1000 };

    if (blockedBy) {
      inBubbleOf[item.id] = blockedBy;
      exclusionReason[item.id] = "bubble";
      continue;
    }

    if (selectedIds.length >= k) {
      inBubbleOf[item.id] = null;
      exclusionReason[item.id] = "capacity";
      continue;
    }

    selected.push(item.i);
    selectedIds.push(item.id);
    inBubbleOf[item.id] = null;
    exclusionReason[item.id] = null;
  }

  for (const id of selectedIds) {
    if (selectedIds.length <= 1) {
      nearestSelected[id] = null;
      continue;
    }
    const i = ids.indexOf(id);
    let best: { id: string; distance: number } | null = null;
    for (const other of selectedIds) {
      if (other === id) continue;
      const j = ids.indexOf(other);
      const d = cosineDistance(vectors[i], vectors[j]);
      if (!best || d < best.distance) {
        best = { id: other, distance: Math.round(d * 1000) / 1000 };
      }
    }
    nearestSelected[id] = best;
  }

  const totalUtility = selectedIds.reduce((sum, id) => {
    const i = ids.indexOf(id);
    return sum + (utilities[i] ?? 0);
  }, 0);

  return {
    selectedIds,
    inBubbleOf,
    exclusionReason,
    nearestSelected,
    radius,
    totalUtility: Math.round(totalUtility * 1000) / 1000,
  };
}

/**
 * Полный GIST-like отбор:
 * если radius задан — считаем на нём (интерактивный «радиус зоны»);
 * если нет — перебираем пороги и берём лучший по сумме utility при размере <= k
 * (как multi-threshold идея из статьи Google Research).
 */
export function runGistSelection(
  ids: string[],
  utilities: number[],
  vectors: number[][],
  radius: number | null | undefined,
  k: number,
): GistSelectionResult {
  if (ids.length === 0) {
    return {
      selectedIds: [],
      inBubbleOf: {},
      exclusionReason: {},
      nearestSelected: {},
      radius: 0.35,
      totalUtility: 0,
    };
  }

  if (radius != null && Number.isFinite(radius)) {
    const r = clamp01(Math.max(0.05, Math.min(0.95, radius)));
    return runGistAtThreshold(ids, utilities, vectors, r, k);
  }

  const distances = allPairDistances(vectors);
  const candidates = buildThresholdCandidates(distances);
  let best: GistSelectionResult | null = null;

  for (const d of candidates) {
    const result = runGistAtThreshold(ids, utilities, vectors, d, k);
    if (
      !best ||
      result.totalUtility > best.totalUtility ||
      (result.totalUtility === best.totalUtility &&
        result.selectedIds.length > best.selectedIds.length)
    ) {
      best = result;
    }
  }

  return best ?? runGistAtThreshold(ids, utilities, vectors, suggestRadiusFromDistances(distances), k);
}

function buildThresholdCandidates(distances: number[]): number[] {
  if (distances.length === 0) return [0.35];
  const sorted = [...distances].sort((a, b) => a - b);
  const picks = new Set<number>();
  for (const p of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]) {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    picks.add(Math.round(sorted[idx] * 1000) / 1000);
  }
  picks.add(Math.round(suggestRadiusFromDistances(sorted) * 1000) / 1000);
  return [...picks].sort((a, b) => a - b);
}

export function pairwise(
  ids: string[],
  vectors: number[][],
): Array<{ a: string; b: string; distance: number; similarity: number }> {
  const out: Array<{ a: string; b: string; distance: number; similarity: number }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      out.push({
        a: ids[i],
        b: ids[j],
        similarity: Math.round(sim * 1000) / 1000,
        distance: Math.round((1 - sim) * 1000) / 1000,
      });
    }
  }
  return out.sort((a, b) => b.similarity - a.similarity);
}

/** Project high-dim vectors to 2D with classical PCA (top-2 components). */
export function projectTo2D(vectors: number[][]): Array<{ x: number; y: number }> {
  const n = vectors.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: 0.5, y: 0.5 }];

  const dim = vectors[0].length;
  const mean = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) mean[i] += v[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= n;

  const centered = vectors.map((v) => v.map((x, i) => x - mean[i]));

  const components: number[][] = [];
  for (let c = 0; c < 2; c++) {
    let vec = randomUnit(dim, c + 1);
    for (let iter = 0; iter < 48; iter++) {
      const acc = new Array(dim).fill(0);
      for (const row of centered) {
        const proj = dot(row, vec);
        for (let i = 0; i < dim; i++) acc[i] += row[i] * proj;
      }
      for (const prev of components) {
        const p = dot(acc, prev);
        for (let i = 0; i < dim; i++) acc[i] -= prev[i] * p;
      }
      vec = normalize(acc);
    }
    components.push(vec);
  }

  const raw = centered.map((row) => ({
    x: dot(row, components[0]),
    y: dot(row, components[1]),
  }));

  const xs = raw.map((p) => p.x);
  const ys = raw.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  return raw.map((p) => ({
    x: 0.12 + ((p.x - minX) / spanX) * 0.76,
    y: 0.14 + ((p.y - minY) / spanY) * 0.72,
  }));
}

/**
 * Радиус круга на 2D-карте в координатах 0..1:
 * покрывает реально выбитые точки + оценку порога по масштабу embedding→2D.
 */
export function computeBubbleRadii2D(
  docs: Array<{
    id: string;
    x: number;
    y: number;
    selected: boolean;
    inBubbleOf: string | null;
  }>,
  pairs: Array<{ a: string; b: string; distance: number }>,
  embeddingRadius: number,
): Record<string, number> {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const scaleSamples: number[] = [];

  for (const p of pairs) {
    const da = byId.get(p.a);
    const db = byId.get(p.b);
    if (!da || !db || p.distance < 1e-6) continue;
    const screen = Math.hypot(da.x - db.x, da.y - db.y);
    scaleSamples.push(screen / p.distance);
  }

  scaleSamples.sort((a, b) => a - b);
  const scale =
    scaleSamples.length > 0
      ? scaleSamples[Math.floor(scaleSamples.length * 0.5)]
      : 0.35;

  const out: Record<string, number> = {};
  for (const doc of docs) {
    if (!doc.selected) continue;

    const locked = docs.filter((d) => d.inBubbleOf === doc.id);
    let r = embeddingRadius * scale;

    if (locked.length > 0) {
      const maxLocked = Math.max(
        ...locked.map((d) => Math.hypot(d.x - doc.x, d.y - doc.y)),
      );
      r = Math.max(r, maxLocked * 1.05);
    }

    out[doc.id] = Math.max(0.04, Math.min(0.35, r));
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

function randomUnit(dim: number, seed: number): number[] {
  const v = new Array(dim);
  let s = seed * 997;
  for (let i = 0; i < dim; i++) {
    s = (s * 16807) % 2147483647;
    v[i] = (s / 2147483647) * 2 - 1;
  }
  return normalize(v);
}
