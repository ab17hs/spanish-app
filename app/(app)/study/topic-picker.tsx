"use client";

import { useRouter } from "next/navigation";
import type { CardKind } from "@/types/database";

export function TopicPicker({
  activeKind,
  activeTopic,
  topics,
}: {
  activeKind: CardKind | "all";
  activeTopic: string | undefined;
  topics: { name: string; slug: string }[];
}) {
  const router = useRouter();
  return (
    <select
      value={activeTopic ?? ""}
      onChange={(e) => {
        const params = new URLSearchParams();
        if (activeKind !== "all") params.set("kind", activeKind);
        if (e.target.value) params.set("topic", e.target.value);
        router.push(`/study${params.toString() ? `?${params}` : ""}`);
      }}
      className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">All topics</option>
      {topics.map((t) => (
        <option key={t.slug} value={t.slug}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
