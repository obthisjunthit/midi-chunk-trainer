const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const state = {
  midiAccess: null,
  output: null,
  baseNote: 21, // A0
  rows: 8,
  columns: 13,
  horizontalInterval: 1,
  verticalInterval: 5,
  studentChannel: 0, // MIDI channel 1, zero-based
  teacherChannel: 1, // MIDI channel 2, zero-based
  velocity: 100,
  activePointers: new Map(),
  soundingCounts: new Map(),
};

const els = {
  enableMidiButton: document.getElementById("enableMidiButton"),
  midiOutputSelect: document.getElementById("midiOutputSelect"),
  baseNoteSelect: document.getElementById("baseNoteSelect"),
  rowsInput: document.getElementById("rowsInput"),
  columnsInput: document.getElementById("columnsInput"),
  horizontalIntervalInput: document.getElementById("horizontalIntervalInput"),
  verticalIntervalInput: document.getElementById("verticalIntervalInput"),
  panicButton: document.getElementById("panicButton"),
  midiStatus: document.getElementById("midiStatus"),
  gridViewport: document.getElementById("gridViewport"),
  padGrid: document.getElementById("padGrid"),
};

function midiNoteName(note) {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

function populateBaseNotes() {
  for (let note = 21; note <= 108; note++) {
    const option = document.createElement("option");
    option.value = String(note);
    option.textContent = `${midiNoteName(note)} (${note})`;
    if (note === state.baseNote) option.selected = true;
    els.baseNoteSelect.appendChild(option);
  }
}

function noteForCell(rowFromBottom, column) {
  return state.baseNote
    + column * state.horizontalInterval
    + rowFromBottom * state.verticalInterval;
}

function isNaturalPitchClass(pc) {
  return [0, 2, 4, 5, 7, 9, 11].includes(pc);
}

function buildGrid() {
  stopAllNotes();
  els.padGrid.replaceChildren();

  els.padGrid.style.gridTemplateColumns = `repeat(${state.columns}, 1fr)`;
  els.padGrid.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

  // DOM rows run top to bottom; musical rows run bottom to top.
  for (let visualRow = 0; visualRow < state.rows; visualRow++) {
    const rowFromBottom = state.rows - 1 - visualRow;

    for (let column = 0; column < state.columns; column++) {
      const note = noteForCell(rowFromBottom, column);
      const pad = document.createElement("div");
      pad.className = "pad";
      pad.dataset.note = String(note);
      pad.dataset.row = String(rowFromBottom);
      pad.dataset.column = String(column);

      if (note >= 0 && note <= 127) {
        const pc = ((note % 12) + 12) % 12;
        if (isNaturalPitchClass(pc)) pad.classList.add("natural");
        if (pc === 0) pad.classList.add("c-note");
        pad.innerHTML = `<span>${midiNoteName(note)}</span><span class="coord">${rowFromBottom + 1},${column + 1}</span>`;
      } else {
        pad.classList.add("out-of-range");
        pad.textContent = "—";
      }

      els.padGrid.appendChild(pad);
    }
  }

  fitSquarePads();
}

function fitSquarePads() {
  const rect = els.gridViewport.getBoundingClientRect();
  const gap = 2;
  const availableWidth = Math.max(0, rect.width - 16 - gap * (state.columns - 1));
  const availableHeight = Math.max(0, rect.height - 16 - gap * (state.rows - 1));
  const size = Math.floor(Math.min(availableWidth / state.columns, availableHeight / state.rows));

  if (size <= 0) return;

  const width = size * state.columns + gap * (state.columns - 1);
  const height = size * state.rows + gap * (state.rows - 1);

  els.padGrid.style.width = `${width}px`;
  els.padGrid.style.height = `${height}px`;
  els.padGrid.style.gridTemplateColumns = `repeat(${state.columns}, ${size}px)`;
  els.padGrid.style.gridTemplateRows = `repeat(${state.rows}, ${size}px)`;
  els.padGrid.style.margin = "auto";
}

async function enableMidi() {
  if (!navigator.requestMIDIAccess) {
    els.midiStatus.textContent = "This browser does not expose Web MIDI.";
    return;
  }

  try {
    state.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    state.midiAccess.onstatechange = refreshMidiOutputs;
    refreshMidiOutputs();
    els.midiStatus.textContent = "MIDI enabled — choose an output";
    els.enableMidiButton.textContent = "MIDI Enabled";
  } catch (error) {
    console.error(error);
    els.midiStatus.textContent = `MIDI permission failed: ${error.message || error}`;
  }
}

function refreshMidiOutputs() {
  const previousId = state.output?.id || els.midiOutputSelect.value;
  els.midiOutputSelect.replaceChildren();

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No output";
  els.midiOutputSelect.appendChild(none);

  if (!state.midiAccess) {
    els.midiOutputSelect.disabled = true;
    return;
  }

  const outputs = [...state.midiAccess.outputs.values()];
  for (const output of outputs) {
    const option = document.createElement("option");
    option.value = output.id;
    option.textContent = output.name || output.manufacturer || output.id;
    els.midiOutputSelect.appendChild(option);
  }

  els.midiOutputSelect.disabled = outputs.length === 0;

  const preferred = outputs.find(o => o.id === previousId) || outputs[0] || null;
  state.output = preferred;
  els.midiOutputSelect.value = preferred?.id || "";

  if (preferred) {
    els.midiStatus.textContent = `MIDI out: ${preferred.name || "selected output"}`;
  } else {
    els.midiStatus.textContent = "MIDI enabled, but no outputs were found";
  }
}

function setOutputById(id) {
  state.output = state.midiAccess?.outputs.get(id) || null;
  els.midiStatus.textContent = state.output
    ? `MIDI out: ${state.output.name || "selected output"}`
    : "No MIDI output selected";
}

function sendNoteOn(note, channel = state.studentChannel, velocity = state.velocity) {
  if (!state.output || note < 0 || note > 127) return;
  state.output.send([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]);
}

function sendNoteOff(note, channel = state.studentChannel) {
  if (!state.output || note < 0 || note > 127) return;
  state.output.send([0x80 | (channel & 0x0f), note & 0x7f, 0]);
}

function incrementSounding(note) {
  const count = state.soundingCounts.get(note) || 0;
  state.soundingCounts.set(note, count + 1);
  if (count === 0) sendNoteOn(note);
}

function decrementSounding(note) {
  const count = state.soundingCounts.get(note) || 0;
  if (count <= 1) {
    state.soundingCounts.delete(note);
    sendNoteOff(note);
  } else {
    state.soundingCounts.set(note, count - 1);
  }
}

function padFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  return el?.closest?.(".pad") || null;
}

function pressPad(pointerId, pad) {
  if (!pad || pad.classList.contains("out-of-range")) return;

  const previous = state.activePointers.get(pointerId);
  if (previous?.pad === pad) return;
  if (previous) releasePointer(pointerId);

  const note = Number(pad.dataset.note);
  state.activePointers.set(pointerId, { pad, note });
  pad.classList.add("active");
  incrementSounding(note);
}

function releasePointer(pointerId) {
  const active = state.activePointers.get(pointerId);
  if (!active) return;

  active.pad.classList.remove("active");
  decrementSounding(active.note);
  state.activePointers.delete(pointerId);
}

function stopAllNotes() {
  for (const note of state.soundingCounts.keys()) sendNoteOff(note);
  state.soundingCounts.clear();
  state.activePointers.clear();
  document.querySelectorAll(".pad.active").forEach(p => p.classList.remove("active"));

  // CC 123 = All Notes Off, sent to student and teacher channels.
  if (state.output) {
    state.output.send([0xB0 | state.studentChannel, 123, 0]);
    state.output.send([0xB0 | state.teacherChannel, 123, 0]);
  }
}

els.padGrid.addEventListener("pointerdown", event => {
  event.preventDefault();
  els.padGrid.setPointerCapture?.(event.pointerId);
  pressPad(event.pointerId, padFromPoint(event.clientX, event.clientY));
});

els.padGrid.addEventListener("pointermove", event => {
  if (!state.activePointers.has(event.pointerId)) return;
  event.preventDefault();
  pressPad(event.pointerId, padFromPoint(event.clientX, event.clientY));
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  els.padGrid.addEventListener(eventName, event => releasePointer(event.pointerId));
}

els.enableMidiButton.addEventListener("click", enableMidi);
els.midiOutputSelect.addEventListener("change", event => setOutputById(event.target.value));
els.panicButton.addEventListener("click", stopAllNotes);

els.baseNoteSelect.addEventListener("change", event => {
  state.baseNote = Number(event.target.value);
  buildGrid();
});

els.rowsInput.addEventListener("change", event => {
  state.rows = Math.max(1, Math.min(16, Number(event.target.value) || 8));
  event.target.value = state.rows;
  buildGrid();
});

els.columnsInput.addEventListener("change", event => {
  state.columns = Math.max(1, Math.min(32, Number(event.target.value) || 13));
  event.target.value = state.columns;
  buildGrid();
});

els.horizontalIntervalInput.addEventListener("change", event => {
  state.horizontalInterval = Math.max(-24, Math.min(24, Number(event.target.value) || 0));
  event.target.value = state.horizontalInterval;
  buildGrid();
});

els.verticalIntervalInput.addEventListener("change", event => {
  state.verticalInterval = Math.max(-24, Math.min(24, Number(event.target.value) || 0));
  event.target.value = state.verticalInterval;
  buildGrid();
});

window.addEventListener("resize", fitSquarePads);
window.addEventListener("blur", stopAllNotes);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAllNotes();
});

populateBaseNotes();
buildGrid();
