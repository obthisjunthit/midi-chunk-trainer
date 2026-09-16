const TOTAL_COLUMNS = 25;
const TRUE_SCALE_COLUMNS = 10;
const ROWS = 8;
const DEFAULT_BASE_NOTE = 18; // Gb0/F#0
const MAX_BASE_NOTE = 68; // base + 24 columns + 7*5 semitones <= 127
const ROW_INTERVAL = 5;
const MIDI_CHANNEL = 0;
const VELOCITY = 100;

const IPAD_SCREEN_MM = { width: 197.104, height: 147.828 };
const LINN_PAD_MM = 17;
const LINN_GAP_MM = 2;
const NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

const CHORD_TEMPLATES = [
  { suffix: "", name: "major", pcs: [0,4,7], formula: "1 3 5", priority: 100 },
  { suffix: "m", name: "minor", pcs: [0,3,7], formula: "1 ♭3 5", priority: 100 },
  { suffix: "dim", name: "diminished", pcs: [0,3,6], formula: "1 ♭3 ♭5", priority: 92 },
  { suffix: "+", name: "augmented", pcs: [0,4,8], formula: "1 3 ♯5", priority: 92 },
  { suffix: "sus2", name: "sus2", pcs: [0,2,7], formula: "1 2 5", priority: 88 },
  { suffix: "sus4", name: "sus4", pcs: [0,5,7], formula: "1 4 5", priority: 88 },
  { suffix: "6", name: "sixth", pcs: [0,4,7,9], formula: "1 3 5 6", priority: 94 },
  { suffix: "m6", name: "minor sixth", pcs: [0,3,7,9], formula: "1 ♭3 5 6", priority: 94 },
  { suffix: "7", name: "dominant seventh", pcs: [0,4,7,10], formula: "1 3 5 ♭7", priority: 100 },
  { suffix: "maj7", name: "major seventh", pcs: [0,4,7,11], formula: "1 3 5 7", priority: 100 },
  { suffix: "m7", name: "minor seventh", pcs: [0,3,7,10], formula: "1 ♭3 5 ♭7", priority: 100 },
  { suffix: "m7♭5", name: "half-diminished", pcs: [0,3,6,10], formula: "1 ♭3 ♭5 ♭7", priority: 98 },
  { suffix: "dim7", name: "diminished seventh", pcs: [0,3,6,9], formula: "1 ♭3 ♭5 6", priority: 96 },
  { suffix: "7sus4", name: "dominant sus4", pcs: [0,5,7,10], formula: "1 4 5 ♭7", priority: 92 },
  { suffix: "add9", name: "add nine", pcs: [0,2,4,7], formula: "1 2 3 5", priority: 90 },
  { suffix: "m(add9)", name: "minor add nine", pcs: [0,2,3,7], formula: "1 2 ♭3 5", priority: 90 },
  { suffix: "9", name: "dominant ninth", pcs: [0,2,4,7,10], formula: "1 2 3 5 ♭7", priority: 96 },
  { suffix: "maj9", name: "major ninth", pcs: [0,2,4,7,11], formula: "1 2 3 5 7", priority: 96 },
  { suffix: "m9", name: "minor ninth", pcs: [0,2,3,7,10], formula: "1 2 ♭3 5 ♭7", priority: 96 },
  { suffix: "11", name: "eleventh", pcs: [0,2,4,5,7,10], formula: "1 2 3 4 5 ♭7", priority: 86 },
  { suffix: "m11", name: "minor eleventh", pcs: [0,2,3,5,7,10], formula: "1 2 ♭3 4 5 ♭7", priority: 88 },
  { suffix: "13", name: "thirteenth", pcs: [0,2,4,7,9,10], formula: "1 2 3 5 6 ♭7", priority: 86 },
];

const state = {
  midiAccess: null,
  output: null,
  mode: "trueScale",
  columnOffset: 0,
  baseNote: DEFAULT_BASE_NOTE,
  labels: true,
  activePointers: new Map(),
  soundingCounts: new Map(),
  bundleSelecting: false,
  bundleCells: new Set(),
  bundleTimer: null,
};

const els = {
  controls: document.getElementById("controls"),
  enableMidiButton: document.getElementById("enableMidiButton"),
  midiOutputSelect: document.getElementById("midiOutputSelect"),
  trueScaleModeButton: document.getElementById("trueScaleModeButton"),
  fullBoardModeButton: document.getElementById("fullBoardModeButton"),
  baseNoteSelect: document.getElementById("baseNoteSelect"),
  octaveDownButton: document.getElementById("octaveDownButton"),
  octaveUpButton: document.getElementById("octaveUpButton"),
  labelsButton: document.getElementById("labelsButton"),
  fullScreenButton: document.getElementById("fullScreenButton"),
  showControlsButton: document.getElementById("showControlsButton"),
  midiStatus: document.getElementById("midiStatus"),
  scaleStatus: document.getElementById("scaleStatus"),
  windowStatus: document.getElementById("windowStatus"),
  surfaceViewport: document.getElementById("surfaceViewport"),
  analysisPanel: document.getElementById("analysisPanel"),
  pianoKeyboard: document.getElementById("pianoKeyboard"),
  pitchReadout: document.getElementById("pitchReadout"),
  chordReadout: document.getElementById("chordReadout"),
  intervalReadout: document.getElementById("intervalReadout"),
  alternateReadout: document.getElementById("alternateReadout"),
  bundleModeButton: document.getElementById("bundleModeButton"),
  playBundleButton: document.getElementById("playBundleButton"),
  clearBundleButton: document.getElementById("clearBundleButton"),
  bundleStatus: document.getElementById("bundleStatus"),
  boardArea: document.getElementById("boardArea"),
  surfaceStage: document.getElementById("surfaceStage"),
  surfaceBadge: document.getElementById("surfaceBadge"),
  padGrid: document.getElementById("padGrid"),
  previousColumnsButton: document.getElementById("previousColumnsButton"),
  nextColumnsButton: document.getElementById("nextColumnsButton"),
};

function pitchClass(note) { return ((note % 12) + 12) % 12; }
function noteName(note) { return `${NOTE_NAMES[pitchClass(note)]}${Math.floor(note / 12) - 1}`; }
function pitchClassName(pc) { return NOTE_NAMES[((pc % 12) + 12) % 12]; }
function cellKey(row, column) { return `${row}:${column}`; }
function noteForCell(rowFromBottom, absoluteColumn) { return state.baseNote + absoluteColumn + rowFromBottom * ROW_INTERVAL; }
function visibleColumns() { return state.mode === "fullBoard" ? TOTAL_COLUMNS : TRUE_SCALE_COLUMNS; }
function maxBoardNote() { return state.baseNote + (TOTAL_COLUMNS - 1) + (ROWS - 1) * ROW_INTERVAL; }

function populateBaseNotes() {
  els.baseNoteSelect.replaceChildren();
  for (let note = 0; note <= MAX_BASE_NOTE; note++) {
    const option = document.createElement("option");
    option.value = String(note);
    option.textContent = `${noteName(note)} (${note})`;
    if (note === state.baseNote) option.selected = true;
    els.baseNoteSelect.appendChild(option);
  }
  updatePitchControls();
}

function updatePitchControls() {
  els.baseNoteSelect.value = String(state.baseNote);
  els.octaveDownButton.disabled = state.baseNote - 12 < 0;
  els.octaveUpButton.disabled = state.baseNote + 12 > MAX_BASE_NOTE;
}

function setBaseNote(note) {
  const next = Number(note);
  if (!Number.isFinite(next) || next < 0 || next > MAX_BASE_NOTE) return;
  stopAllNotes();
  state.baseNote = next;
  updatePitchControls();
  buildGrid();
  buildPiano();
  updateVisualizers();
}

function shiftBoardOctave(semitones) {
  const next = state.baseNote + semitones;
  if (next >= 0 && next <= MAX_BASE_NOTE) setBaseNote(next);
}

function stopAllNotes() {
  for (const note of state.soundingCounts.keys()) sendNoteOff(note);
  state.soundingCounts.clear();
  state.activePointers.clear();
  document.querySelectorAll(".pad.active").forEach(pad => pad.classList.remove("active"));
  sendRaw([0xB0 | MIDI_CHANNEL, 123, 0]);
  updateVisualizers();
}

function buildGrid() {
  stopAllNotes();
  els.padGrid.replaceChildren();
  const columns = visibleColumns();
  document.documentElement.style.setProperty("--columns", String(columns));
  document.documentElement.style.setProperty("--rows", String(ROWS));

  if (state.mode === "fullBoard") {
    state.columnOffset = 0;
    document.body.classList.add("full-board");
  } else {
    state.columnOffset = Math.max(0, Math.min(TOTAL_COLUMNS - TRUE_SCALE_COLUMNS, state.columnOffset));
    document.body.classList.remove("full-board");
    setBundleSelecting(false);
  }

  for (let visualRow = 0; visualRow < ROWS; visualRow++) {
    const rowFromBottom = ROWS - 1 - visualRow;
    for (let visibleColumn = 0; visibleColumn < columns; visibleColumn++) {
      const absoluteColumn = state.mode === "fullBoard" ? visibleColumn : state.columnOffset + visibleColumn;
      const note = noteForCell(rowFromBottom, absoluteColumn);
      const key = cellKey(rowFromBottom, absoluteColumn);
      const pad = document.createElement("button");
      pad.type = "button";
      pad.className = "pad";
      if (!state.labels) pad.classList.add("labels-off");
      if (pitchClass(note) === 0) pad.classList.add("c-note");
      if (state.bundleCells.has(key)) pad.classList.add("bundled");
      pad.dataset.note = String(note);
      pad.dataset.row = String(rowFromBottom);
      pad.dataset.column = String(absoluteColumn);
      pad.dataset.cell = key;
      pad.setAttribute("aria-label", `${noteName(note)}, row ${rowFromBottom + 1}, column ${absoluteColumn + 1}`);

      const led = document.createElement("span");
      led.className = "led";
      const label = document.createElement("span");
      label.className = "note-label";
      label.textContent = noteName(note);
      pad.append(led, label);
      els.padGrid.appendChild(pad);
    }
  }

  updateModeControls();
  updateWindowReadout();
  updateBundleUI();
  requestAnimationFrame(measureSurface);
}

function updateModeControls() {
  const full = state.mode === "fullBoard";
  els.trueScaleModeButton.classList.toggle("selected", !full);
  els.fullBoardModeButton.classList.toggle("selected", full);
  els.trueScaleModeButton.setAttribute("aria-pressed", String(!full));
  els.fullBoardModeButton.setAttribute("aria-pressed", String(full));
}

function setMode(mode) {
  if (!["trueScale", "fullBoard"].includes(mode) || state.mode === mode) return;
  stopAllNotes();
  state.mode = mode;
  buildGrid();
  if (mode === "fullBoard") buildPiano();
  updateVisualizers();
}

function updateWindowReadout() {
  if (state.mode === "fullBoard") {
    els.windowStatus.textContent = "Full board • 25 × 8 • 200 pads";
    els.surfaceBadge.textContent = "25 × 8 • 200";
    els.previousColumnsButton.disabled = true;
    els.nextColumnsButton.disabled = true;
    return;
  }
  const start = state.columnOffset + 1;
  const end = state.columnOffset + TRUE_SCALE_COLUMNS;
  els.windowStatus.textContent = `Columns ${start}–${end} of ${TOTAL_COLUMNS}`;
  els.surfaceBadge.textContent = `${start}–${end} / ${TOTAL_COLUMNS}`;
  els.previousColumnsButton.disabled = state.columnOffset === 0;
  els.nextColumnsButton.disabled = state.columnOffset >= TOTAL_COLUMNS - TRUE_SCALE_COLUMNS;
}

function moveWindow(delta) {
  if (state.mode !== "trueScale") return;
  const next = Math.max(0, Math.min(TOTAL_COLUMNS - TRUE_SCALE_COLUMNS, state.columnOffset + delta));
  if (next === state.columnOffset) return;
  state.columnOffset = next;
  buildGrid();
}

function cssPixelsPerMm() {
  const screenW = Math.max(window.screen.width, window.screen.height);
  const screenH = Math.min(window.screen.width, window.screen.height);
  return ((screenW / IPAD_SCREEN_MM.width) + (screenH / IPAD_SCREEN_MM.height)) / 2;
}

function measureSurface() {
  const rect = els.boardArea.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const columns = visibleColumns();
  const availableWidth = Math.max(1, rect.width - 8);
  const availableHeight = Math.max(1, rect.height - 8);
  const pxPerMm = cssPixelsPerMm();
  let padPx;
  let gapPx;

  if (state.mode === "trueScale") {
    const idealPadPx = LINN_PAD_MM * pxPerMm;
    const idealGapPx = LINN_GAP_MM * pxPerMm;
    const idealWidth = columns * idealPadPx + (columns - 1) * idealGapPx;
    const idealHeight = ROWS * idealPadPx + (ROWS - 1) * idealGapPx;
    const fitScale = Math.min(1, availableWidth / idealWidth, availableHeight / idealHeight);
    padPx = idealPadPx * fitScale;
    gapPx = idealGapPx * fitScale;
  } else {
    const boardWidthMm = columns * LINN_PAD_MM + (columns - 1) * LINN_GAP_MM;
    const boardHeightMm = ROWS * LINN_PAD_MM + (ROWS - 1) * LINN_GAP_MM;
    const pxPerBoardMm = Math.min(availableWidth / boardWidthMm, availableHeight / boardHeightMm);
    padPx = LINN_PAD_MM * pxPerBoardMm;
    gapPx = LINN_GAP_MM * pxPerBoardMm;
  }

  document.documentElement.style.setProperty("--pad", `${padPx.toFixed(2)}px`);
  document.documentElement.style.setProperty("--gap", `${gapPx.toFixed(2)}px`);

  const zoom = window.visualViewport?.scale || 1;
  const actualPadMm = padPx * zoom / pxPerMm;
  const actualPitchMm = (padPx + gapPx) * zoom / pxPerMm;
  const percent = actualPadMm / LINN_PAD_MM * 100;
  els.scaleStatus.textContent = state.mode === "trueScale"
    ? `True scale • pad ≈ ${actualPadMm.toFixed(1)} mm • spacing ≈ ${actualPitchMm.toFixed(1)} mm • ${percent.toFixed(0)}%`
    : `Full 200 • pad ≈ ${actualPadMm.toFixed(1)} mm • spacing ≈ ${actualPitchMm.toFixed(1)} mm • ${percent.toFixed(0)}%`;
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
    for (const value of Object.values(collection)) if (value && typeof value === "object" && !ports.includes(value)) ports.push(value);
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
function sendRaw(bytes) { if (state.output && typeof state.output.send === "function") state.output.send(bytes); }
function sendNoteOn(note) { if (note >= 0 && note <= 127) sendRaw([0x90 | MIDI_CHANNEL, note & 0x7f, VELOCITY]); }
function sendNoteOff(note) { if (note >= 0 && note <= 127) sendRaw([0x80 | MIDI_CHANNEL, note & 0x7f, 0]); }

function incrementNote(note) {
  const count = state.soundingCounts.get(note) || 0;
  state.soundingCounts.set(note, count + 1);
  if (count === 0) sendNoteOn(note);
  updateVisualizers();
}
function decrementNote(note) {
  const count = state.soundingCounts.get(note) || 0;
  if (count <= 1) {
    state.soundingCounts.delete(note);
    sendNoteOff(note);
  } else state.soundingCounts.set(note, count - 1);
  updateVisualizers();
}

function padAtPoint(x, y) { return document.elementFromPoint(x, y)?.closest?.(".pad") || null; }
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

function bundlePitches() {
  const notes = [];
  for (const key of state.bundleCells) {
    const [row, column] = key.split(":").map(Number);
    notes.push(noteForCell(row, column));
  }
  return [...new Set(notes)].sort((a,b) => a-b);
}

function setBundleSelecting(enabled) {
  state.bundleSelecting = !!enabled && state.mode === "fullBoard";
  document.body.classList.toggle("bundle-selecting", state.bundleSelecting);
  els.bundleModeButton.textContent = state.bundleSelecting ? "Done Selecting" : "Bundle Select";
}

function toggleBundlePad(pad) {
  const key = pad.dataset.cell;
  if (!key) return;
  if (state.bundleCells.has(key)) state.bundleCells.delete(key);
  else state.bundleCells.add(key);
  pad.classList.toggle("bundled", state.bundleCells.has(key));
  updateBundleUI();
  updateVisualizers();
}

function updateBundleUI() {
  const pitches = bundlePitches();
  const padCount = state.bundleCells.size;
  const suffix = pitches.length === padCount ? `${padCount} pad${padCount === 1 ? "" : "s"} selected` : `${padCount} pads • ${pitches.length} unique pitches`;
  els.bundleStatus.textContent = suffix;
  els.playBundleButton.disabled = pitches.length === 0;
  els.clearBundleButton.disabled = padCount === 0;
  document.querySelectorAll(".pad").forEach(pad => pad.classList.toggle("bundled", state.bundleCells.has(pad.dataset.cell)));
}

function clearBundle() {
  state.bundleCells.clear();
  updateBundleUI();
  updateVisualizers();
}

function playBundle() {
  const pitches = bundlePitches();
  if (!pitches.length) return;
  if (state.bundleTimer) clearTimeout(state.bundleTimer);
  pitches.forEach(incrementNote);
  state.bundleTimer = setTimeout(() => {
    pitches.forEach(decrementNote);
    state.bundleTimer = null;
  }, 750);
}

function isBlackKey(note) { return [1,3,6,8,10].includes(pitchClass(note)); }
function buildPiano() {
  els.pianoKeyboard.replaceChildren();
  const boardMin = state.baseNote;
  const boardMax = maxBoardNote();
  let start = Math.max(0, Math.floor(boardMin / 12) * 12);
  let end = Math.min(127, Math.ceil((boardMax + 1) / 12) * 12);
  if (end <= start) end = Math.min(127, start + 12);

  const whiteNotes = [];
  for (let note = start; note <= end; note++) if (!isBlackKey(note)) whiteNotes.push(note);
  const whiteLayer = document.createElement("div");
  whiteLayer.className = "piano-white-layer";
  whiteNotes.forEach(note => {
    const key = document.createElement("div");
    key.className = "piano-key white";
    key.dataset.note = String(note);
    if (pitchClass(note) === 0) {
      const label = document.createElement("span");
      label.className = "piano-note-label";
      label.textContent = noteName(note);
      key.appendChild(label);
    }
    whiteLayer.appendChild(key);
  });
  els.pianoKeyboard.appendChild(whiteLayer);

  const totalWhites = whiteNotes.length;
  for (let note = start; note <= end; note++) {
    if (!isBlackKey(note)) continue;
    const whitesBefore = whiteNotes.filter(n => n < note).length;
    const key = document.createElement("div");
    key.className = "piano-key black";
    key.dataset.note = String(note);
    key.style.left = `${(whitesBefore / totalWhites) * 100}%`;
    key.style.width = `${(0.62 / totalWhites) * 100}%`;
    els.pianoKeyboard.appendChild(key);
  }
  updatePianoHighlights();
}

function soundingPitches() { return [...state.soundingCounts.keys()].sort((a,b) => a-b); }
function analysisPitches() {
  const sounding = soundingPitches();
  return sounding.length ? sounding : bundlePitches();
}

function updatePianoHighlights() {
  const active = new Set(soundingPitches());
  const bundled = new Set(bundlePitches());
  document.querySelectorAll(".piano-key").forEach(key => {
    const note = Number(key.dataset.note);
    key.classList.toggle("active", active.has(note));
    key.classList.toggle("bundle", bundled.has(note));
  });
}

function intervalName(semitones) {
  const names = ["P1","m2","M2","m3","M3","P4","TT","P5","m6","M6","m7","M7"];
  const compounds = ["P8","m9","M9","m10","M10","P11","A11/d12","P12","m13","M13","m14","M14"];
  if (semitones < 12) return names[semitones];
  if (semitones < 24) return compounds[semitones - 12];
  if (semitones === 24) return "P15";
  const octaves = Math.floor(semitones / 12);
  const remainder = semitones % 12;
  return `${names[remainder]} +${octaves} oct`;
}

function samePcSet(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function chordCandidates(pitches) {
  if (pitches.length < 2) return [];
  const bassPc = pitchClass(pitches[0]);
  const pcs = [...new Set(pitches.map(pitchClass))].sort((a,b) => a-b);
  const candidates = [];
  for (let root = 0; root < 12; root++) {
    const relative = pcs.map(pc => (pc - root + 12) % 12).sort((a,b) => a-b);
    for (const template of CHORD_TEMPLATES) {
      if (!samePcSet(relative, template.pcs)) continue;
      const slash = bassPc !== root ? `/${pitchClassName(bassPc)}` : "";
      candidates.push({
        root,
        display: `${pitchClassName(root)}${template.suffix}${slash}`,
        longName: `${pitchClassName(root)} ${template.name}${slash}`,
        formula: template.formula,
        score: template.priority + (root === bassPc ? 30 : 0),
      });
    }
  }
  return candidates.sort((a,b) => b.score - a.score || a.display.length - b.display.length);
}

function updateTheory() {
  const pitches = analysisPitches();
  if (!pitches.length) {
    els.pitchReadout.textContent = "—";
    els.chordReadout.textContent = "—";
    els.intervalReadout.textContent = "—";
    els.alternateReadout.textContent = "—";
    return;
  }

  els.pitchReadout.textContent = pitches.map(noteName).join("  ");
  const bass = pitches[0];
  els.intervalReadout.textContent = pitches.map(note => `${noteName(note)} ${intervalName(note - bass)}`).join(" · ");

  if (pitches.length === 1) {
    els.chordReadout.textContent = noteName(pitches[0]);
    els.alternateReadout.textContent = "single pitch";
    return;
  }

  const candidates = chordCandidates(pitches);
  if (candidates.length) {
    const primary = candidates[0];
    els.chordReadout.textContent = `${primary.display}  (${primary.formula})`;
    const alternates = candidates.slice(1, 5).map(candidate => candidate.display);
    els.alternateReadout.textContent = alternates.length ? alternates.join(" · ") : primary.longName;
  } else {
    const bassPc = pitchClass(bass);
    const formula = [...new Set(pitches.map(note => (pitchClass(note) - bassPc + 12) % 12))]
      .sort((a,b) => a-b)
      .map(semi => ["1","♭2","2","♭3","3","4","♭5","5","♭6","6","♭7","7"][semi])
      .join(" ");
    els.chordReadout.textContent = `${pitchClassName(bassPc)} pitch set`;
    els.alternateReadout.textContent = `from bass: ${formula}`;
  }
}

function updateVisualizers() {
  if (state.mode !== "fullBoard") return;
  updatePianoHighlights();
  updateTheory();
}

async function enterSurfaceMode() {
  document.body.classList.add("surface-mode");
  requestAnimationFrame(measureSurface);
  try {
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch (_) {}
}
async function exitSurfaceMode() {
  document.body.classList.remove("surface-mode");
  try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch (_) {}
  requestAnimationFrame(measureSurface);
}

els.enableMidiButton.addEventListener("click", enableMidi);
els.midiOutputSelect.addEventListener("change", event => selectOutput(event.target.value));
els.trueScaleModeButton.addEventListener("click", () => setMode("trueScale"));
els.fullBoardModeButton.addEventListener("click", () => setMode("fullBoard"));
els.baseNoteSelect.addEventListener("change", event => setBaseNote(event.target.value));
els.octaveDownButton.addEventListener("click", () => shiftBoardOctave(-12));
els.octaveUpButton.addEventListener("click", () => shiftBoardOctave(12));
els.labelsButton.addEventListener("click", toggleLabels);
els.fullScreenButton.addEventListener("click", enterSurfaceMode);
els.showControlsButton.addEventListener("click", exitSurfaceMode);
els.previousColumnsButton.addEventListener("click", () => moveWindow(-5));
els.nextColumnsButton.addEventListener("click", () => moveWindow(5));
els.bundleModeButton.addEventListener("click", () => {
  if (state.mode !== "fullBoard") setMode("fullBoard");
  setBundleSelecting(!state.bundleSelecting);
});
els.playBundleButton.addEventListener("click", playBundle);
els.clearBundleButton.addEventListener("click", clearBundle);

els.padGrid.addEventListener("pointerdown", event => {
  const pad = event.target.closest?.(".pad");
  if (!pad) return;
  event.preventDefault();
  if (state.bundleSelecting) {
    toggleBundlePad(pad);
    return;
  }
  try { els.padGrid.setPointerCapture(event.pointerId); } catch (_) {}
  pressPointer(event.pointerId, pad);
});

els.padGrid.addEventListener("pointermove", event => {
  if (state.bundleSelecting || !state.activePointers.has(event.pointerId)) return;
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
document.addEventListener("fullscreenchange", () => requestAnimationFrame(measureSurface));

populateBaseNotes();
buildGrid();
buildPiano();
updateTheory();
requestAnimationFrame(measureSurface);
