// Make the piano, chord/interval visualizer, and bundle tools work in True Scale mode too.
(function () {
  // The original app limited bundle-select mode to Full 200. Remove that restriction.
  setBundleSelecting = function (enabled) {
    state.bundleSelecting = !!enabled;
    document.body.classList.toggle("bundle-selecting", state.bundleSelecting);
    els.bundleModeButton.textContent = state.bundleSelecting ? "Done Selecting" : "Bundle Select";
  };

  // Keep the piano and theory readouts live in either board mode.
  updateVisualizers = function () {
    updatePianoHighlights();
    updateTheory();
  };

  // Rebuild the piano whenever display mode changes so both modes stay in sync.
  const originalSetMode = setMode;
  setMode = function (mode) {
    originalSetMode(mode);
    buildPiano();
    updateVisualizers();
  };

  // Panning the 10-column True Scale window rebuilds the grid. Preserve Bundle Select mode.
  const originalMoveWindow = moveWindow;
  moveWindow = function (delta) {
    const keepSelecting = state.bundleSelecting;
    originalMoveWindow(delta);
    if (keepSelecting && state.mode === "trueScale") setBundleSelecting(true);
    updateVisualizers();
  };

  // In True Scale, intercept the old Bundle Select click behavior so it does not switch to Full 200.
  els.bundleModeButton.addEventListener("click", event => {
    if (state.mode !== "trueScale") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setBundleSelecting(!state.bundleSelecting);
  }, true);

  buildPiano();
  updateBundleUI();
  updateVisualizers();
})();
