"use client";

type Props = {
  instruments: { vardepapper: string }[];
  currentStock: string;
};

export function StockFilter({ instruments, currentStock }: Props) {
  return (
    <form method="get" action="/trades" className="flex items-center gap-2">
      <label htmlFor="stock-filter" className="text-sm text-[var(--muted)] whitespace-nowrap">
        Värdepapper:
      </label>
      <select
        id="stock-filter"
        name="stock"
        defaultValue={currentStock}
        className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm min-w-[180px]"
        onChange={(e) => e.currentTarget.form?.submit()}
      >
        <option value="">Alla</option>
        {instruments.map(({ vardepapper }) => (
          <option key={vardepapper} value={vardepapper}>
            {vardepapper}
          </option>
        ))}
      </select>
    </form>
  );
}
