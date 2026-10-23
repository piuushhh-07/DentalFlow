import { notFound } from "next/navigation";

import { DemoWorkspace } from "@/features/demo/components/demo-workspace";
import { isLocalDemoEnabled } from "@/features/demo/lib/demo-mode";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Local Demo",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  if (
    !isLocalDemoEnabled(
      process.env.NODE_ENV,
      process.env.NEXT_PUBLIC_DENTALFLOW_DEMO_MODE,
    )
  ) {
    notFound();
  }

  return <DemoWorkspace />;
}
