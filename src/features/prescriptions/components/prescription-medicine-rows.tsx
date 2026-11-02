"use client";

import { useState } from "react";

type CatalogueItem = Readonly<{
  id: string;
  name: string;
  strength: string | null;
  form: string | null;
}>;

export type PrescriptionMedicineRow = {
  catalogueItemId: string;
  medicineName: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
  instructions: string;
};

const blankMedicine = (): PrescriptionMedicineRow => ({
  catalogueItemId: "",
  medicineName: "",
  dosage: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: "",
  instructions: "",
});

function catalogueLabel(item: CatalogueItem) {
  return [item.name, item.strength, item.form].filter(Boolean).join(" · ");
}

export function PrescriptionMedicineRows({
  catalogue,
  initialMedicines,
  onChange,
}: Readonly<{
  catalogue: CatalogueItem[];
  initialMedicines?: PrescriptionMedicineRow[];
  onChange?: (medicines: PrescriptionMedicineRow[]) => void;
}>) {
  const [medicines, setMedicines] = useState<PrescriptionMedicineRow[]>(() =>
    initialMedicines?.length ? initialMedicines : [blankMedicine()],
  );

  function setAndReport(
    update:
      | PrescriptionMedicineRow[]
      | ((current: PrescriptionMedicineRow[]) => PrescriptionMedicineRow[]),
  ) {
    const next = typeof update === "function" ? update(medicines) : update;
    setMedicines(next);
    onChange?.(next);
  }

  function updateMedicine(
    index: number,
    patch: Partial<PrescriptionMedicineRow>,
  ) {
    setAndReport((current) =>
      current.map((medicine, rowIndex) =>
        rowIndex === index ? { ...medicine, ...patch } : medicine,
      ),
    );
  }

  return (
    <div className="space-y-4">
      {medicines.map((medicine, index) => (
        <fieldset
          className="rounded-lg border border-slate-200 p-4"
          key={index}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">
              Medicine {index + 1}
            </p>
            {medicines.length > 1 ? (
              <button
                className="text-sm font-medium text-rose-700 hover:underline"
                onClick={() =>
                  setAndReport((current) =>
                    current.filter((_, rowIndex) => rowIndex !== index),
                  )
                }
                type="button"
              >
                Remove
              </button>
            ) : null}
          </div>
          {catalogue.length ? (
            <label className="mb-3 block space-y-1 text-sm text-slate-700">
              <span>Optional: select from clinic medicine catalogue</span>
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3"
                onChange={(event) => {
                  const item = catalogue.find(
                    (entry) => entry.id === event.currentTarget.value,
                  );
                  updateMedicine(index, {
                    catalogueItemId: item?.id ?? "",
                    medicineName: item
                      ? [item.name, item.strength].filter(Boolean).join(" ")
                      : "",
                  });
                }}
                value={medicine.catalogueItemId}
              >
                <option value="">Enter medicine manually</option>
                {catalogue.map((item) => (
                  <option key={item.id} value={item.id}>
                    {catalogueLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <input
            name="medicineCatalogueItemId"
            type="hidden"
            value={medicine.catalogueItemId}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Medicine name</span>
              <input
                autoComplete="off"
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={200}
                name="medicineName"
                onChange={(event) =>
                  updateMedicine(index, {
                    medicineName: event.currentTarget.value,
                    catalogueItemId: "",
                  })
                }
                required
                value={medicine.medicineName}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Dosage</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={160}
                name="medicineDosage"
                onChange={(event) =>
                  updateMedicine(index, { dosage: event.currentTarget.value })
                }
                required
                value={medicine.dosage}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Route of administration</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={100}
                name="medicineRoute"
                onChange={(event) =>
                  updateMedicine(index, { route: event.currentTarget.value })
                }
                required
                value={medicine.route}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Frequency</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={160}
                name="medicineFrequency"
                onChange={(event) =>
                  updateMedicine(index, {
                    frequency: event.currentTarget.value,
                  })
                }
                required
                value={medicine.frequency}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Duration</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={120}
                name="medicineDuration"
                onChange={(event) =>
                  updateMedicine(index, { duration: event.currentTarget.value })
                }
                required
                value={medicine.duration}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700">
              <span>Quantity</span>
              <input
                className="h-10 w-full rounded-md border border-slate-300 px-3"
                maxLength={100}
                name="medicineQuantity"
                onChange={(event) =>
                  updateMedicine(index, { quantity: event.currentTarget.value })
                }
                required
                value={medicine.quantity}
              />
            </label>
            <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
              <span>Instructions (optional)</span>
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-2"
                maxLength={1000}
                name="medicineInstructions"
                onChange={(event) =>
                  updateMedicine(index, {
                    instructions: event.currentTarget.value,
                  })
                }
                rows={2}
                value={medicine.instructions}
              />
            </label>
          </div>
        </fieldset>
      ))}
      {medicines.length < 20 ? (
        <button
          className="inline-flex min-h-9 items-center rounded-md border border-teal-700 px-3 text-sm font-medium text-teal-800 hover:bg-teal-50"
          onClick={() =>
            setAndReport((current) => [...current, blankMedicine()])
          }
          type="button"
        >
          Add another medicine
        </button>
      ) : null}
    </div>
  );
}
