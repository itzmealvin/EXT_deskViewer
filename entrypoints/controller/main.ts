import { browser } from "#imports";
import "./style.css";

type ControllerStatus =
  | "idle"
  | "viewer"
  | "selecting"
  | "sharing"
  | "stopped"
  | "error";

type AlertKind = "danger" | "info" | "warning";

interface ViewerBridge {
  clearStream: () => void;
  setStream: (stream: MediaStream) => Promise<void>;
}

interface ViewerWindow extends Window {
  presentationMirror?: ViewerBridge;
}

const VIEWER_NAME = "presentation-mirror-viewer";
const VIEWER_FEATURES = "popup=yes,width=1280,height=720";
const VIEWER_LOAD_TIMEOUT_MS = 8000;

const elements = {
  alertRegion: getElement<HTMLDivElement>("alertRegion"),
  changeSourceButton: getElement<HTMLButtonElement>("changeSourceButton"),
  focusViewerButton: getElement<HTMLButtonElement>("focusViewerButton"),
  openViewerButton: getElement<HTMLButtonElement>("openViewerButton"),
  sourceFrameRate: getElement<HTMLElement>("sourceFrameRate"),
  sourceLabel: getElement<HTMLElement>("sourceLabel"),
  sourceResolution: getElement<HTMLElement>("sourceResolution"),
  sourceState: getElement<HTMLElement>("sourceState"),
  sourceType: getElement<HTMLElement>("sourceType"),
  startSharingButton: getElement<HTMLButtonElement>("startSharingButton"),
  startSharingHint: getElement<HTMLElement>("startSharingHint"),
  startSharingLabel: getElement<HTMLElement>("startSharingLabel"),
  statusBadge: getElement<HTMLElement>("statusBadge"),
  statusText: getElement<HTMLElement>("statusText"),
  stopSharingButton: getElement<HTMLButtonElement>("stopSharingButton"),
};

let capturedStream: MediaStream | null = null;
let viewerWindow: ViewerWindow | null = null;
let isSelectingSource = false;
let viewerWasOpen = false;

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element as T;
}

function setStatus(status: ControllerStatus): void {
  const labels: Record<ControllerStatus, string> = {
    error: "Error",
    idle: "Idle",
    selecting: "Selecting source",
    sharing: "Sharing",
    stopped: "Stopped",
    viewer: "Viewer ready",
  };

  elements.statusBadge.className = `status-badge status-${status}`;
  elements.statusText.textContent = labels[status];
}

function getStartSharingCopy(
  selectingSource: boolean,
  sharing: boolean
): { hint: string; label: string } {
  if (selectingSource) {
    return {
      hint: "Use Chrome’s source picker",
      label: "Selecting Source…",
    };
  }

  if (sharing) {
    return {
      hint: "Use Change Source to switch",
      label: "Sharing Live",
    };
  }

  return {
    hint: "Choose a display, window, or tab",
    label: "Start Sharing",
  };
}

function showAlert(message: string, kind: AlertKind): void {
  const alert = document.createElement("div");
  alert.className = `alert alert-${kind}`;
  alert.setAttribute("role", kind === "danger" ? "alert" : "status");
  alert.textContent = message;
  elements.alertRegion.replaceChildren(alert);
}

function clearAlert(): void {
  elements.alertRegion.replaceChildren();
}

function updateControls(): void {
  const viewerReady = Boolean(viewerWindow && !viewerWindow.closed);
  const isSharing = Boolean(capturedStream);

  elements.openViewerButton.disabled = isSelectingSource;
  elements.startSharingButton.disabled = isSelectingSource || isSharing;
  elements.startSharingButton.setAttribute(
    "aria-busy",
    String(isSelectingSource)
  );
  const { hint, label } = getStartSharingCopy(isSelectingSource, isSharing);
  elements.startSharingLabel.textContent = label;
  elements.startSharingHint.textContent = hint;
  elements.changeSourceButton.disabled = isSelectingSource || !isSharing;
  elements.stopSharingButton.disabled = isSelectingSource || !isSharing;
  elements.focusViewerButton.disabled = !viewerReady;
}

function resetSourceDetails(): void {
  elements.sourceLabel.textContent = "—";
  elements.sourceType.textContent = "—";
  elements.sourceResolution.textContent = "—";
  elements.sourceFrameRate.textContent = "—";
  elements.sourceState.textContent = "No signal";
  elements.sourceState.classList.remove("is-live");
}

function updateSourceDetails(track: MediaStreamTrack): void {
  const settings = track.getSettings();
  const { width, height, frameRate } = settings;

  elements.sourceLabel.textContent = track.label || "Shared source";
  elements.sourceType.textContent = settings.displaySurface ?? "Unknown";
  elements.sourceResolution.textContent =
    width && height ? `${width} × ${height}` : "Not reported";
  elements.sourceFrameRate.textContent = frameRate
    ? `${Math.round(frameRate)} fps`
    : "Not reported";
  elements.sourceState.textContent = "Live";
  elements.sourceState.classList.add("is-live");
}

function getViewerBridge(): ViewerBridge | null {
  if (!viewerWindow || viewerWindow.closed) {
    return null;
  }
  return viewerWindow.presentationMirror ?? null;
}

function waitForViewerBridge(target: ViewerWindow): Promise<ViewerBridge> {
  const existingBridge = target.presentationMirror;
  if (existingBridge) {
    return Promise.resolve(existingBridge);
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Viewer load timed out"));
    }, VIEWER_LOAD_TIMEOUT_MS);

    const poll = window.setInterval(() => {
      if (target.closed) {
        cleanup();
        reject(new Error("Viewer was closed"));
        return;
      }

      if (target.presentationMirror) {
        const bridge = target.presentationMirror;
        cleanup();
        resolve(bridge);
      }
    }, 50);

    const cleanup = (): void => {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  });
}

async function openViewer(): Promise<ViewerBridge | null> {
  clearAlert();

  if (viewerWindow && !viewerWindow.closed) {
    viewerWindow.focus();
  } else {
    viewerWindow = window.open(
      browser.runtime.getURL("/viewer.html"),
      VIEWER_NAME,
      VIEWER_FEATURES
    ) as ViewerWindow | null;
  }

  if (!viewerWindow) {
    setStatus("error");
    showAlert(
      "Chrome blocked the viewer window. Allow popups for this extension, then try again.",
      "danger"
    );
    updateControls();
    return null;
  }

  let bridge: ViewerBridge;
  try {
    bridge = await waitForViewerBridge(viewerWindow);
  } catch {
    setStatus("error");
    showAlert(
      viewerWindow.closed
        ? "The viewer window was closed. Open it again when you are ready."
        : "The viewer did not finish loading. Close it and open it again.",
      "danger"
    );
    updateControls();
    return null;
  }

  viewerWasOpen = true;
  if (capturedStream) {
    try {
      await bridge.setStream(capturedStream);
      setStatus("sharing");
    } catch {
      setStatus("error");
      showAlert(
        "The viewer could not play the captured video. Focus the viewer and try sharing again.",
        "danger"
      );
      updateControls();
      return null;
    }
  } else {
    setStatus("viewer");
  }
  updateControls();
  return bridge;
}

function clearViewerStream(): void {
  try {
    getViewerBridge()?.clearStream();
  } catch {
    // The viewer may have closed between the check and the bridge call.
  }
}

function stopCurrentStream(): void {
  if (!capturedStream) {
    return;
  }

  const streamToStop = capturedStream;
  capturedStream = null;
  for (const track of streamToStop.getTracks()) {
    track.stop();
  }
  clearViewerStream();
  resetSourceDetails();
  updateControls();
}

function handleCaptureEnded(stream: MediaStream): void {
  if (capturedStream !== stream) {
    return;
  }

  capturedStream = null;
  clearViewerStream();
  resetSourceDetails();
  setStatus("stopped");
  showAlert(
    "Sharing stopped from Chrome. Choose Start Sharing to select a source again.",
    "info"
  );
  updateControls();
}

function describeCaptureError(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return "Chrome could not start screen sharing. Try selecting the source again.";
  }

  if (error.name === "NotAllowedError") {
    return "Chrome did not allow capture. Choose Start Sharing to open the source picker and try again.";
  }

  if (error.name === "NotFoundError") {
    return "No shareable displays, windows, or tabs were found. Open a source or connect a display, then try again.";
  }

  if (error.name === "NotReadableError") {
    return "Chrome could not read that source. Close other capture tools and try again.";
  }

  return "Chrome could not start screen sharing. Try selecting the source again.";
}

async function beginCapture(replaceCurrent: boolean): Promise<void> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("error");
    showAlert(
      "Screen capture is unavailable in this browser. Use a current desktop version of Google Chrome.",
      "danger"
    );
    return;
  }

  if (replaceCurrent) {
    stopCurrentStream();
  }

  clearAlert();
  isSelectingSource = true;
  setStatus("selecting");
  updateControls();

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: {
          ideal: 30,
          max: 60,
        },
      },
    });

    capturedStream = stream;
    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) {
      stopCurrentStream();
      throw new DOMException("No video track", "NotFoundError");
    }

    videoTrack.addEventListener("ended", () => handleCaptureEnded(stream), {
      once: true,
    });
    updateSourceDetails(videoTrack);

    const bridge = await openViewer();
    if (!bridge) {
      return;
    }

    setStatus("sharing");
  } catch (error) {
    if (capturedStream) {
      stopCurrentStream();
    }
    setStatus("error");
    showAlert(describeCaptureError(error), "danger");
  } finally {
    isSelectingSource = false;
    updateControls();
  }
}

elements.openViewerButton.addEventListener("click", async () => {
  await openViewer();
});

elements.startSharingButton.addEventListener("click", async () => {
  await beginCapture(false);
});

elements.changeSourceButton.addEventListener("click", async () => {
  await beginCapture(true);
});

elements.stopSharingButton.addEventListener("click", () => {
  stopCurrentStream();
  clearAlert();
  setStatus("idle");
});

elements.focusViewerButton.addEventListener("click", () => {
  if (viewerWindow && !viewerWindow.closed) {
    viewerWindow.focus();
    return;
  }

  showAlert(
    "The viewer window is closed. Choose Open Viewer to reopen it.",
    "warning"
  );
  updateControls();
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "FOCUS_PRESENTATION_MIRROR_CONTROLLER"
  ) {
    window.focus();
    return Promise.resolve({ controllerReady: true });
  }
});

window.addEventListener("pagehide", stopCurrentStream);
window.addEventListener("beforeunload", stopCurrentStream);

window.setInterval(() => {
  if (viewerWasOpen && viewerWindow?.closed) {
    viewerWindow = null;
    viewerWasOpen = false;
    updateControls();
    showAlert(
      capturedStream
        ? "The viewer window closed while sharing. Open it again to restore the picture."
        : "The viewer window was closed. Open it again when you are ready.",
      "warning"
    );
  }
}, 500);

resetSourceDetails();
updateControls();
