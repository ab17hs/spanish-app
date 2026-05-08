"use client";

/**
 * 30-day reviews-per-day chart with accuracy color.
 *
 * Pure SVG (no recharts/d3 import) — keeps the bundle lean. Hovered bar shows
 * a tooltip with the day's stats. Bars scaled to the busiest day.
 */

import { useState } from "react";

interface Day {
  date: string;
  reviews: number;
  correct: number;
  minutes: number;
}

const WIDTH = 760;
const HEIGHT = 180;
const PAD_X = 12;
const PAD_Y = 16;

export function ActivityChart({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<Day | null>(null);

  const max = Math.max(1, ...data.map((d) => d.reviews));
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_Y * 2;
  const barW = innerW / data.length;

  const colorFor = (d: Day) => {
    if (d.reviews === 0) return "var(--muted)";
    const acc = d.correct / d.reviews;
    if (acc >= 0.85) return "var(--success)";
    if (acc >= 0.6) return "var(--primary)";
    return "var(--warning)";
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label="30-day review activity"
      >
        {/* Y-axis gridlines (3 levels) */}
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_Y + innerH * (1 - p)}
            y2={PAD_Y + innerH * (1 - p)}
            stroke="hsl(var(--border))"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        ))}

        {data.map((d, i) => {
          const x = PAD_X + i * barW;
          const h = (d.reviews / max) * innerH;
          const y = PAD_Y + innerH - h;
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(d)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default"
            >
              <rect
                x={x + 2}
                y={y}
                width={Math.max(0, barW - 4)}
                height={Math.max(2, h)}
                fill={colorFor(d)}
                rx={3}
                opacity={hover && hover.date !== d.date ? 0.4 : 1}
                className="transition-opacity"
              />
              {/* Invisible hit area so very short bars are still hoverable */}
              <rect
                x={x}
                y={PAD_Y}
                width={barW}
                height={innerH}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <LegendDot color="bg-success" label="≥85% accuracy" />
        <LegendDot color="bg-primary" label="60–85%" />
        <LegendDot color="bg-warning" label="<60%" />
        <span className="ml-auto text-muted-foreground">
          {hover
            ? `${formatDate(hover.date)} · ${hover.reviews} reviews · ${
                hover.reviews === 0 ? "—" : Math.round((hover.correct / hover.reviews) * 100) + "% correct"
              } · ${hover.minutes}m`
            : "Hover a bar for detail"}
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function formatDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
