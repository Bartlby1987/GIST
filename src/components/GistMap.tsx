"use client";

import { useMemo, useState } from "react";
import { articleTooltip } from "@/lib/labels";
import type { AnalyzedDoc } from "@/lib/types";

type Props = {
  docs: AnalyzedDoc[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
};

export function GistMap({ docs, activeId, onSelect }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const plotDocs = useMemo(() => docs.filter((d) => !d.error), [docs]);

  const width = 920;
  const height = 560;

  return (
    <div className="map-shell relative overflow-hidden rounded-[1.5rem]">
      <div className="absolute left-4 top-4 z-10 max-w-sm rounded-xl bg-black/35 px-3 py-2 text-xs leading-relaxed text-teal-50 backdrop-blur-sm">
        Красная точка — вы. Круг рисуется по реальной зоне GIST: он покрывает статьи, которые этот
        источник выбил как слишком похожие.
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Карта смысловой близости страниц"
      >
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#1a5c57" stopOpacity="0.35" />
            <stop offset="55%" stopColor="#0c2a2f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#07161a" stopOpacity="0.95" />
          </radialGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(148, 210, 189, 0.08)"
              strokeWidth="1"
            />
          </pattern>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={width} height={height} fill="url(#mapGlow)" />
        <rect width={width} height={height} fill="url(#grid)" />

        {[0.18, 0.32, 0.46, 0.6].map((r) => (
          <circle
            key={r}
            cx={width / 2}
            cy={height / 2}
            r={Math.min(width, height) * r}
            fill="none"
            stroke="rgba(110, 231, 183, 0.12)"
            strokeDasharray="4 10"
          />
        ))}

        {plotDocs
          .filter((d) => d.selected)
          .map((d) => {
            const cx = d.x * width;
            const cy = d.y * height;
            const isYou = d.role === "you" || d.role === "draft";
            const bubblePx = Math.max(36, (d.bubbleRadius2D ?? 0.08) * Math.min(width, height));
            return (
              <g key={`bubble-${d.id}`} className="bubble-pulse">
                <circle
                  cx={cx}
                  cy={cy}
                  r={bubblePx}
                  fill={isYou ? "rgba(255, 107, 74, 0.08)" : "rgba(56, 189, 248, 0.08)"}
                  stroke={isYou ? "rgba(255, 107, 74, 0.45)" : "rgba(125, 211, 252, 0.35)"}
                  strokeWidth="1.5"
                  strokeDasharray="6 8"
                />
                <text
                  x={cx}
                  y={cy - bubblePx - 8}
                  textAnchor="middle"
                  className="fill-[rgba(186,230,253,0.75)] text-[10px]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  зона копии
                </text>
              </g>
            );
          })}

        {plotDocs.map((d) => {
          const cx = d.x * width;
          const cy = d.y * height;
          const isYou = d.role === "you" || d.role === "draft";
          const active = activeId === d.id || hoverId === d.id;
          const size = 10 + d.utility * 18;
          const fill = isYou ? "#FF6B4A" : d.selected ? "#5EEAD4" : "#7DD3FC";
          const opacity = d.selected || isYou ? 1 : 0.55;

          return (
            <g
              key={d.id}
              transform={`translate(${cx}, ${cy})`}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoverId(d.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect(activeId === d.id ? null : d.id)}
              filter={active ? "url(#softGlow)" : undefined}
            >
              <title>{articleTooltip(d)}</title>
              {isYou && (
                <circle
                  r={size + 10}
                  fill="none"
                  stroke="#FF6B4A"
                  strokeOpacity="0.5"
                  strokeWidth="2"
                  className="you-ring"
                />
              )}
              <circle
                r={size}
                fill={fill}
                fillOpacity={opacity}
                stroke={active ? "#F8FAFC" : "rgba(15, 23, 42, 0.35)"}
                strokeWidth={active ? 2.5 : 1}
              />
              {d.selectionOrder != null && (
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  className="fill-[#042f2e] text-[11px] font-bold"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {d.selectionOrder}
                </text>
              )}
              <text
                y={size + 16}
                textAnchor="middle"
                className="fill-[#E2E8F0] text-[11px]"
                style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
              >
                {d.label.length > 22 ? `${d.label.slice(0, 20)}…` : d.label}
              </text>
              {d.exclusionReason === "bubble" && (
                <text
                  y={size + 30}
                  textAnchor="middle"
                  className="fill-[#FCA5A5] text-[9px]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  как копия
                </text>
              )}
              {d.exclusionReason === "capacity" && (
                <text
                  y={size + 30}
                  textAnchor="middle"
                  className="fill-[#FDE68A] text-[9px]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  вне лимита k
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap gap-3 text-[11px] text-teal-100/80">
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-[#FF6B4A]" /> Вы
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-[#5EEAD4]" /> Взяли в список
        </span>
        <span className="inline-flex items-center gap-2">
          <i className="inline-block h-2.5 w-2.5 rounded-full bg-[#7DD3FC] opacity-60" /> Не взяли
        </span>
      </div>
    </div>
  );
}
