import assert from "node:assert/strict";
import test from "node:test";

import {
  readRequestBodyWithLimit,
  RequestBodyTooLargeError,
} from "@/features/billing/lib/request-body-limit";

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new Uint8Array(chunk));
      }
      controller.close();
    },
  });
}

test("reads a request body within the byte limit", async () => {
  const body = await readRequestBodyWithLimit(streamOf([1, 2], [3, 4]), 4);
  assert.deepEqual(Array.from(body), [1, 2, 3, 4]);
});

test("accepts a body at the exact byte limit", async () => {
  const body = await readRequestBodyWithLimit(streamOf([1, 2, 3]), 3);
  assert.deepEqual(Array.from(body), [1, 2, 3]);
});

test("rejects oversized bodies and cancels the stream", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(
    readRequestBodyWithLimit(body, 2),
    RequestBodyTooLargeError,
  );
  assert.equal(cancelled, true);
});

test("treats a missing body as empty", async () => {
  const body = await readRequestBodyWithLimit(null, 1);
  assert.equal(body.byteLength, 0);
});

test("rejects an invalid byte limit", async () => {
  await assert.rejects(readRequestBodyWithLimit(null, -1), RangeError);
});
