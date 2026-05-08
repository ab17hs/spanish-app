"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function VocabPagination({ page, pageCount, total }: { page: number; pageCount: number; total: number }) {
  const router = useRouter();
  const params = useSearchParams();

  function go(p: number) {
    const sp = new URLSearchParams(params.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    router.push(`/admin/vocab?${sp.toString()}`);
  }

  if (pageCount <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing page {page} of {pageCount} ({total.toLocaleString()} entries)
      </p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => go(page + 1)}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
