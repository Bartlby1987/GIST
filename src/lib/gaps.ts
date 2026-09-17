import { tokenize } from "./embeddings";
import type { AnalyzedDoc, GapInsight, ScrapedPage } from "./types";

export function topTerms(text: string, limit = 12): string[] {
  const tf = new Map<string, number>();
  for (const t of tokenize(text)) tf.set(t, (tf.get(t) ?? 0) + 1);
  return [...tf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

/**
 * Доля ваших частых тем, которых нет в топе конкурентов.
 * null — если данных недостаточно (не заглушка).
 */
export function computeTopicDistinctiveness(
  yourText: string,
  competitorTexts: string[],
): number | null {
  if (!yourText.trim() || competitorTexts.length === 0) return null;

  const youTop = topTerms(yourText, 60);
  if (youTop.length < 8) return null;

  const competitorTop = new Set<string>();
  for (const text of competitorTexts) {
    for (const term of topTerms(text, 60)) competitorTop.add(term);
  }

  let unique = 0;
  for (const term of youTop) {
    if (!competitorTop.has(term)) unique += 1;
  }

  return Math.round((unique / youTop.length) * 1000) / 1000;
}

export function buildInsights(
  docs: AnalyzedDoc[],
  pages: ScrapedPage[],
  query: string,
  radius: number,
): GapInsight[] {
  const insights: GapInsight[] = [];
  const you = docs.find((d) => d.role === "you" || d.role === "draft");
  const competitors = docs.filter((d) => d.role === "competitor" && !d.error);
  const pageById = new Map(pages.map((p) => [p.id, p]));

  // Порог «опасно близко» = внутри exclusion radius по cosine distance
  const dangerSim = Math.round((1 - radius) * 1000) / 1000;

  if (!you) {
    insights.push({
      type: "action",
      title: "Добавьте свою страницу",
      detail: "Без вашего URL или черновика нельзя понять, попадаете ли вы в чужую зону.",
    });
    return insights;
  }

  if (you.exclusionReason === "bubble" && you.inBubbleOf) {
    const vip = docs.find((d) => d.id === you.inBubbleOf);
    insights.push({
      type: "overlap",
      title: "Вы внутри чужой зоны (GIST)",
      detail: vip
        ? `Дистанция до более полезного источника «${vip.label}» меньше порога ${radius.toFixed(2)}. В логике GIST вас отфильтровывают как redundant.`
        : `Вы ближе порога ${radius.toFixed(2)} к более полезному источнику.`,
    });
  } else if (you.selected) {
    insights.push({
      type: "strength",
      title: "Вы в GIST-выборке",
      detail: `При пороге diversity ${radius.toFixed(2)} страница и полезна, и достаточно далека от других отобранных.`,
    });
  } else if (you.exclusionReason === "capacity") {
    insights.push({
      type: "action",
      title: "Не копия — просто не влезли в лимит k",
      detail:
        "Вас не выбили зоной похожести. Мест в коротком списке не хватило: повышайте полезность (структура, факты, ответ на запрос).",
    });
  }

  const youPage = pageById.get(you.id);
  const queryTokens = new Set(tokenize(query));
  const hasQuery = queryTokens.size > 0;

  if (youPage && competitors.length) {
    const youTerms = new Set(topTerms(youPage.text, 40));
    const shared: string[] = [];
    const missingRaw: Array<{ text: string; meta: string; queryHit: number }> = [];

    for (const c of competitors) {
      const page = pageById.get(c.id);
      if (!page) continue;
      for (const h of page.headings.slice(0, 8)) {
        const tokens = tokenize(h);
        if (tokens.length === 0) continue;
        const covered = tokens.filter((t) => youTerms.has(t)).length / tokens.length;
        if (covered >= 0.35) continue;
        const already = missingRaw.some(
          (item) => item.text.toLowerCase() === h.toLowerCase(),
        );
        if (already) continue;
        const queryHit = hasQuery
          ? tokens.filter((t) => queryTokens.has(t)).length / tokens.length
          : 0;
        missingRaw.push({ text: h, meta: c.label, queryHit });
      }
      for (const t of topTerms(page.text, 10)) {
        if (youTerms.has(t) && !shared.includes(t) && shared.length < 8) shared.push(t);
      }
    }

    // С запросом — сначала подзаголовки, близкие к запросу; без запроса — как есть
    const missingTopics = (
      hasQuery
        ? [...missingRaw]
            .sort((a, b) => b.queryHit - a.queryHit)
            .filter((item, idx) => item.queryHit > 0 || idx < 3)
        : missingRaw
    )
      .slice(0, 8)
      .map(({ text, meta, queryHit }) => ({
        text,
        meta: hasQuery && queryHit > 0 ? `${meta} · к запросу` : meta,
      }));

    if (shared.length) {
      insights.push({
        type: "overlap",
        title: "Общие частые темы с конкурентами",
        detail: shared.join(", "),
        items: shared.map((text) => ({ text })),
      });
    }

    if (missingTopics.length) {
      insights.push({
        type: "missing",
        title: "Подзаголовки у конкурентов, которых у вас почти нет",
        detail: hasQuery
          ? `Это разделы чужих статей, которых у вас почти нет. Связь с запросом «${query}»: берите только то, что помогает лучше ответить на него (факты, сравнение, сценарий). Не копируйте весь список — иначе снова станете похожи на конкурента.`
          : "Это разделы чужих статей (H2/H3), которых у вас почти нет. Добавляйте только если они усиливают ответ читателю. Без поискового запроса сверху сложно понять, какие из них важны — укажите запрос.",
        items: missingTopics,
      });
    }

    const youUnique = topTerms(youPage.text, 25).filter((t) => {
      return !competitors.some((c) => {
        const p = pageById.get(c.id);
        return p ? topTerms(p.text, 30).includes(t) : false;
      });
    });

    if (youUnique.length) {
      insights.push({
        type: "strength",
        title: "Ваши относительно уникальные слова",
        detail: "Эти частые слова сильнее выражены у вас, чем у конкурентов.",
        items: youUnique.slice(0, 8).map((text) => ({ text })),
      });
    }
  }

  const withSim = competitors
    .map((c) => ({ c, sim: c.similarityToYou }))
    .filter((x): x is { c: AnalyzedDoc; sim: number } => x.sim != null)
    .sort((a, b) => b.sim - a.sim);

  const nearest = withSim[0];
  if (nearest) {
    if (nearest.sim >= dangerSim) {
      insights.push({
        type: "action",
        title: "Близко к порогу зоны исключения",
        detail: `«${nearest.c.label}» — похожесть ${Math.round(nearest.sim * 100)}% (порог зоны ≈ ${Math.round(dangerSim * 100)}%). Добавьте свой кейс, цифры или другой угол, а не тот же план статьи.`,
      });
    } else if (nearest.sim < dangerSim * 0.65) {
      insights.push({
        type: "action",
        title: "Вы далеко от конкурентов — проверьте пользу",
        detail: query
          ? `Отличаться хорошо, но текст должен закрывать запрос «${query}».`
          : "Отличаться хорошо, но страница должна закрывать реальный поисковый запрос.",
      });
    } else {
      insights.push({
        type: "action",
        title: "Усильте information gain",
        detail:
          "Добавьте то, чего нет у лидера: свои данные, личный опыт, узкий сценарий или доказанный спорный тезис.",
      });
    }
  }

  return insights.slice(0, 7);
}
