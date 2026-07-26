# Desk Viewer Extension

Desk Viewer Extension is a lightweight, local-only Chrome extension that displays a
captured screen, application window, or browser tab in a separate presentation
window. It uses Chrome's native source picker and sends nothing over the network.

## Requirements

- Google Chrome desktop on macOS or Windows
- Bun
- A projector or secondary display (recommended)

## Build and install

```bash
bun install
bun run build
```

Then load the production build in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `.output/chrome-mv3` directory from this project.
5. Pin **Desk Viewer Extension** to the Chrome toolbar if desired.

No development server or internet connection is needed after the extension is
built and loaded.

## Use

1. Click the Desk Viewer Extension toolbar icon. Clicking it again focuses the
   existing controller instead of opening another one.
2. Choose **Open Viewer**.
3. Move the viewer window to the projector or secondary display.
4. Optionally choose **Enter fullscreen** inside the viewer.
5. In the controller, choose **Start Sharing**.
6. Select an entire screen, application window, or Chrome tab in Chrome's native
   picker.
7. Use **Change Source** to reopen the picker, or **Stop Sharing** to end capture.

For a dual-display setup, capture the source display and place the viewer on the
other display. Capturing the display that contains the viewer creates a recursive
mirror effect.

## Privacy and permissions

Desk Viewer Extension has no backend, analytics, WebRTC signaling, or network
requests. The captured `MediaStream` remains in the controller extension page and
is assigned directly to the same-origin viewer page. The manifest requests no
optional Chrome permissions.

Chrome always shows its native source picker and sharing indicator. The extension
cannot preselect a source, bypass permission prompts, or guarantee that the
correct display is selected.

## Development checks

```bash
bun run compile
bun run lint
bun run build
```

## Manual test checklist

- Toolbar click opens one persistent controller window; another click focuses it.
- Open Viewer creates one viewer and reuses it on subsequent clicks.
- Entire Screen, Window, and Chrome Tab can each be selected in the native picker.
- The selected source appears in the viewer with its aspect ratio preserved.
- Viewer fullscreen works only after its Fullscreen button is clicked.
- Stop Sharing clears both the controller state and viewer video.
- Change Source stops the old stream and opens the picker again.
- Chrome's native stop-sharing control returns both windows to the waiting state.
- Closing and reopening the viewer restores an active stream.
- Closing the controller stops all capture tracks.
- The unpacked production build works with no development server or network.
