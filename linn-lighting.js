// Mirror LinnStrument's factory note-light pattern.
// Default: C major naturals lit; C = Accent (cyan), other naturals = Main (green), accidentals off.
(function () {
  const NATURAL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

  function applyLinnLights(root = document) {
    root.querySelectorAll?.('.pad').forEach(pad => {
      const note = Number(pad.dataset.note);
      if (!Number.isFinite(note)) return;

      const pc = ((note % 12) + 12) % 12;
      pad.classList.remove('linn-main', 'linn-accent', 'linn-unlit');

      if (pc === 0) pad.classList.add('linn-accent');
      else if (NATURAL_PCS.has(pc)) pad.classList.add('linn-main');
      else pad.classList.add('linn-unlit');
    });
  }

  applyLinnLights();

  const grid = document.getElementById('padGrid');
  if (grid) {
    new MutationObserver(() => applyLinnLights(grid)).observe(grid, {
      childList: true,
      subtree: true,
    });
  }

  window.applyLinnLights = applyLinnLights;
})();
