const TOTAL_COLUMNS = 25;
const VISIBLE_COLUMNS = 10;
const ROWS = 8;
const BASE_NOTE = 18; // F#0, LinnStrument 200 default lowest pitch
const ROW_INTERVAL = 5; // fourths tuning
const MIDI_CHANNEL = 0; // channel 1
const VELOCITY = 100;

// iPad 6th-gen 9.7-inch 4:3 active display, derived from the 9.7-inch diagonal.
const IPAD_SCREEN_MM = { width: 197.104, height: 147.828 };
const LINN_PAD_MM = 17;
const LINN_GAP_MM = 2;

const NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

const state = {
  midiAccess: null,
  output: null,
  columnOffset: 0,
  labels: true,
  activePointers: new Map(),
  soundingCounts: new Map(),
};

const els = {
  controls: document.getElementById("controls"),
  enableMidiButton: document.getElementById("enableMidiButton"),
  midiOutputSelect: document.getElementById("midiOutputSelect"),
  labelsButton: document.getElementById("labelsButton"),
  fullScreenButton: document.getElementById("fullScreenButton"),
  showControlsButton: document.getElementById("showControlsButton"),
  midiStatus: document.getElementById("midiStatus"),
  scaleStatus: document.getElementById("scaleStatus"),
  windowStatus: document.getElementById("windowStatus"),
  surfaceViewport: document.getElementById("surfaceViewport"),
  surfaceStage: document.getElementById("surfaceStage"),
  surfaceBadge: document.getElementById("surfaceBadge"),
  padGrid: document.getElementById("padGrid"),
  previousColumnsButton: document.getElementById("previousColumnsButton"),
  nextColumnsButton: document.getElementById("nextColumnsButton"),
};

function midiNoteName(note) {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${octave}`;
}

function noteForCell(rowFromBottom, absoluteColumn) {
  return BASE_NOTE + absoluteColumn + rowFromBottom * ROW_INTERVAL;
}

function stopAllNotes() {
  for (const note of state.soundingCounts.keys()) {
    sendNoteOff(note);
  }
  state.soundingCounts.clear();
  state.activePointers.clear();
  document.querySelectorAll(".pad.active").forEach(pad => pad.classList.remove("active"));
  sendRaw([0xB0 | MIDI_CHANNEL, 123, 0]);
}

function buildGrid() {
  stopAllNotes();
  els.padGrid.replaceChildren();

  for (let visualRow = 0; visualRow < ROWS; visualRow++) {
    const rowFromBottom = ROWS - 1 - visualRow;

    for (let visibleColumn = 0; visibleColumn < VISIBLE_COLUMNS; visibleColumn++) {
      const absoluteColumn = state.columnOffset + visibleColumn;
      const note = noteForCell(rowFromBottom, absoluteColumn);
      const pad = document.createElement("button");
      pad.type = "button";
      pad.className = "pad";
      if (!state.labels) pad.classList.add("labels-off");
      if (note % 12 === 0) pad.classList.add("c-note");
      pad.dataset.note = String(note);
      pad.dataset.row = String(rowFromBottom);
      pad.dataset.column = String(absoluteColumn);
      pad.setAttribute("aria-label", `${midiNoteName(note)}, row ${rowFromBottom + 1}, column ${absoluteColumn + 1}`);

      const led = document.createElement("span");
      led.className = "led";
      const label = document.createElement("span");
      label.className = "note-label";
      label.textContent = midiNoteName(note);
      pad.append(led, label);
      els.padGrid.appendChild(pad);
    }
  }

  updateWindowReadout();
}

function updateWindowReadout() {
  const start = state.columnOffset + 1;
  const end = state.columnOffset + VISIBLE_COLUMNS;
  els.windowStatus.textContent = `Columns ${start}–${end} of ${TOTAL_COLUMNS}`;
  els.surfaceBadge.textContent = `${start}–${end} / ${TOTAL_COLUMNS}`;
  els.previousColumnsButton.disabled = state.columnOffset === 0;
  els.nextColumnsButton.disabled = state.columnOffset >= TOTAL_COLUMNS - VISIBLE_COLUMNS;
}

function moveWindow(delta) {
  const next = Math.max(0, Math.min(TOTAL_COLUMNS - VISIBLE_COLUMNS, state.columnOffset + delta));
  if (next === state.columnOffset) return;
  state.columnOffset = next;
  buildGrid();
}

function measureSurface() {
  const rect = els.surfaceViewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const screenW = Math.max(window.screen.width, window.screen.height);
  const screenH = Math.min(window.screen.width, window.screen.height);
  const pxPerMmWidth = screenW / IPAD_SCREEN_MM.width;
  const pxPerMmHeight = screenH / IPAD_SCREEN_MM.height;
  const pxPerMm = (pxPerMmWidth + pxPerMmHeight) / 2;

  const idealPadPx = LINN_PAD_MM * pxPerMm;
  const idealGapPx = LINN_GAP_MM * pxPerMm;
  const idealWidth = VISIBLE_COLUMNS * idealPadPx + (VISIBLE_COLUMNS - 1) * idealGapPx;
  const idealHeight = ROWS * idealPadPx + (ROWS - 1) * idealGapPx;

  const fitScale = Math.min(1, rect.width / idealWidth, rect.height / idealHeight);
  const padPx = idealPadPx * fitScale;
  const gapPx = idealGapPx * fitScale;

  document.documentElement.style.setProperty("--pad", `${padPx.toFixed(2)}px`);
  document.documentElement.style.setProperty("--gap", `${gapPx.toFixed(2)}px`);

  const zoom = window.visualViewport?.scale || 1;
  const actualPadMm = padPx * zoom / pxPerMm;
  const actualGapMm = gapPx * zoom / pxPerMm;
  const percent = actualPadMm / LINN_PAD_MM * 100;

  els.scaleStatus.textContent = `Pad ≈ ${actualPadMm.toFixed(1)} mm • gap ≈ ${actualGapMm.toFixed(1)} mm • ${percent.toFixed(0)}% scale`;
}

function midiPortsToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection.filter(Boolean);

  const ports = [];
  if (typeof collection.forEach === "function") {
    try {
      collection.forEach(port => { if (port && !ports.includes(port)) ports.push(port); });
      if (ports.length || collection.size === 0) return ports;
    } catch (_) {}
  }

  if (typeof collection.values === "function") {
    try {
      const values = collection.values();
      if (values && typeof values.next === "function") {
        let item = values.next();
        while (!item.done) {
          if (item.value && !ports.includes(item.value)) ports.push(item.value);
          item = values.next();
        }
        return ports;
      }
    } catch (_) {}
  }

  if (typeof collection.length === "number") {
    for (let i = 0; i < collection.length; i++) if (collection[i]) ports.push(collection[i]);
    return ports;
  }

  if (typeof collection === "object") {
    for (const value of Object.values(collection)) {
      if (value && typeof value === "object" && !ports.includes(value)) ports.push(value);
    }
  }
  return ports;
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) {
    els.midiStatus.textContent = "Web MIDI is unavailable in this browser.";
    return;
  }

  try {
    state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    state.midiAccess.onstatechange = refreshMidiOutputs;
    refreshMidiOutputs();
    els.enableMidiButton.textContent = "MIDI Enabled";
    els.enableMidiButton.disabled = true;
  } catch (error) {
    els.midiStatus.textContent = `MIDI failed: ${error.message || error}`;
  }
}

function refreshMidiOutputs() {
  const previous = state.output ? String(state.output.id ?? state.output.name ?? "") : "";
  const outputs = midiPortsToArray(state.midiAccess?.outputs);
  els.midiOutputSelect.replaceChildren();

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No output";
  els.midiOutputSelect.appendChild(none);

  outputs.forEach(output => {
    const option = document.createElement("option");
    option.value = String(output.id ?? output.name ?? "");
    option.textContent = output.name || output.manufacturer || "MIDI output";
    els.midiOutputSelect.appendChild(option);
  });

  els.midiOutputSelect.disabled = outputs.length === 0;

  let preferred = outputs.find(output => String(output.id ?? output.name ?? "") === previous);
  if (!preferred) preferred = outputs.find(output => /AUM/i.test(output.name || ""));
  if (!preferred) preferred = outputs[0] || null;

  state.output = preferred;
  els.midiOutputSelect.value = preferred ? String(preferred.id ?? preferred.name ?? "") : "";
  els.midiStatus.textContent = preferred ? `MIDI → ${preferred.name || "selected output"} • ch 1` : "MIDI enabled • no output found";
}

function selectOutput(id) {
  stopAllNotes();
  const outputs = midiPortsToArray(state.midiAccess?.outputs);
  state.output = outputs.find(output => String(output.id ?? output.name ?? "") === String(id)) || null;
  els.midiStatus.textContent = state.output ? `MIDI → ${state.output.name || "selected output"} • ch 1` : "No MIDI output selected";
}

function sendRaw(bytes) {
  if (!state.output || typeof state.output.send !== "function") return;
  state.output.send(bytes);
}

function sendNoteOn(note) {
  if (note < 0 || note > 127) return;
  sendRaw([0x90 | MIDI_CHANNEL, note & 0x7f, VELOCITY]);
}

function sendNoteOff(note) {
  if (note < 0 || note > 127) return;
  sendRaw([0x80 | MIDI_CHANNEL, note & 0x7f, 0]);
}

function incrementNote(note) {
  const count = state.soundingCounts.get(note) || 0;
  state.soundingCounts.set(note, count + 1);
  if (count === 0) sendNoteOn(note);
}

function decrementNote(note) {
  const count = state.soundingCounts.get(note) || 0;
  if (count <= 1) {
    state.soundingCounts.delete(note);
    sendNoteOff(note);
  } else {
    state.soundingCounts.set(note, count - 1);
  }
}

function padAtPoint(x, y) {
  return document.elementFromPoint(x, y)?.closest?.(".pad") || null;
}

function pressPointer(pointerId, pad) {
  if (!pad) return;
  const previous = state.activePointers.get(pointerId);
  if (previous?.pad === pad) return;
  if (previous) releasePointer(pointerId);

  const note = Number(pad.dataset.note);
  state.activePointers.set(pointerId, { pad, note });
  pad.classList.add("active");
  incrementNote(note);
}

function releasePointer(pointerId) {
  const active = state.activePointers.get(pointerId);
  if (!active) return;
  active.pad.classList.remove("active");
  decrementNote(active.note);
  state.activePointers.delete(pointerId);
}

function toggleLabels() {
  state.labels = !state.labels;
  els.labelsButton.textContent = state.labels ? "Labels On" : "Labels Off";
  document.querySelectorAll(".pad").forEach(pad => pad.classList.toggle("labels-off", !state.labels));
}

async function enterSurfaceMode() {
  document.body.classList.add("surface-mode");
  requestAnimationFrame(measureSurface);
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    }
  } catch (_) {
    // WKWebView-based browsers may reject the Fullscreen API; the app still hides its own controls.
  }
}

async function exitSurfaceMode() {
  document.body.classList.remove("surface-mode");
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
  } catch (_) {}
  requestAnimationFrame(measureSurface);
}

els.enableMidiButton.addEventListener("click", enableMidi);
els.midiOutputSelect.addEventListener("change", event => selectOutput(event.target.value));
els.labelsButton.addEventListener("click", toggleLabels);
els.fullScreenButton.addEventListener("click", enterSurfaceMode);
els.showControlsButton.addEventListener("click", exitSurfaceMode);
els.previousColumnsButton.addEventListener("click", () => moveWindow(-5));
els.nextColumnsButton.addEventListener("click", () => moveWindow(5));

els.padGrid.addEventListener("pointerdown", event => {
  const pad = event.target.closest?.(".pad");
  if (!pad) return;
  event.preventDefault();
  try { els.padGrid.setPointerCapture(event.pointerId); } catch (_) {}
  pressPointer(event.pointerId, pad);
});

els.padGrid.addEventListener("pointermove", event => {
  if (!state.activePointers.has(event.pointerId)) return;
  event.preventDefault();
  const pad = padAtPoint(event.clientX, event.clientY);
  if (pad) pressPointer(event.pointerId, pad);
  else releasePointer(event.pointerId);
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  els.padGrid.addEventListener(eventName, event => {
    if (!state.activePointers.has(event.pointerId)) return;
    event.preventDefault();
    releasePointer(event.pointerId);
  });
}

els.surfaceViewport.addEventListener("contextmenu", event => event.preventDefault());
window.addEventListener("blur", stopAllNotes);
document.addEventListener("visibilitychange", () => { if (document.hidden) stopAllNotes(); });
window.addEventListener("resize", measureSurface);
window.addEventListener("orientationchange", () => setTimeout(measureSurface, 150));
window.visualViewport?.addEventListener("resize", measureSurface);
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && document.body.classList.contains("surface-mode")) {
    // Keep the app's surface mode if the browser itself exits fullscreen.
    requestAnimationFrame(measureSurface);
  }
});

buildGrid();
requestAnimationFrame(measureSurface);
