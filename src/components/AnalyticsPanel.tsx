"use client";

import { useMemo } from "react";
import { articleTooltip } from "@/lib/labels";
import type { AnalyzeResult } from "@/lib/types";

type Props = {
  result: AnalyzeResult;
};

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

function similarityWords(sim: number, dangerSim: number): string {
  if (sim >= dangerSim) return "Внутри порога зоны — риск копии";
  if (sim >= dangerSim * 0.85) return "Близко к порогу зоны";
  if (sim >= 0.35) return "Есть пересечения тем";
  return "Далеко по смыслу";
}

function topicWords(n: number | null): string {
  if (n == null) return "Не хватило текста для оценки";
  if (n >= 0.55) return "Много своих тем, которых нет у конкурентов";
  if (n >= 0.35) return "Часть тем своя, часть общая";
  if (n >= 0.2) return "Почти все частые темы уже есть у других";
  return "Ваши частые темы почти полностью совпадают с конкурентами";
}

function utilityWords(n: number): string {
  if (n >= 0.7) return "Сильный, плотный текст";
  if (n >= 0.45) return "Нормальный уровень";
  return "Слабовато — мало пользы или структуры";
}

function statusLabel(reason: AnalyzeResult["youStatus"]["exclusionReason"], selected: boolean) {
  if (selected) return "Взяли в список";
  if (reason === "bubble") return "Выбили как копию";
  if (reason === "capacity") return "Не влезли в лимит k";
  return "Вне отбора";
}

export function AnalyticsPanel({ result }: Props) {
  const alive = useMemo(() => result.docs.filter((d) => !d.error), [result.docs]);
  const you = alive.find((d) => d.role === "you" || d.role === "draft");
  const competitors = alive.filter((d) => d.role === "competitor");
  const dangerSim = 1 - result.radius;

  const similarityRows = useMemo(() => {
    return competitors
      .map((c) => ({
        id: c.id,
        label: c.label,
        title: c.title,
        url: c.url,
        sim: c.similarityToYou,
        selected: c.selected,
        reason: c.exclusionReason,
      }))
      .sort((a, b) => (b.sim ?? -1) - (a.sim ?? -1));
  }, [competitors]);

  const utilityBars = useMemo(() => {
    return [...alive].sort((a, b) => b.utility - a.utility);
  }, [alive]);

  const maxWords = Math.max(...alive.map((d) => d.wordCount), 1);
  const matrixDocs = alive.slice(0, 6);

  const simLookup = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of result.pairs) {
      map.set(`${p.a}|${p.b}`, p.similarity);
      map.set(`${p.b}|${p.a}`, p.similarity);
    }
    for (const d of matrixDocs) map.set(`${d.id}|${d.id}`, 1);
    return map;
  }, [result.pairs, matrixDocs]);

  const s = result.youStatus;

  const verdict = s.inBubble
    ? {
        badge: "Плохо",
        title: "Ваша статья попала в чужую зону GIST",
        text: s.blockedByLabel
          ? `Более полезный источник «${s.blockedByLabel}» уже закрыл этот смысл. Дистанция меньше порога ${result.radius.toFixed(2)}.`
          : `Дистанция до более сильного источника меньше порога ${result.radius.toFixed(2)}.`,
        next: "Что делать: другой угол, свои данные, кейс, сценарий — не тот же outline.",
        tone: "warn" as const,
      }
    : s.selected
      ? {
          badge: "Хорошо",
          title: "Вас взяли в GIST-выборку",
          text: `При пороге diversity ${result.radius.toFixed(2)} вы и полезны, и достаточно далеки от других отобранных.`,
          next: "Что делать: усиливайте то, чего нет у конкурентов.",
          tone: "ok" as const,
        }
      : s.exclusionReason === "capacity"
        ? {
            badge: "Так себе",
            title: "Не копия — просто не хватило мест",
            text: "Зона похожести вас не выбила. Лимит короткого списка (k) заполнили более полезные страницы.",
            next: "Что делать: повышайте полезность — факты, структура, точный ответ на запрос.",
            tone: "neutral" as const,
          }
        : {
            badge: "Нет данных по вам",
            title: "Не удалось оценить вашу страницу",
            text: "Проверьте, что ваш URL скачался без ошибки.",
            next: "Что делать: замените ссылку или вставьте текст черновиком.",
            tone: "neutral" as const,
          };

  return (
    <div className="space-y-4">
      <div className="explain-box">
        <p className="eyebrow">Как это считается (как в GIST)</p>
        <ol className="explain-steps">
          <li>
            <strong>Сначала полезность</strong> — кто информативнее для темы.
          </li>
          <li>
            <strong>Потом зона</strong> — вокруг взятого источника нельзя брать почти такой же
            (порог сейчас {result.radius.toFixed(2)}
            {result.radiusMode === "auto" ? ", подобран автоматически" : ""}).
          </li>
          <li>
            <strong>Повторяем</strong>, пока не наберём до {result.k} разных источников.
          </li>
        </ol>
      </div>

      <div className={`verdict verdict-${verdict.tone}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`status-badge status-${verdict.tone}`}>{verdict.badge}</span>
          <p className="eyebrow !normal-case !tracking-normal !text-inherit opacity-70">
            Главный вывод
          </p>
        </div>
        <h3 className="font-display mt-2 text-2xl md:text-3xl">{verdict.title}</h3>
        <p className="mt-2 max-w-3xl text-[15px] leading-relaxed opacity-95">{verdict.text}</p>
        <p className="next-step mt-3 max-w-3xl">{verdict.next}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Статус в отборе"
            value={statusLabel(s.exclusionReason, s.selected)}
            hint={s.blockedByLabel ? `Зона: ${s.blockedByLabel}` : "По правилам GIST"}
          />
          <Metric
            label="Похожесть на ближайшего"
            value={pct(s.similarityToNearestCompetitor)}
            hint={
              s.nearestCompetitorLabel
                ? s.nearestCompetitorLabel
                : "Нет данных по конкурентам"
            }
          />
          <Metric
            label="Дистанция до ближайшего"
            value={
              s.distanceToNearestCompetitor == null
                ? "—"
                : s.distanceToNearestCompetitor.toFixed(2)
            }
            hint={`Порог зоны: ${result.radius.toFixed(2)}`}
          />
          <Metric
            label="Свои темы"
            value={pct(s.ownTopicShare)}
            hint={topicWords(s.ownTopicShare)}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-5">
          <p className="eyebrow">Самое важное</p>
          <h4 className="font-display text-xl text-[var(--ink)]">Кто пишет почти как вы</h4>
          <p className="plain-hint">
            Порог «внутри зоны» для текущего радиуса ≈ похожесть ≥ {Math.round(dangerSim * 100)}%.
          </p>
          <div className="mt-4 space-y-4">
            {similarityRows.length === 0 && (
              <p className="text-sm text-[var(--muted)]">Нет данных по конкурентам.</p>
            )}
            {similarityRows.map((row) => (
              <div key={row.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-[var(--ink)]" title={articleTooltip(row)}>
                    {row.label}
                  </span>
                  <span className="tabular text-[var(--muted)]">{pct(row.sim)}</span>
                </div>
                <div className="bar-track">
                  <div
                    className={`bar-fill ${
                      row.sim != null && row.sim >= dangerSim
                        ? "bar-danger"
                        : row.sim != null && row.sim >= dangerSim * 0.85
                          ? "bar-warn"
                          : "bar-ok"
                    }`}
                    style={{
                      width: `${Math.max(4, (row.sim ?? 0) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[12px] text-[var(--muted)]">
                  {row.sim == null
                    ? "Нет похожести"
                    : similarityWords(row.sim, dangerSim)}
                  {row.selected ? " · в отборе" : ""}
                  {row.reason === "bubble" ? " · выбит зоной" : ""}
                  {row.reason === "capacity" ? " · вне лимита k" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <p className="eyebrow">Сравнение силы</p>
          <h4 className="font-display text-xl text-[var(--ink)]">Чей текст полезнее</h4>
          <p className="plain-hint">
            Utility в духе GIST: длина, плотность смысла, структура
            {result.query ? " и попадание в тему" : ""}.
          </p>
          <div className="mt-4 space-y-4">
            {utilityBars.map((d) => {
              const isYou = d.role === "you" || d.role === "draft";
              return (
                <div key={d.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-[var(--ink)]" title={articleTooltip(d)}>
                      {isYou ? `Вы (${d.label})` : d.label}
                    </span>
                    <span className="tabular text-[var(--muted)]">
                      {Math.round(d.utility * 100)}/100
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${isYou ? "bar-you" : "bar-ok"}`}
                      style={{ width: `${Math.max(6, d.utility * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[12px] text-[var(--muted)]">{utilityWords(d.utility)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="panel overflow-x-auto p-5">
          <p className="eyebrow">Матрица</p>
          <h4 className="font-display text-xl text-[var(--ink)]">Кто на кого похож</h4>
          <p className="plain-hint">
            Число — % похожести по embeddings. Наведите на заголовок — полное название статьи.
          </p>
          <table className="heat-table mt-4">
            <thead>
              <tr>
                <th />
                {matrixDocs.map((d) => (
                  <th key={d.id} title={articleTooltip(d)}>
                    {shortLabel(d.label, d.role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixDocs.map((row) => (
                <tr key={row.id}>
                  <th title={articleTooltip(row)}>{shortLabel(row.label, row.role)}</th>
                  {matrixDocs.map((col) => {
                    const sim = simLookup.get(`${row.id}|${col.id}`);
                    return (
                      <td
                        key={col.id}
                        style={{ background: heatColor(sim ?? 0) }}
                        title={sim == null ? "—" : pct(sim)}
                      >
                        {sim == null ? "—" : Math.round(sim * 100)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel p-5">
          <p className="eyebrow">Объём</p>
          <h4 className="font-display text-xl text-[var(--ink)]">Длина текстов</h4>
          <p className="plain-hint">Справочно. Длина ≠ победа, но влияет на utility.</p>
          <div className="mt-4 space-y-3">
            {alive
              .slice()
              .sort((a, b) => b.wordCount - a.wordCount)
              .map((d) => {
                const isYou = d.role === "you" || d.role === "draft";
                return (
                  <div key={d.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-[var(--ink)]" title={articleTooltip(d)}>
                        {isYou ? `Вы (${d.label})` : d.label}
                      </span>
                      <span className="tabular text-[var(--muted)]">
                        {d.wordCount.toLocaleString("ru-RU")} слов
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className={`bar-fill ${isYou ? "bar-you" : "bar-neutral"}`}
                        style={{ width: `${Math.max(4, (d.wordCount / maxWords) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <div className="panel overflow-x-auto p-5">
        <p className="eyebrow">Сводка</p>
        <h4 className="font-display text-xl text-[var(--ink)]">Все страницы</h4>
        <table className="data-table mt-4">
          <thead>
            <tr>
              <th>Страница</th>
              <th>GIST-статус</th>
              <th>Польза</th>
              <th>Похожесть на вас</th>
              <th>Слов</th>
            </tr>
          </thead>
          <tbody>
            {result.docs.map((d) => {
              const isYou = d.role === "you" || d.role === "draft";
              return (
                <tr key={d.id} className={isYou ? "row-you" : undefined}>
                  <td title={articleTooltip(d)}>
                    <div className="font-medium text-[var(--ink)]">
                      {isYou ? "Вы · " : ""}
                      {d.label}
                    </div>
                    <div className="max-w-[260px] truncate text-xs text-[var(--muted)]">
                      {d.title}
                    </div>
                  </td>
                  <td>
                    {d.error
                      ? "Ошибка загрузки"
                      : d.selected
                        ? `В отборе #${d.selectionOrder}`
                        : d.exclusionReason === "bubble"
                          ? "Зона копии"
                          : d.exclusionReason === "capacity"
                            ? "Вне лимита k"
                            : "Вне отбора"}
                  </td>
                  <td className="tabular">
                    {d.error ? "—" : `${Math.round(d.utility * 100)}/100`}
                  </td>
                  <td className="tabular">
                    {d.error || isYou ? "—" : pct(d.similarityToYou)}
                  </td>
                  <td className="tabular">
                    {d.error ? "—" : d.wordCount.toLocaleString("ru-RU")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {you && (
          <p className="plain-hint mt-3">
            Ваша полезность:{" "}
            {s.utility == null ? "—" : `${Math.round(s.utility * 100)}/100`}. Режим радиуса:{" "}
            {result.radiusMode === "auto"
              ? `авто (${result.radius.toFixed(2)}, рекомендация ${result.suggestedRadius.toFixed(2)})`
              : `ручной ${result.radius.toFixed(2)} (рекомендация ${result.suggestedRadius.toFixed(2)})`}
            .
          </p>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-black/5 px-3 py-2">
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
      <div className="font-display mt-1 text-xl leading-tight">{value}</div>
      <div className="mt-1 text-[12px] leading-snug opacity-80">{hint}</div>
    </div>
  );
}

function shortLabel(label: string, role: string): string {
  if (role === "you" || role === "draft") return "Вы";
  const parts = label.split(/:\s+/);
  if (parts.length > 1) {
    const titlePart = parts.slice(1).join(": ").trim();
    return titlePart.length > 14 ? `${titlePart.slice(0, 12)}…` : titlePart;
  }
  return label.length > 12 ? `${label.slice(0, 10)}…` : label;
}

function heatColor(sim: number): string {
  const t = Math.max(0, Math.min(1, sim));
  const r = Math.round(255 - t * 140);
  const g = Math.round(248 - t * 90);
  const b = Math.round(240 - t * 40);
  return `rgba(${r}, ${g}, ${b}, 0.95)`;
}
