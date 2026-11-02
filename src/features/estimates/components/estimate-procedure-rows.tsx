"use client";

import { useState } from "react";

export type EstimateProcedureRow = {
  catalogueItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

const blankRow = (): EstimateProcedureRow => ({
  catalogueItemId: "",
  description: "",
  quantity: "1",
  unitPrice: "",
});

export type EstimateCatalogueItem = Readonly<{
  id: string;
  name: string;
  description: string | null;
  defaultPrice: string | null;
}>;

export function EstimateProcedureRows({
  catalogue,
  initialRows,
  onChange,
}: Readonly<{
  catalogue: EstimateCatalogueItem[];
  initialRows?: EstimateProcedureRow[];
  onChange?: (rows: EstimateProcedureRow[]) => void;
}>) {
  const [rows, setRows] = useState<EstimateProcedureRow[]>(() =>
    initialRows?.length ? initialRows : [blankRow()],
  );

  function updateRows(
    update:
      | EstimateProcedureRow[]
      | ((current: EstimateProcedureRow[]) => EstimateProcedureRow[]),
  ) {
    const next = typeof update === "function" ? update(rows) : update;
    setRows(next);
    onChange?.(next);
  }

  function updateRow(index: number, patch: Partial<EstimateProcedureRow>) {
    updateRows((current) =>
      current.map((row, rowIndex) =>
        index === rowIndex ? { ...row, ...patch } : row,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row, index) => (
        <fieldset
          className="rounded-lg border border-slate-200 p-4"
          key={index}
        >
          <legend className="text-sm font-semibold text-slate-900">
            Procedure {index + 1}
          </legend>
          <div className="mb-3 flex items-center justify-between gap-3">
            {rows.length > 1 ? (
              <button
                className="text-sm font-medium text-rose-700 hover:underline"
                onClick={() =>
                  updateRows((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                type="button"
              >
                Remove
              </button>
            ) : null}
          </div>
          {catalogue.length > 0 && (
            <label className="mb-3 block space-y-1 text-sm text-slate-700">
              <span>Optional: select an existing clinic procedure</span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"
                onChange={(event) => {
                  const item = catalogue.find(
                    (entry) => entry.id === event.currentTarget.value,
                  );
                  updateRow(index, {
                    catalogueItemId: item?.id ?? "",
                    description: item?.name ?? "",
                    unitPrice: item?.defaultPrice ?? "",
                  });
                }}
                value={row.catalogueItemId}
              >
                <option value="">Enter an additional item manually</option>
                {catalogue.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            name="catalogueItemId"
            type="hidden"
            value={row.catalogueItemId}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-3">
              <span>Procedure description</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={300}
                name="description"
                onChange={(event) =>
                  updateRow(index, { description: event.currentTarget.value })
                }
                required
                value={row.description}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Quantity</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                max="10000"
                min="1"
                name="quantity"
                onChange={(event) =>
                  updateRow(index, { quantity: event.currentTarget.value })
                }
                required
                type="number"
                value={row.quantity}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Unit price (INR)</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                inputMode="decimal"
                maxLength={13}
                name="unitPrice"
                onChange={(event) =>
                  updateRow(index, { unitPrice: event.currentTarget.value })
                }
                required
                value={row.unitPrice}
              />
            </label>
          </div>
        </fieldset>
      ))}
      <button
        className="inline-flex min-h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50"
        onClick={() => updateRows((current) => [...current, blankRow()])}
        type="button"
      >
        Add procedure
      </button>
    </div>
  );
}
