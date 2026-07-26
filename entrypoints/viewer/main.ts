import "./style.css";

interface ViewerBridge {
  clearStream: () => void;
  setStream: (stream: MediaStream) => Promise<void>;
}

declare global {
  interface Window {
    presentationMirror?: ViewerBridge;
  }
}

const root = getElement<HTMLElement>("root");
const video = getElement<HTMLVideoElement>("viewerVideo");
const waitingState = getElement<HTMLElement>("waitingState");
const viewerStatus = getElement<HTMLElement>("viewerStatus");
const toolbar = getElement<HTMLElement>("viewerToolbar");
const alert = getElement<HTMLElement>("viewerAlert");
const fullscreenButtons = [
  getElement<HTMLButtonElement>("fullscreenButton"),
  getElement<HTMLButtonElement>("waitingFullscreenButton"),
];

let toolbarTimer: number | undefined;

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

function showViewerAlert(message: string): void {
  alert.textContent = message;
  alert.hidden = false;
}

function clearViewerAlert(): void {
  alert.hidden = true;
  alert.textContent = "";
}

function showToolbar(): void {
  toolbar.classList.remove("is-hidden");
  window.clearTimeout(toolbarTimer);

  const toolbarHasFocus = toolbar.contains(document.activeElement);
  if (root.classList.contains("is-presenting") && !toolbarHasFocus) {
    toolbarTimer = window.setTimeout(() => {
      toolbar.classList.add("is-hidden");
    }, 2200);
  }
}

async function requestFullscreen(): Promise<void> {
  clearViewerAlert();
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    showViewerAlert(
      "Chrome could not enter fullscreen. You can keep presenting in this window."
    );
  }
}

const bridge: ViewerBridge = {
  clearStream: () => {
    video.srcObject = null;
    root.classList.remove("is-presenting");
    waitingState.hidden = false;
    viewerStatus.lastChild?.replaceWith(" Waiting");
    showToolbar();
  },
  setStream: async (stream: MediaStream) => {
    clearViewerAlert();
    video.srcObject = stream;
    try {
      await video.play();
      waitingState.hidden = true;
      root.classList.add("is-presenting");
      viewerStatus.lastChild?.replaceWith(" Sharing");
      showToolbar();
    } catch (error) {
      showViewerAlert(
        "Video playback did not start. Click Enter Fullscreen or this window, then try sharing again."
      );
      throw new Error("Video playback failed", { cause: error });
    }
  },
};

window.presentationMirror = bridge;

for (const button of fullscreenButtons) {
  button.addEventListener("click", async () => {
    await requestFullscreen();
  });
}

document.addEventListener("fullscreenchange", () => {
  const label = document.fullscreenElement
    ? "Exit Fullscreen"
    : "Enter Fullscreen";
  for (const button of fullscreenButtons) {
    button.textContent = label;
  }
});

document.addEventListener("pointermove", showToolbar, { passive: true });
document.addEventListener("keydown", showToolbar);
toolbar.addEventListener("focusin", showToolbar);
toolbar.addEventListener("focusout", () => {
  window.setTimeout(showToolbar, 0);
});
showToolbar();
