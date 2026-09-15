const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with you your yours yourself yourselves
а без более бы был была были было быть в вам вас весь во вот все всего всех вы где да даже для до его ее если есть ещё же за здесь и из или им их к как ко когда кто ли либо мне может мы на над надо не него нее нет ни них но ну о об однако он она они оно от очень по под при про с со так также такой там те то того тоже той только том тот ты у уже хоть чего чем что чтобы эта эти это этом этот я`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s_-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termsFromText(text: string): Map<string, number> {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  // Биграммы — лучше отличают статьи одной ниши
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    tf.set(bigram, (tf.get(bigram) ?? 0) + 0.75);
  }

  // Лёгкие char-trigrams по кускам текста — ловят стиль/формулировки
  const compact = text.toLowerCase().replace(/\s+/g, " ").slice(0, 8000);
  for (let i = 0; i < compact.length - 2; i += 2) {
    const tri = `c:${compact.slice(i, i + 3)}`;
    if (tri.includes(" ")) continue;
    tf.set(tri, (tf.get(tri) ?? 0) + 0.15);
  }

  return tf;
}

/**
 * Локальные embeddings с TF-IDF по текущему набору документов.
 * Общие слова ниши (SEO, контент…) получают меньший вес — проценты перестают «залипать».
 */
export function localEmbedBatch(texts: string[]): number[][] {
  const docs = texts.map((t) => termsFromText(t));
  const df = new Map<string, number>();

  for (const tf of docs) {
    for (const term of tf.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // Берём самые информативные термины (не слишком редкие шумы в одном доке, не совсем общие)
  const n = docs.length;
  const vocab = [...df.entries()]
    .filter(([, count]) => count >= 1)
    .sort((a, b) => {
      const idfA = Math.log((n + 1) / (a[1] + 1)) + 1;
      const idfB = Math.log((n + 1) / (b[1] + 1)) + 1;
      return idfB * b[1] - idfA * a[1];
    })
    .slice(0, 4000)
    .map(([term]) => term);

  const index = new Map(vocab.map((term, i) => [term, i]));

  return docs.map((tf) => {
    const vec = new Array(vocab.length).fill(0);
    let maxTf = 1;
    for (const v of tf.values()) maxTf = Math.max(maxTf, v);

    for (const [term, raw] of tf) {
      const i = index.get(term);
      if (i == null) continue;
      const docFreq = df.get(term) ?? 1;
      // Слова, которые есть почти во всех статьях набора, почти обнуляем
      const idf = Math.log((n + 1) / (docFreq + 1)) + 1;
      const tfNorm = 0.5 + (0.5 * raw) / maxTf;
      vec[i] = tfNorm * idf;
    }

    return l2Normalize(vec);
  });
}

/** @deprecated kept for single-text helpers; batch path uses localEmbedBatch */
export function localEmbed(text: string): number[] {
  return localEmbedBatch([text])[0];
}

export function l2Normalize(vec: number[]): number[] {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

export async function openaiEmbed(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts.map((t) => t.slice(0, 12000)),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${err.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
  };

  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => l2Normalize(d.embedding));
}

export async function embedDocuments(
  texts: string[],
): Promise<{ vectors: number[][]; mode: "openai" | "local" }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    try {
      const vectors = await openaiEmbed(texts, key);
      return { vectors, mode: "openai" };
    } catch {
      // fall through to local
    }
  }

  return {
    vectors: localEmbedBatch(texts),
    mode: "local",
  };
}
