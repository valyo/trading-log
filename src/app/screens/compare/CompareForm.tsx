"use client";

import { useRef } from "react";
import type { ScreeningSnapshot } from "@/lib/db/schema";

export function CompareForm({
  snapshots,
  selectedA,
  selectedB,
}: {
  snapshots: ScreeningSnapshot[];
  selectedA?: string;
  selectedB?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      method="GET"
      action="/screens/compare"
      className="flex flex-wrap gap-4 items-end"
    >
      <div>
        <label htmlFor="compare-a" className="block text-sm font-medium mb-1">
          Date A
        </label>
        <select
          id="compare-a"
          name="a"
          defaultValue={selectedA ?? ""}
          onChange={() => formRef.current?.submit()}
          className="rounded border border-[var(--border)] bg-transparent px-3 py-2"
        >
          <option value="">Select</option>
          {snapshots.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.snapshotDate} {s.name ? `(${s.name})` : ""}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="compare-b" className="block text-sm font-medium mb-1">
          Date B
        </label>
        <select
          id="compare-b"
          name="b"
          defaultValue={selectedB ?? ""}
          onChange={() => formRef.current?.submit()}
          className="rounded border border-[var(--border)] bg-transparent px-3 py-2"
        >
          <option value="">Select</option>
          {snapshots.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.snapshotDate} {s.name ? `(${s.name})` : ""}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
