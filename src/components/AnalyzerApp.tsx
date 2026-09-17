"use client";

import { useMemo, useState, useTransition } from "react";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { GistMap } from "@/components/GistMap";
import { articleTooltip } from "@/lib/labels";
import type { AnalyzeResult } from "@/lib/types";

const DEMO = {
  query: "уникальность контента для SEO",
  yourUrl:
    "https://sdelaem.agency/blog/kak-rabotaet-unikalnost-teksta-i-zachem-ona-nuzhna-seo-v-2026-godu/",
  competitors: [
    "https://habr.com/ru/articles/1041186/",
    "https://habr.com/ru/articles/1043676/",
    "https://brainbox-marketing.ru/blog/seo-kontent-ai-ekspert-2025/",
    "https://giport.ru/sovet/itech/seo/kakaya-proverka-unikalnosti-luchshe-i-tochnee-text-ru-ili-content-watch-ru",
  ],
};

function translateError(message: string): string {
  if (message.includes("Need at least 2")) {
    return "Нужны минимум 2 читаемые страницы. Проверьте URL: сайт мог заблокировать загрузку или отдал слишком мало текста.";
  }
  if (message.includes("Provide yourUrl") || message.includes("yourText")) {
    return "Укажите свой URL или вставьте черновик (минимум 80 символов).";
  }
  if (message.includes("Invalid request")) {
    return "Проверьте формат ссылок: нужны полные URL вида https://…";
  }
  if (message.includes("Analyze failed") || message.includes("Something went wrong")) {
    return "Не удалось выполнить анализ. Попробуйте ещё раз или замените проблемный URL.";
  }
  return message;
}

export function AnalyzerApp() {
  const [query, setQuery] = useState(DEMO.query);
  const [yourUrl, setYourUrl] = useState(DEMO.yourUrl);
  const [yourText, setYourText] = useState("");
  const [competitorText, setCompetitorText] = useState(DEMO.competitors.join("\n"));
  const [radius, setRadius] = useState(0.42);
  const [autoRadius, setAutoRadius] = useState(true);
  const [k, setK] = useState(4);
  const [mode, setMode] = useState<"url" | "draft">("url");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "map" | "sources">("overview");
  const [pending, startTransition] = useTransition();

  const activeDoc = useMemo(
    () => result?.docs.find((d) => d.id === activeId) ?? null,
    [result, activeId],
  );

  function runAnalyze() {
    setError(null);
    const competitorUrls = competitorText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            yourUrl: mode === "url" ? yourUrl : undefined,
            yourText: mode === "draft" ? yourText : undefined,
            competitorUrls,
            radius: autoRadius ? null : radius,
            k,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analyze failed");
        const parsed = data as AnalyzeResult;
        setResult(parsed);
        setRadius(parsed.radius);
        setTab("overview");
        const you = parsed.docs.find((d) => d.role === "you" || d.role === "draft");
        setActiveId(you?.id ?? parsed.docs[0]?.id ?? null);
      } catch (e) {
        setResult(null);
        setError(translateError(e instanceof Error ? e.message : "Something went wrong"));
      }
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-20 pt-6 md:px-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="panel space-y-5 self-start p-5 md:sticky md:top-6">
        <div>
          <p className="eyebrow">Что делать здесь</p>
          <h2 className="font-display text-2xl text-[var(--ink)]">Сравнить статьи</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            Вставьте свою ссылку и ссылки конкурентов. Нажмите кнопку. Получите простой ответ:{" "}
            <strong className="font-semibold text-[var(--ink)]">копируете ли вы чужой текст</strong> и
            что поменять.
          </p>
        </div>

        <label className="field">
          <span>Поисковый запрос</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="например: лучшие CRM для малого бизнеса"
          />
          <span className="field-hint">
            По нему считаем полезность и отбираем, какие «дыры» у конкурентов реально важны.
          </span>
        </label>

        <div className="flex gap-2 rounded-full bg-[var(--mist)] p-1">
          <button
            type="button"
            className={`segment ${mode === "url" ? "segment-active" : ""}`}
            onClick={() => setMode("url")}
          >
            Моя ссылка
          </button>
          <button
            type="button"
            className={`segment ${mode === "draft" ? "segment-active" : ""}`}
            onClick={() => setMode("draft")}
          >
            Мой текст
          </button>
        </div>

        {mode === "url" ? (
          <label className="field">
            <span>Ссылка на вашу статью</span>
            <input
              value={yourUrl}
              onChange={(e) => setYourUrl(e.target.value)}
              placeholder="https://yoursite.com/statya"
            />
          </label>
        ) : (
          <label className="field">
            <span>Вставьте текст статьи</span>
            <textarea
              value={yourText}
              onChange={(e) => setYourText(e.target.value)}
              rows={7}
              placeholder="Вставьте минимум примерно 80 символов…"
            />
          </label>
        )}

        <label className="field">
          <span>Ссылки конкурентов (каждая с новой строки)</span>
          <textarea
            value={competitorText}
            onChange={(e) => setCompetitorText(e.target.value)}
            rows={6}
            placeholder={"https://site1.com/statya\nhttps://site2.com/statya"}
          />
        </label>

        <details className="rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-[var(--ink)]">
            Дополнительно (можно не трогать)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
              <input
                type="checkbox"
                checked={autoRadius}
                onChange={(e) => setAutoRadius(e.target.checked)}
              />
              Авто-порог зоны (как multi-threshold GIST)
            </label>
            {!autoRadius && (
              <label className="field">
                <span>
                  Ручной порог зоны: {radius.toFixed(2)}{" "}
                  <em className="not-italic text-[var(--muted)]">
                    ({radius < 0.35 ? "мягче" : radius > 0.55 ? "строже" : "обычно"})
                  </em>
                </span>
                <input
                  type="range"
                  min={0.12}
                  max={0.75}
                  step={0.01}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                />
                <span className="normal-case tracking-normal text-[11px] text-[var(--muted)]">
                  Чем выше порог — тем легче попасть в «чужую зону» из‑за похожести.
                </span>
              </label>
            )}
            <label className="field">
              <span>Сколько разных статей оставлять (k): {k}</span>
              <input
                type="range"
                min={2}
                max={6}
                step={1}
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
              />
            </label>
          </div>
        </details>

        <button type="button" className="cta w-full" disabled={pending} onClick={runAnalyze}>
          {pending ? "Сравниваем статьи…" : "Сравнить"}
        </button>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Мы сами открываем сайты и читаем текст. Если сайт не пускает ботов — по этой ссылке будет
          ошибка.
        </p>
      </aside>

      <section className="space-y-5">
        {!result && !pending && (
          <div className="panel flex min-h-[420px] flex-col items-start justify-center gap-5 p-8">
            <p className="eyebrow">За 10 секунд</p>
            <h2 className="font-display max-w-xl text-3xl text-[var(--ink)] md:text-4xl">
              Одна кнопка — и видно, не копируете ли вы конкурентов
            </h2>
            <div className="explain-box w-full max-w-xl">
              <ol className="explain-steps">
                <li>
                  <strong>Слева уже есть пример</strong> — можно сразу нажать «Сравнить».
                </li>
                <li>
                  <strong>Потом появится большой ответ</strong>: Хорошо / Так себе / Плохо.
                </li>
                <li>
                  <strong>Под ним графики</strong>: кто пишет почти как вы и чей текст сильнее.
                </li>
              </ol>
            </div>
          </div>
        )}

        {pending && (
          <div className="panel flex min-h-[420px] flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="loader" />
            <p className="font-display text-2xl text-[var(--ink)]">Читаем статьи с сайтов…</p>
            <p className="max-w-md text-sm text-[var(--muted)]">
              Это может занять несколько секунд — открываем реальные страницы.
            </p>
          </div>
        )}

        {result && !pending && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat
                label="Короткий ответ"
                value={
                  result.youStatus.inBubble
                    ? "Похожи на чужую"
                    : result.youStatus.selected
                      ? "Всё ок"
                      : result.youStatus.exclusionReason === "capacity"
                        ? "Не копия, но слабо"
                        : "Нет оценки"
                }
                hint={
                  result.youStatus.inBubble
                    ? result.youStatus.blockedByLabel
                      ? `Зона: ${result.youStatus.blockedByLabel}`
                      : "Внутри exclusion bubble"
                    : result.youStatus.selected
                      ? "В GIST-выборке"
                      : "Не выбили зоной"
                }
                tone={
                  result.youStatus.inBubble
                    ? "warn"
                    : result.youStatus.selected
                      ? "ok"
                      : undefined
                }
              />
              <Stat
                label="Свои темы"
                value={
                  result.youStatus.ownTopicShare == null
                    ? "—"
                    : `${Math.round(result.youStatus.ownTopicShare * 100)}%`
                }
                hint="Доля ваших частых тем вне топа конкурентов"
              />
              <Stat
                label="Ближайший конкурент"
                value={result.youStatus.nearestCompetitorLabel ?? "—"}
                hint={
                  result.youStatus.similarityToNearestCompetitor != null
                    ? `Похожесть ${Math.round(result.youStatus.similarityToNearestCompetitor * 100)}% · дистанция ${result.youStatus.distanceToNearestCompetitor?.toFixed(2)}`
                    : "Нет данных"
                }
              />
              <Stat
                label="Порог зоны"
                value={result.radius.toFixed(2)}
                hint={
                  result.radiusMode === "auto"
                    ? `Авто · рекомендация ${result.suggestedRadius.toFixed(2)}`
                    : `Ручной · рекомендация ${result.suggestedRadius.toFixed(2)}`
                }
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["overview", "Главное"],
                  ["map", "Картинка"],
                  ["sources", "Что делать"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`tab-btn ${tab === id ? "tab-active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "overview" && <AnalyticsPanel result={result} />}

            {tab === "map" && (
              <div className="space-y-4">
                <div className="explain-box">
                  <p className="plain-hint !mt-0">
                    Красная точка — вы. Чем ближе точки, тем похожее смысл. Круг — реальная зона
                    GIST: он покрывает статьи, которые этот источник выбил как слишком похожие.
                  </p>
                </div>
                <GistMap
                  docs={result.docs}
                  activeId={activeId}
                  onSelect={setActiveId}
                />
                {activeDoc && !activeDoc.error && (
                  <div className="panel p-5">
                    <p className="eyebrow">Вы выбрали</p>
                    <h3 className="font-display text-2xl text-[var(--ink)]">{activeDoc.title}</h3>
                    {activeDoc.url && (
                      <a
                        href={activeDoc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm text-[var(--signal)] underline-offset-2 hover:underline"
                      >
                        Открыть страницу
                      </a>
                    )}
                    <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                      {activeDoc.preview}…
                    </p>
                  </div>
                )}
              </div>
            )}

            {tab === "sources" && (
              <div className="grid items-stretch gap-4 lg:grid-cols-2">
                <div className="panel h-full p-5">
                  <p className="eyebrow">По шагам</p>
                  <h3 className="font-display text-xl text-[var(--ink)]">Что улучшить</h3>
                  <p className="plain-hint">
                    «Пробелы» — только чужие разделы по вашему запросу сверху, которых у вас почти
                    нет. Мимо темы не показываем.
                  </p>
                  <ul className="mt-3 space-y-3">
                    {result.insights.map((ins) => (
                      <li key={`${ins.type}-${ins.title}`} className="insight" data-type={ins.type}>
                        <strong>{ins.title}</strong>
                        {ins.detail && <p>{ins.detail}</p>}
                        {ins.items && ins.items.length > 0 && (
                          <ul className="insight-list">
                            {ins.items.map((item, idx) => (
                              <li key={`${item.text}-${idx}`}>
                                <span className="insight-list-mark" aria-hidden>
                                  {idx + 1}
                                </span>
                                <span className="insight-list-body">
                                  <span className="insight-list-text">{item.text}</span>
                                  {item.meta && (
                                    <span className="insight-list-meta">у {item.meta}</span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="panel flex h-full min-h-[70vh] flex-col p-5">
                  <p className="eyebrow">Список</p>
                  <h3 className="font-display text-xl text-[var(--ink)]">Все статьи</h3>
                  <ul className="mt-3 min-h-0 flex-1 space-y-2 overflow-auto pr-1">
                    {result.docs.map((d) => {
                      const isYou = d.role === "you" || d.role === "draft";
                      return (
                        <li key={d.id}>
                          <button
                            type="button"
                            className={`source-row ${activeId === d.id ? "source-active" : ""}`}
                            title={articleTooltip(d)}
                            onClick={() => setActiveId(d.id)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-[var(--ink)]">
                                {isYou ? "Вы · " : ""}
                                {d.label}
                              </span>
                              <span className="tag">
                                {d.error
                                  ? "ошибка"
                                  : d.selected
                                    ? `в списке #${d.selectionOrder}`
                                    : d.exclusionReason === "bubble"
                                      ? "как копия"
                                      : d.exclusionReason === "capacity"
                                        ? "вне лимита k"
                                        : "вне"}
                              </span>
                            </div>
                            <p className="truncate text-xs text-[var(--muted)]">{d.title}</p>
                            {!d.error && (
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                польза {Math.round(d.utility * 100)}/100
                                {d.similarityToYou != null
                                  ? ` · похожесть на вас ${Math.round(d.similarityToYou * 100)}%`
                                  : ""}
                                {` · ${d.wordCount.toLocaleString("ru-RU")} слов`}
                              </p>
                            )}
                            {d.error && (
                              <p className="mt-1 text-xs text-red-600">{d.error}</p>
                            )}
                            {!d.error && d.headings.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {d.headings.slice(0, 4).map((h) => (
                                  <span key={h} className="chip">
                                    {h}
                                  </span>
                                ))}
                              </div>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-[12px] text-[var(--muted)]">{label}</p>
      <p
        className={`mt-1 font-display text-xl ${
          tone === "warn"
            ? "text-[#c2410c]"
            : tone === "ok"
              ? "text-[var(--signal)]"
              : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[12px] leading-snug text-[var(--muted)]">{hint}</p>}
    </div>
  );
}
