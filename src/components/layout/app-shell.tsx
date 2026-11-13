import { HeartHandshake } from "lucide-react";
import Link from "next/link";

import { AppNavigation } from "@/components/layout/app-navigation";
import { signOut } from "@/features/auth/actions";

type AppShellProps = Readonly<{
  children: React.ReactNode;
  clinicId: string;
  activeSection?:
    | "dashboard"
    | "appointments"
    | "patients"
    | "treatments"
    | "billing"
    | "recalls"
    | "templates"
    | "reports"
    | "insurance"
    | "inventory"
    | "expenses"
    | "team";
}>;

export function AppShell({
  children,
  clinicId,
  activeSection = "dashboard",
}: AppShellProps) {
  return (
    <div className="min-h-svh bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col overflow-hidden border-r border-slate-200 bg-white px-4 py-5 lg:flex print:hidden">
        <Link
          aria-label="DentalFlow dashboard"
          className="mb-10 flex shrink-0 items-center gap-3 px-2"
          href={`/clinic/${clinicId}`}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-teal-700 text-white shadow-sm">
            <HeartHandshake aria-hidden="true" className="size-5" />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-slate-900">
            DentalFlow
          </span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <AppNavigation clinicId={clinicId} activeSection={activeSection} />
        </div>
        <div className="mt-4 shrink-0 rounded-xl border border-teal-100 bg-teal-50/70 p-4">
          <p className="text-xs font-semibold text-teal-900">
            A little more continuity
          </p>
          <p className="mt-1 text-xs leading-5 text-teal-800/80">
            Keep the care between visits in view.
          </p>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-10 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8 print:hidden">
          <Link
            aria-label="DentalFlow dashboard"
            className="flex items-center gap-2.5 lg:hidden"
            href={`/clinic/${clinicId}`}
          >
            <span className="grid size-9 place-items-center rounded-xl bg-teal-700 text-white">
              <HeartHandshake aria-hidden="true" className="size-[18px]" />
            </span>
            <span className="font-bold tracking-tight">DentalFlow</span>
          </Link>
          <div className="hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <span className="size-2 rounded-full bg-amber-400" />
            Clinic workspace
          </div>
          <span className="ml-auto text-xs font-medium text-slate-500 sm:text-sm">
            Care, continued.
          </span>
          <form action={signOut} className="ml-4">
            <button
              className="rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </header>

        <main className="mx-auto min-h-[calc(100svh-68px)] max-w-[1440px] px-5 pb-28 pt-8 sm:px-8 sm:pt-10 lg:px-10 lg:pb-12">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 overflow-x-auto border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur lg:hidden print:hidden">
        <AppNavigation
          clinicId={clinicId}
          activeSection={activeSection}
          compact
        />
      </div>
    </div>
  );
}
