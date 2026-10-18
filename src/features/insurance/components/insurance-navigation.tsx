import Link from "next/link";

const links = [
  ["Overview", ""],
  ["Claims", "/claims"],
  ["Policies", "/policies"],
  ["Providers", "/providers"],
  ["Pre-authorizations", "/pre-authorizations"],
] as const;

export function InsuranceNavigation({
  clinicId,
  current,
}: Readonly<{ clinicId: string; current: (typeof links)[number][0] }>) {
  const basePath = `/clinic/${clinicId}/insurance`;
  return (
    <nav
      aria-label="Insurance sections"
      className="-mx-1 mb-6 flex gap-1 overflow-x-auto pb-1"
    >
      {links.map(([label, path]) => (
        <Link
          aria-current={current === label ? "page" : undefined}
          className={`whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium ${
            current === label
              ? "bg-teal-100 text-teal-900"
              : "text-slate-600 hover:bg-slate-100"
          }`}
          href={`${basePath}${path}`}
          key={label}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
