import { browser, defineBackground } from "#imports";

export default defineBackground(() => {
  browser.action.onClicked.addListener(async () => {
    try {
      const response = (await browser.runtime.sendMessage({
        type: "FOCUS_PRESENTATION_MIRROR_CONTROLLER",
      })) as { controllerReady?: boolean } | undefined;

      if (response?.controllerReady) {
        return;
      }
    } catch {
      // No controller page is listening, so create one below.
    }

    await browser.windows.create({
      height: 620,
      type: "popup",
      url: browser.runtime.getURL("/controller.html"),
      width: 420,
    });
  });
});
