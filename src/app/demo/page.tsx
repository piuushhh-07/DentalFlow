import { notFound } from "next/navigation";

import { DemoWorkspace } from "@/features/demo/components/demo-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Local Demo",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.NEXT_PUBLIC_DENTALFLOW_DEMO_MODE !== "true"
  ) {
    notFound();
  }

  return <DemoWorkspace />;
}
