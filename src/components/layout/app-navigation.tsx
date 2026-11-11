import Link from "next/link";
import {
  CalendarClock,
  CreditCard,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  UserRoundPlus,
} from "lucide-react";

const navigationGroups = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, href: "" },
      { label: "Appointments", icon: CalendarClock, href: "appointments" },
      { label: "Patients", icon: UsersRound, href: "patients" },
      { label: "Treatments", icon: Stethoscope, href: "treatments/catalogue" },
      { label: "Billing", icon: CreditCard, href: "billing" },
      { label: "Follow-ups", icon: ClipboardList, href: "#follow-up-queue" },
      { label: "Recalls", icon: CalendarClock },
      { label: "Templates", icon: MessageCircle, href: "messages/templates" },
      { label: "Reports", icon: ClipboardList, href: "reports" },
      { label: "Insurance", icon: ShieldCheck, href: "insurance" },
      { label: "Team", icon: UserRoundPlus, href: "settings/staff" },
    ],
  },
];

type AppNavigationProps = Readonly<{
  compact?: boolean;
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
    | "team";
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
                (label === "Appointments" &&
                  activeSection === "appointments") ||
                (label === "Patients" && activeSection === "patients") ||
                (label === "Treatments" && activeSection === "treatments") ||
                (label === "Billing" && activeSection === "billing") ||
                (label === "Recalls" && activeSection === "recalls") ||
                (label === "Templates" && activeSection === "templates") ||
                (label === "Reports" && activeSection === "reports") ||
                (label === "Insurance" && activeSection === "insurance") ||
                (label === "Team" && activeSection === "team");

              const destination =
                label === "Recalls"
                  ? "/recalls"
                  : label === "Templates"
                    ? "/messages/templates"
                    : label === "Insurance"
                      ? "/insurance"
                      : label === "Reports"
                        ? "/reports"
                        : label === "Appointments"
                          ? "/appointments"
                          : label === "Treatments"
                            ? "/treatments/catalogue"
                              : label === "Billing"
                            ? "/billing"
                            : label === "Team"
                                ? "/settings/staff"
                              : "";

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
                      href={`/clinic/${clinicId}${destination}`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={compact ? "size-5" : "size-[18px]"}
                      />
                      {label}
                    </Link>
                  ) : href !== undefined ? (
                    <Link
                      className={
                        compact
                          ? "flex min-w-[72px] flex-col items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-50 hover:text-teal-800"
                          : "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-teal-800"
                      }
                      href={
                        href.startsWith("#")
                          ? `/clinic/${clinicId}${href}`
                          : href
                            ? `/clinic/${clinicId}/${href}`
                            : `/clinic/${clinicId}`
                      }
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
