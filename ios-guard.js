(() => {
  const app = document.getElementById("app");
  if (!app) return;

  const clearSelection = () => {
    try {
      const selection = window.getSelection?.();
      if (selection && selection.rangeCount) selection.removeAllRanges();
    } catch (_) {}
  };

  const insideApp = target => target?.closest?.("#app");
  const isNativeFormControl = target => target?.closest?.("select, input, textarea, option");
  const isInstrumentSurface = target => target?.closest?.(
    "#padGrid, .pad, #pianoKeyboard, .piano-key, .theory-readout, .surface-stage, .surface-badge"
  );

  // Stop the normal browser/WKWebView selection and context-menu paths.
  for (const eventName of ["contextmenu", "selectstart", "dragstart"]) {
    document.addEventListener(eventName, event => {
      if (!insideApp(event.target)) return;
      event.preventDefault();
      clearSelection();
    }, { capture: true });
  }

  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection?.();
    const anchor = selection?.anchorNode;
    const element = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    if (insideApp(element)) clearSelection();
  });

  // iOS/WKWebView can still open Copy / Look Up / Translate on a sustained touch
  // even when user-select and -webkit-touch-callout are disabled. Prevent the
  // default single-touch gesture on the actual instrument/display surfaces.
  // Native selects/inputs remain untouched so the controls continue to work.
  document.addEventListener("touchstart", event => {
    if (!insideApp(event.target)) return;
    clearSelection();
    if (event.touches.length === 1 && isInstrumentSurface(event.target) && !isNativeFormControl(event.target)) {
      event.preventDefault();
    }
  }, { capture: true, passive: false });

  document.addEventListener("touchmove", event => {
    if (!insideApp(event.target)) return;
    if (event.touches.length === 1 && isInstrumentSurface(event.target) && !isNativeFormControl(event.target)) {
      event.preventDefault();
    }
  }, { capture: true, passive: false });

  document.addEventListener("touchend", event => {
    if (insideApp(event.target)) clearSelection();
  }, { capture: true, passive: true });

  app.addEventListener("pointerdown", clearSelection, { capture: true });
})();
