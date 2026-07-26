import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

function loadControllerListener() {
  const source = readFileSync(
    new URL("../entrypoints/controller/main.ts", import.meta.url),
    "utf8"
  );
  // Run the actual registered listener without starting the capture UI.
  const start = source.indexOf("browser.runtime.onMessage.addListener(");
  const end = source.indexOf('\nwindow.addEventListener("pagehide"', start);
  let listener;
  let focusCount = 0;
  runInNewContext(stripTypeScriptTypes(source.slice(start, end)), {
    browser: {
      runtime: {
        onMessage: {
          addListener: (callback) => {
            listener = callback;
          },
        },
      },
    },
    window: {
      focus: () => {
        focusCount += 1;
      },
    },
  });
  return { getFocusCount: () => focusCount, listener };
}

test("controller focus requests receive a callback response", () => {
  const { getFocusCount, listener } = loadControllerListener();
  let controllerReady;
  listener({ type: "FOCUS_PRESENTATION_MIRROR_CONTROLLER" }, {}, (response) => {
    ({ controllerReady } = response);
  });
  assert.equal(controllerReady, true);
  assert.equal(getFocusCount(), 1);
});

test("unrelated or malformed messages do not focus or respond", () => {
  const { getFocusCount, listener } = loadControllerListener();
  let responseCount = 0;
  for (const message of [null, undefined, 42, "focus", {}, { type: "OTHER" }]) {
    const result = listener(message, {}, () => {
      responseCount += 1;
    });
    assert.equal(result, undefined);
  }
  assert.equal(responseCount, 0);
  assert.equal(getFocusCount(), 0);
});
