import Link from "next/link";
import {
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  UsersRound,
} from "lucide-react";

const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, active: true },
      { label: "Patients", icon: UsersRound, href: "patients" },
      { label: "Follow-ups", icon: ClipboardList },
      { label: "Recalls", icon: CalendarClock },
      { label: "Templates", icon: MessageCircle, href: "messages/templates" },
      { label: "Reports", icon: ClipboardList, href: "reports" },
    ],
  },
];

type AppNavigationProps = Readonly<{
  compact?: boolean;
  clinicId: string;
  activeSection?:
    "dashboard" | "patients" | "recalls" | "templates" | "reports";
}>;

export function AppNavigation({
  compact = false,
  clinicId,
  activeSection = "dashboard",
}: AppNavigationProps) {
  const groups = compact ? [navigationGroups[0]] : navigationGroups;

  return (
    <nav
      aria-label={compact ? "Mobile navigation" : "Main navigation"}
      className={compact ? "" : "space-y-7"}
    >
      {groups.map((group) => (
        <section key={group.label}>
          {!compact && (
            <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {group.label}
            </h2>
          )}
          <ul
            className={
              compact
                ? "flex min-w-max items-center justify-around gap-1"
                : "space-y-1"
            }
          >
            {group.items.map(({ label, icon: Icon, href }) => {
              const isActive =
                (label === "Dashboard" && activeSection === "dashboard") ||
                (label === "Patients" && activeSection === "patients") ||
                (label === "Recalls" && activeSection === "recalls") ||
                (label === "Templates" && activeSection === "templates") ||
                (label === "Reports" && activeSection === "reports");

              return (
                <li key={label}>
                  {isActive ? (
                    <Link
                      aria-current="page"
                      className={
                        compact
                          ? "flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-teal-800"
                          : "flex min-h-10 items-center gap-3 rounded-lg bg-teal-50 px-3 text-sm font-semibold text-teal-800"
                      }
                      href={`/clinic/${clinicId}${
                        label === "Recalls"
                          ? "/recalls"
                          : label === "Templates"
                            ? "/messages/templates"
                            : label === "Reports"
                              ? "/reports"
                              : ""
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={compact ? "size-5" : "size-[18px]"}
                      />
                      {label}
                    </Link>
                  ) : href ? (
                    <Link
                      className={
                        compact
                          ? "flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-teal-800"
                          : "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-teal-800"
                      }
                      href={`/clinic/${clinicId}/${href}`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={compact ? "size-5" : "size-[18px]"}
                      />
                      {label}
                    </Link>
                  ) : label === "Recalls" ? (
                    <Link
                      className={
                        compact
                          ? "flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-teal-800"
                          : "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-teal-800"
                      }
                      href={`/clinic/${clinicId}/recalls`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={compact ? "size-5" : "size-[18px]"}
                      />
                      {label}
                    </Link>
                  ) : label === "Follow-ups" ? (
                    <span
                      aria-disabled="true"
                      className={
                        compact
                          ? "flex min-w-[72px] cursor-not-allowed flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-400"
                          : "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-500"
                      }
                      title="Available in a future milestone"
                    >
                      <Icon
                        aria-hidden="true"
                        className={compact ? "size-5" : "size-[18px]"}
                      />
                      <span>{label}</span>
                      {!compact && (
                        <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                          Soon
                        </span>
                      )}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
