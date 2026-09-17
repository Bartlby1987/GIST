import { cosineSimilarity, embedDocuments } from "./embeddings";
import { buildInsights, computeTopicDistinctiveness } from "./gaps";
import {
  allPairDistances,
  computeBubbleRadii2D,
  computeQueryRelevance,
  computeUtility,
  pairwise,
  projectTo2D,
  runGistSelection,
  suggestRadiusFromDistances,
} from "./gist";
import { fetchPageText, wordCount } from "./scrape";
import type {
  AnalyzedDoc,
  AnalyzeRequest,
  AnalyzeResult,
  ScrapedPage,
} from "./types";

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function disambiguatePageLabels(pages: ScrapedPage[]): ScrapedPage[] {
  const counts = new Map<string, number>();
  for (const page of pages) {
    counts.set(page.label, (counts.get(page.label) ?? 0) + 1);
  }

  return pages.map((page) => {
    if ((counts.get(page.label) ?? 0) < 2) return page;

    const cleanTitle = page.title
      .replace(/\s*[|/·—].*$/u, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleanTitle || cleanTitle.toLowerCase() === page.label.toLowerCase()) {
      return page;
    }

    const short =
      cleanTitle.length > 52 ? `${cleanTitle.slice(0, 50)}…` : cleanTitle;

    return {
      ...page,
      label: `${page.label}: ${short}`,
    };
  });
}

async function loadSources(req: AnalyzeRequest): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];
  const tasks: Array<Promise<void>> = [];

  const yourUrl = req.yourUrl?.trim();
  const yourText = req.yourText?.trim();

  if (yourUrl) {
    tasks.push(
      (async () => {
        try {
          const page = await fetchPageText(yourUrl);
          pages.push({
            id: "you",
            role: "you",
            label: req.yourLabel?.trim() || hostLabel(yourUrl),
            url: page.finalUrl,
            title: page.title,
            text: page.text,
            wordCount: wordCount(page.text),
            headings: page.headings,
          });
        } catch (e) {
          pages.push({
            id: "you",
            role: "you",
            label: req.yourLabel?.trim() || hostLabel(yourUrl),
            url: yourUrl,
            title: hostLabel(yourUrl),
            text: "",
            wordCount: 0,
            headings: [],
            error: e instanceof Error ? e.message : "Fetch failed",
          });
        }
      })(),
    );
  } else if (yourText && yourText.length >= 80) {
    pages.push({
      id: "you",
      role: "draft",
      label: req.yourLabel?.trim() || "Ваш черновик",
      title: "Ваш черновик",
      text: yourText.slice(0, 24000),
      wordCount: wordCount(yourText),
      headings: [],
    });
  }

  const urls = [...new Set(req.competitorUrls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    8,
  );

  for (const [idx, url] of urls.entries()) {
    tasks.push(
      (async () => {
        const id = `comp-${idx}`;
        try {
          const page = await fetchPageText(url);
          pages.push({
            id,
            role: "competitor",
            label: hostLabel(url),
            url: page.finalUrl,
            title: page.title,
            text: page.text,
            wordCount: wordCount(page.text),
            headings: page.headings,
          });
        } catch (e) {
          pages.push({
            id,
            role: "competitor",
            label: hostLabel(url),
            url,
            title: hostLabel(url),
            text: "",
            wordCount: 0,
            headings: [],
            error: e instanceof Error ? e.message : "Fetch failed",
          });
        }
      })(),
    );
  }

  await Promise.all(tasks);
  return disambiguatePageLabels(pages);
}

export async function analyzeContent(req: AnalyzeRequest): Promise<AnalyzeResult> {
  const k = Math.min(8, Math.max(2, req.k ?? 4));
  const query = (req.query ?? "").trim();
  const manualRadius =
    req.radius == null || Number.isNaN(req.radius)
      ? null
      : Math.min(0.95, Math.max(0.05, req.radius));

  const pages = await loadSources(req);
  const usable = pages.filter((p) => !p.error && p.text.length >= 80);

  if (usable.length < 2) {
    const failed = pages.filter((p) => p.error).map((p) => `${p.label}: ${p.error}`);
    throw new Error(
      `Нужны минимум 2 читаемые страницы. ${failed.join(" | ") || "Добавьте свою страницу и конкурентов."}`,
    );
  }

  const { vectors, mode } = await embedDocuments(
    usable.map((p) => `${p.title}\n${p.headings.join("\n")}\n${p.text}`),
  );

  const pairDistances = allPairDistances(vectors);
  const suggestedRadius = suggestRadiusFromDistances(pairDistances);
  const radiusMode = manualRadius == null ? "auto" : "manual";

  const utilities = usable.map((p) => computeUtility(p.text, query, p.headings));
  const queryScores = usable.map((p) =>
    computeQueryRelevance(p.text, query, p.headings, p.title),
  );
  const ids = usable.map((p) => p.id);

  const gist = runGistSelection(ids, utilities, vectors, manualRadius, k);
  const radius = gist.radius;

  const coords = projectTo2D(vectors);
  const pairs = pairwise(ids, vectors);

  const youIdx = usable.findIndex((p) => p.role === "you" || p.role === "draft");

  const draftDocs = usable.map((p, i) => {
    const nearest = gist.nearestSelected[p.id];
    let similarityToYou: number | null = null;
    if (youIdx >= 0 && i !== youIdx) {
      similarityToYou =
        Math.round(cosineSimilarity(vectors[youIdx], vectors[i]) * 1000) / 1000;
    }

    return {
      id: p.id,
      role: p.role,
      label: p.label,
      url: p.url,
      title: p.title,
      wordCount: p.wordCount,
      headings: p.headings.slice(0, 12),
      utility: utilities[i],
      queryRelevance: queryScores[i],
      selected: gist.selectedIds.includes(p.id),
      selectionOrder: gist.selectedIds.includes(p.id)
        ? gist.selectedIds.indexOf(p.id) + 1
        : null,
      nearestSelectedId: nearest?.id ?? null,
      nearestSelectedDistance: nearest?.distance ?? null,
      inBubbleOf: gist.inBubbleOf[p.id] ?? null,
      exclusionReason: gist.exclusionReason[p.id] ?? null,
      similarityToYou,
      x: coords[i].x,
      y: coords[i].y,
      bubbleRadius2D: null as number | null,
      preview: p.text.slice(0, 220),
    } satisfies AnalyzedDoc;
  });

  const bubbleRadii = computeBubbleRadii2D(draftDocs, pairs, radius);
  for (const d of draftDocs) {
    d.bubbleRadius2D = bubbleRadii[d.id] ?? null;
  }

  const errorDocs: AnalyzedDoc[] = pages
    .filter((p) => p.error)
    .map((p) => ({
      id: p.id,
      role: p.role,
      label: p.label,
      url: p.url,
      title: p.title,
      wordCount: 0,
      headings: [],
      utility: 0,
      queryRelevance: null,
      selected: false,
      selectionOrder: null,
      nearestSelectedId: null,
      nearestSelectedDistance: null,
      inBubbleOf: null,
      exclusionReason: null,
      similarityToYou: null,
      x: 0,
      y: 0,
      bubbleRadius2D: null,
      preview: "",
      error: p.error,
    }));

  const docs = [...draftDocs, ...errorDocs];
  const youDoc = draftDocs.find((d) => d.role === "you" || d.role === "draft");

  let nearestCompetitor: AnalyzedDoc | undefined;
  let nearestSim: number | null = null;
  if (youIdx >= 0) {
    for (const d of draftDocs) {
      if (d.role === "you" || d.role === "draft") continue;
      const i = usable.findIndex((u) => u.id === d.id);
      if (i < 0) continue;
      const sim =
        Math.round(cosineSimilarity(vectors[youIdx], vectors[i]) * 1000) / 1000;
      if (nearestSim == null || sim > nearestSim) {
        nearestSim = sim;
        nearestCompetitor = d;
      }
    }
  }

  const blockedBy =
    youDoc?.inBubbleOf != null
      ? draftDocs.find((d) => d.id === youDoc.inBubbleOf) ?? null
      : null;

  const youPage = youIdx >= 0 ? usable[youIdx] : undefined;
  const competitorPages = usable.filter((p) => p.role === "competitor");
  const ownTopicShare = youPage
    ? computeTopicDistinctiveness(
        youPage.text,
        competitorPages.map((p) => p.text),
      )
    : null;

  const insights = buildInsights(draftDocs, usable, query, radius);

  return {
    query,
    radius,
    suggestedRadius,
    radiusMode,
    k,
    embeddingMode: mode,
    docs,
    selectedIds: gist.selectedIds,
    pairs,
    insights,
    youStatus: {
      selected: Boolean(youDoc?.selected),
      inBubble: youDoc?.exclusionReason === "bubble",
      exclusionReason: youDoc?.exclusionReason ?? null,
      blockedByLabel: blockedBy?.label ?? null,
      nearestCompetitorLabel: nearestCompetitor?.label ?? null,
      similarityToNearestCompetitor: nearestSim,
      distanceToNearestCompetitor:
        nearestSim == null ? null : Math.round((1 - nearestSim) * 1000) / 1000,
      ownTopicShare,
      utility: youDoc?.utility ?? null,
    },
    fetchedAt: new Date().toISOString(),
  };
}
