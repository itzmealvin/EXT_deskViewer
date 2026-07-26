import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    action: {
      default_title: "Open Desk Viewer Extension",
    },
    description:
      "Mirror a display, application window, or browser tab into a separate presentation window.",
    icons: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
    name: "Desk Viewer Extension",
    version: "0.1.0",
  },
});
