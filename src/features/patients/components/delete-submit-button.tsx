"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function DeleteSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} variant="destructive" type="submit">
      {pending ? "Deleting patient..." : "Delete patient"}
    </Button>
  );
}
