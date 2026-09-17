export type DocRole = "you" | "competitor" | "draft";

export type ExclusionReason = "bubble" | "capacity" | null;

export type ScrapedPage = {
  id: string;
  role: DocRole;
  label: string;
  url?: string;
  title: string;
  text: string;
  wordCount: number;
  headings: string[];
  error?: string;
};

export type AnalyzedDoc = {
  id: string;
  role: DocRole;
  label: string;
  url?: string;
  title: string;
  wordCount: number;
  headings: string[];
  utility: number;
  /** Попадание в поисковый запрос; null если запрос пустой */
  queryRelevance: number | null;
  selected: boolean;
  selectionOrder: number | null;
  nearestSelectedId: string | null;
  nearestSelectedDistance: number | null;
  /** ID более полезного источника, в чью зону попали (только реальная близость) */
  inBubbleOf: string | null;
  exclusionReason: ExclusionReason;
  similarityToYou: number | null;
  x: number;
  y: number;
  /** Радиус зоны на 2D-карте (0..1), только у selected */
  bubbleRadius2D: number | null;
  preview: string;
  error?: string;
};

export type PairSimilarity = {
  a: string;
  b: string;
  distance: number;
  similarity: number;
};

export type GapInsight = {
  type: "overlap" | "missing" | "strength" | "action";
  title: string;
  detail: string;
  /** Структурированный список для понятного UI (темы, пункты) */
  items?: Array<{ text: string; meta?: string }>;
};

export type AnalyzeResult = {
  query: string;
  radius: number;
  suggestedRadius: number;
  radiusMode: "manual" | "auto";
  k: number;
  embeddingMode: "openai" | "local";
  docs: AnalyzedDoc[];
  selectedIds: string[];
  pairs: PairSimilarity[];
  insights: GapInsight[];
  youStatus: {
    selected: boolean;
    inBubble: boolean;
    exclusionReason: ExclusionReason;
    blockedByLabel: string | null;
    nearestCompetitorLabel: string | null;
    similarityToNearestCompetitor: number | null;
    distanceToNearestCompetitor: number | null;
    /** Доля ваших частых тем вне топа конкурентов; null если нельзя посчитать */
    ownTopicShare: number | null;
    utility: number | null;
  };
  fetchedAt: string;
};

export type AnalyzeRequest = {
  query?: string;
  yourUrl?: string;
  yourText?: string;
  yourLabel?: string;
  competitorUrls: string[];
  /** Если не передан — авто-порог по данным набора (GIST multi-threshold / suggest) */
  radius?: number | null;
  k?: number;
};
