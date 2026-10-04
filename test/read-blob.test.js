import assert from "node:assert/strict";
import test from "node:test";
import { readBlob } from "../src/read-blob.ts";

test("blob reads preserve bytes and cancellation stops a pending stream", async () => {
  const bytes = new Uint8Array(200000).map((_, index) => index % 251);
  assert.deepEqual(
    await readBlob(new Blob([bytes]), new AbortController().signal),
    bytes,
  );
  let cancelled = false;
  const controller = new AbortController();
  const reading = readBlob(
    {
      size: 5,
      stream: () =>
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
    },
    controller.signal,
  );
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancelled, true);
});

test("an already cancelled read never opens the blob stream", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readBlob(
      {
        stream() {
          assert.fail("stream opened after cancellation");
        },
      },
      controller.signal,
    ),
    { name: "AbortError" },
  );
});
