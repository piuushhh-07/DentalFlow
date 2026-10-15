"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type PatientSubmitButtonProps = Readonly<{ editing: boolean }>;

export function PatientSubmitButton({ editing }: PatientSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending
        ? editing
          ? "Saving changes..."
          : "Creating patient..."
        : editing
          ? "Save changes"
          : "Create patient"}
    </Button>
  );
}
