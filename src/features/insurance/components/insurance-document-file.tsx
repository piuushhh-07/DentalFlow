"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { registerInsuranceDocumentUploadAction } from "@/features/insurance/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const BUCKET = "dentalflow-insurance-private";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

type InsuranceDocumentFileProps = Readonly<{
  clinicId: string;
  claimId: string;
  documentId: string;
  name: string;
  storagePath: string | null;
  canUpload: boolean;
}>;

export function InsuranceDocumentFile({
  clinicId,
  claimId,
  documentId,
  name,
  storagePath,
  canUpload,
}: InsuranceDocumentFileProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      setError("Choose a non-empty PDF, JPEG or PNG up to 10 MB.");
      return;
    }
    const extension = allowedTypes.get(file.type);
    if (!extension) {
      setError("Only PDF, JPEG and PNG documents are allowed.");
      return;
    }
    setBusy(true);
    const path = `${clinicId}/${claimId}/${documentId}/${crypto.randomUUID()}.${extension}`;
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError("Upload failed. Check your access and try again.");
        return;
      }
      const registration = await registerInsuranceDocumentUploadAction(
        clinicId,
        claimId,
        documentId,
        path,
      );
      if (!registration.success) {
        let cleanupFailed = false;
        try {
          const { error: cleanupError } = await supabase.storage
            .from(BUCKET)
            .remove([path]);
          cleanupFailed = Boolean(cleanupError);
        } catch {
          cleanupFailed = true;
        }
        setError(
          cleanupFailed
            ? "The document was uploaded but could not be registered or removed. Contact your administrator."
            : registration.error,
        );
        return;
      }
      if (storagePath && storagePath !== path) {
        try {
          const { error: cleanupError } = await supabase.storage
            .from(BUCKET)
            .remove([storagePath]);
          if (cleanupError) {
            setError(
              "The new document is saved, but the replaced private file could not be removed. Contact your administrator.",
            );
          }
        } catch {
          setError(
            "The new document is saved, but the replaced private file could not be removed. Contact your administrator.",
          );
        }
      }
      router.refresh();
    } catch {
      setError(
        "The upload could not be completed. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!storagePath) return;
    setError(null);
    setBusy(true);
    try {
      const { data, error: downloadError } = await createSupabaseBrowserClient()
        .storage.from(BUCKET)
        .download(storagePath);
      if (downloadError || !data) {
        setError("This private document is unavailable or access was denied.");
        return;
      }
      const objectUrl = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setError(
        "The document could not be downloaded. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {storagePath ? (
        <button
          className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={download}
          type="button"
        >
          Download private file
        </button>
      ) : null}
      {canUpload ? (
        <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-slate-50">
          {busy ? "Uploading…" : storagePath ? "Replace file" : "Upload file"}
          <input
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void upload(file);
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}
      {error && (
        <p
          aria-live="polite"
          className="basis-full text-xs text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
