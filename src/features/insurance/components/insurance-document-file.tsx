"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  authorizeInsuranceDocumentUploadAction,
  completeInsuranceDocumentStorageCleanupAction,
  registerInsuranceDocumentUploadAction,
} from "@/features/insurance/actions";
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
  pendingCleanupPaths: string[];
  storagePath: string | null;
  canUpload: boolean;
}>;

export function InsuranceDocumentFile({
  clinicId,
  claimId,
  documentId,
  name,
  pendingCleanupPaths,
  storagePath,
  canUpload,
}: InsuranceDocumentFileProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function retryCleanup(path: string) {
    setError(null);
    setBusy(true);
    try {
      const cleanupFinalization =
        await completeInsuranceDocumentStorageCleanupAction(
          clinicId,
          claimId,
          documentId,
          path,
        );
      if (!cleanupFinalization.success) {
        setError(
          "The replaced private file could not be cleaned up. Try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("The replaced private file could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }

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
      const uploadAuthorization = await authorizeInsuranceDocumentUploadAction(
        clinicId,
        claimId,
        documentId,
        path,
      );
      if (!uploadAuthorization.success) {
        setError(uploadAuthorization.error);
        return;
      }
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError(
          "The upload failed. Retry cleanup below if an object was created before the failure.",
        );
        router.refresh();
        return;
      }
      const registration = await registerInsuranceDocumentUploadAction(
        clinicId,
        claimId,
        documentId,
        path,
      );
      if (!registration.success) {
        let cleanupPending = false;
        if (registration.cleanupAuthorized) {
          try {
            const cleanupFinalization =
              await completeInsuranceDocumentStorageCleanupAction(
                clinicId,
                claimId,
                documentId,
                path,
              );
            cleanupPending = !cleanupFinalization.success;
          } catch {
            cleanupPending = true;
          }
        }
        setError(
          cleanupPending
            ? "Another upload was saved, but this file could not be removed. Retry cleanup below."
            : registration.cleanupAuthorized
              ? "Another upload was saved first. This extra file was removed."
              : "The document was uploaded but could not be registered. Retry its cleanup below.",
        );
        router.refresh();
        return;
      }
      if (storagePath && storagePath !== path) {
        const cleanup = await completeInsuranceDocumentStorageCleanupAction(
          clinicId,
          claimId,
          documentId,
          storagePath,
        );
        if (!cleanup.success) {
          setError(
            "The new document is saved, but the replaced private file could not be cleaned up. Retry below.",
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
      {pendingCleanupPaths.map((path) => (
        <button
          className="text-sm font-medium text-amber-800 underline-offset-2 hover:underline disabled:opacity-50"
          disabled={busy}
          key={path}
          onClick={() => void retryCleanup(path)}
          type="button"
        >
          Retry private-file cleanup
        </button>
      ))}
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
