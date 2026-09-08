const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

const state = {
  midiAccess: null,
  output: null,
  baseNote: 21,
  rows: 8,
  columns: 13,
  horizontalInterval: 1,
  verticalInterval: 5,
  studentChannel: 0,
  teacherChannel: 1,
  velocity: 100,
  activePointers: new Map(),
  soundingCounts: new Map(),

  teacherEvents: [],
  teacherDuration: 0,
  teacherPosition: 0,
  teacherPlaying: false,
  teacherStartedAt: 0,
  teacherTimers: [],
  teacherEndTimer: null,
  speed: 1,
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

  midiFileInput: document.getElementById("midiFileInput"),
  fileName: document.getElementById("fileName"),
  playButton: document.getElementById("playButton"),
  pauseButton: document.getElementById("pauseButton"),
  stopButton: document.getElementById("stopButton"),
  speedSelect: document.getElementById("speedSelect"),
  transportStatus: document.getElementById("transportStatus"),
};

function midiNoteName(note) {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${octave}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
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
  stopStudentNotes();
  els.padGrid.replaceChildren();

  els.padGrid.style.gridTemplateColumns = `repeat(${state.columns}, 1fr)`;
  els.padGrid.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;

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

function midiPortsToArray(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection.filter(Boolean);

  const ports = [];

  if (typeof collection.forEach === "function") {
    try {
      collection.forEach(port => {
        if (port && !ports.includes(port)) ports.push(port);
      });
      if (ports.length > 0 || collection.size === 0) return ports;
    } catch (error) {
      console.warn("MIDI port forEach enumeration failed", error);
    }
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
      if (Array.isArray(values)) return values.filter(Boolean);
      if (values && typeof values.length === "number") {
        for (let i = 0; i < values.length; i++) if (values[i]) ports.push(values[i]);
        return ports;
      }
    } catch (error) {
      console.warn("MIDI port values enumeration failed", error);
    }
  }

  if (typeof collection.length === "number") {
    for (let i = 0; i < collection.length; i++) if (collection[i]) ports.push(collection[i]);
    return ports;
  }

  if (typeof collection === "object") {
    for (const key of Object.keys(collection)) {
      const value = collection[key];
      if (value && typeof value === "object" && !ports.includes(value)) ports.push(value);
    }
  }

  return ports;
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
    els.enableMidiButton.textContent = "MIDI Enabled";
  } catch (error) {
    console.error(error);
    els.midiStatus.textContent = `MIDI setup failed: ${error.message || error}`;
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

  const outputs = midiPortsToArray(state.midiAccess.outputs);

  for (const output of outputs) {
    const option = document.createElement("option");
    option.value = String(output.id ?? output.name ?? "");
    option.textContent = output.name || output.manufacturer || output.id || "MIDI output";
    els.midiOutputSelect.appendChild(option);
  }

  els.midiOutputSelect.disabled = outputs.length === 0;

  const preferred = outputs.find(o => String(o.id ?? o.name ?? "") === String(previousId)) || outputs[0] || null;
  state.output = preferred;
  els.midiOutputSelect.value = preferred ? String(preferred.id ?? preferred.name ?? "") : "";

  els.midiStatus.textContent = preferred
    ? `MIDI out: ${preferred.name || preferred.manufacturer || "selected output"}`
    : "MIDI enabled, but no outputs were found";
}

function setOutputById(id) {
  stopTeacherPlayback(false);
  stopStudentNotes();
  const outputs = midiPortsToArray(state.midiAccess?.outputs);
  state.output = outputs.find(output => String(output.id ?? output.name ?? "") === String(id)) || null;
  els.midiStatus.textContent = state.output
    ? `MIDI out: ${state.output.name || state.output.manufacturer || "selected output"}`
    : "No MIDI output selected";
}

function sendRaw(bytes) {
  if (!state.output || typeof state.output.send !== "function") return;
  state.output.send(bytes);
}

function sendNoteOn(note, channel = state.studentChannel, velocity = state.velocity) {
  if (note < 0 || note > 127) return;
  sendRaw([0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f]);
}

function sendNoteOff(note, channel = state.studentChannel) {
  if (note < 0 || note > 127) return;
  sendRaw([0x80 | (channel & 0x0f), note & 0x7f, 0]);
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

function stopStudentNotes() {
  for (const note of state.soundingCounts.keys()) sendNoteOff(note);
  state.soundingCounts.clear();
  state.activePointers.clear();
  document.querySelectorAll(".pad.active").forEach(p => p.classList.remove("active"));
  sendRaw([0xB0 | state.studentChannel, 123, 0]);
}

function teacherAllNotesOff() {
  sendRaw([0xB0 | state.teacherChannel, 64, 0]);
  sendRaw([0xB0 | state.teacherChannel, 123, 0]);
}

function stopAllNotes() {
  stopStudentNotes();
  teacherAllNotesOff();
}

function readU32(view, offset) {
  return view.getUint32(offset, false);
}

function readU16(view, offset) {
  return view.getUint16(offset, false);
}

function readVarLen(bytes, cursor) {
  let value = 0;
  let count = 0;
  while (cursor.pos < bytes.length && count < 4) {
    const b = bytes[cursor.pos++];
    value = (value << 7) | (b & 0x7f);
    count++;
    if ((b & 0x80) === 0) return value;
  }
  throw new Error("Invalid MIDI variable-length value");
}

function parseMidiFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0, 4)) !== "MThd") {
    throw new Error("Not a Standard MIDI File");
  }

  const headerLength = readU32(view, 4);
  const format = readU16(view, 8);
  const trackCount = readU16(view, 10);
  const division = readU16(view, 12);

  if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported yet");
  if (![0, 1, 2].includes(format)) throw new Error(`Unsupported MIDI format ${format}`);

  const ticksPerQuarter = division;
  let offset = 8 + headerLength;
  const channelEvents = [];
  const tempoEvents = [{ tick: 0, microsPerQuarter: 500000 }];
  let finalTick = 0;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (offset + 8 > bytes.length || String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") {
      throw new Error(`Missing MIDI track ${trackIndex + 1}`);
    }

    const trackLength = readU32(view, offset + 4);
    const trackEnd = offset + 8 + trackLength;
    const cursor = { pos: offset + 8 };
    let tick = 0;
    let runningStatus = null;

    while (cursor.pos < trackEnd) {
      tick += readVarLen(bytes, cursor);
      finalTick = Math.max(finalTick, tick);

      let status = bytes[cursor.pos++];
      if (status < 0x80) {
        if (runningStatus == null) throw new Error("Invalid running status in MIDI track");
        cursor.pos--;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        runningStatus = null;
        const metaType = bytes[cursor.pos++];
        const len = readVarLen(bytes, cursor);
        if (metaType === 0x51 && len === 3) {
          const tempo = (bytes[cursor.pos] << 16) | (bytes[cursor.pos + 1] << 8) | bytes[cursor.pos + 2];
          tempoEvents.push({ tick, microsPerQuarter: tempo });
        }
        cursor.pos += len;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        runningStatus = null;
        const len = readVarLen(bytes, cursor);
        cursor.pos += len;
        continue;
      }

      const type = status & 0xf0;
      const originalChannel = status & 0x0f;
      let data1;
      let data2;

      switch (type) {
        case 0x80:
        case 0x90:
        case 0xa0:
        case 0xb0:
        case 0xe0:
          data1 = bytes[cursor.pos++];
          data2 = bytes[cursor.pos++];
          channelEvents.push({ tick, type, originalChannel, data1, data2 });
          break;
        case 0xc0:
        case 0xd0:
          data1 = bytes[cursor.pos++];
          channelEvents.push({ tick, type, originalChannel, data1, data2: null });
          break;
        default:
          throw new Error(`Unsupported MIDI status 0x${status.toString(16)}`);
      }
    }

    offset = trackEnd;
  }

  tempoEvents.sort((a, b) => a.tick - b.tick);
  const dedupedTempos = [];
  for (const tempo of tempoEvents) {
    if (dedupedTempos.length && dedupedTempos[dedupedTempos.length - 1].tick === tempo.tick) {
      dedupedTempos[dedupedTempos.length - 1] = tempo;
    } else {
      dedupedTempos.push(tempo);
    }
  }

  function ticksToSeconds(targetTick) {
    let seconds = 0;
    let previousTick = 0;
    let microsPerQuarter = 500000;

    for (const tempo of dedupedTempos) {
      if (tempo.tick > targetTick) break;
      if (tempo.tick > previousTick) {
        seconds += ((tempo.tick - previousTick) * microsPerQuarter) / ticksPerQuarter / 1000000;
      }
      previousTick = tempo.tick;
      microsPerQuarter = tempo.microsPerQuarter;
    }

    if (targetTick > previousTick) {
      seconds += ((targetTick - previousTick) * microsPerQuarter) / ticksPerQuarter / 1000000;
    }
    return seconds;
  }

  channelEvents.sort((a, b) => a.tick - b.tick);
  const events = channelEvents.map(event => ({ ...event, time: ticksToSeconds(event.tick) }));
  return {
    events,
    duration: ticksToSeconds(finalTick),
    format,
    trackCount,
    ticksPerQuarter,
  };
}

function teacherBytesForEvent(event) {
  const status = event.type | state.teacherChannel;
  if (event.data2 == null) return [status, event.data1 & 0x7f];
  return [status, event.data1 & 0x7f, event.data2 & 0x7f];
}

function clearTeacherTimers() {
  for (const timer of state.teacherTimers) clearTimeout(timer);
  state.teacherTimers = [];
  if (state.teacherEndTimer != null) clearTimeout(state.teacherEndTimer);
  state.teacherEndTimer = null;
}

function currentTeacherPosition() {
  if (!state.teacherPlaying) return state.teacherPosition;
  return Math.min(
    state.teacherDuration,
    state.teacherPosition + ((performance.now() - state.teacherStartedAt) / 1000) * state.speed
  );
}

function updateTransportStatus(prefix = "") {
  const pos = currentTeacherPosition();
  const timeText = `${formatTime(pos)} / ${formatTime(state.teacherDuration)}`;
  els.transportStatus.textContent = prefix ? `${prefix} — ${timeText}` : timeText;
}

function scheduleTeacherFrom(position) {
  if (!state.output) {
    els.transportStatus.textContent = "Choose a MIDI output first";
    return;
  }
  if (!state.teacherEvents.length) return;

  clearTeacherTimers();
  state.teacherPosition = Math.max(0, Math.min(position, state.teacherDuration));
  state.teacherStartedAt = performance.now();
  state.teacherPlaying = true;
  els.playButton.disabled = true;
  els.pauseButton.disabled = false;
  els.stopButton.disabled = false;
  updateTransportStatus("Playing teacher");

  for (const event of state.teacherEvents) {
    if (event.time < state.teacherPosition) continue;
    const delay = Math.max(0, ((event.time - state.teacherPosition) / state.speed) * 1000);
    const timer = setTimeout(() => {
      if (!state.teacherPlaying) return;
      sendRaw(teacherBytesForEvent(event));
      updateTransportStatus("Playing teacher");
    }, delay);
    state.teacherTimers.push(timer);
  }

  const remaining = Math.max(0, state.teacherDuration - state.teacherPosition);
  state.teacherEndTimer = setTimeout(() => {
    teacherAllNotesOff();
    state.teacherPlaying = false;
    state.teacherPosition = 0;
    clearTeacherTimers();
    els.playButton.disabled = false;
    els.pauseButton.disabled = true;
    els.stopButton.disabled = true;
    updateTransportStatus("Finished");
  }, (remaining / state.speed) * 1000 + 60);
}

function playTeacher() {
  if (!state.teacherEvents.length) return;
  scheduleTeacherFrom(state.teacherPosition >= state.teacherDuration ? 0 : state.teacherPosition);
}

function pauseTeacher() {
  if (!state.teacherPlaying) return;
  state.teacherPosition = currentTeacherPosition();
  state.teacherPlaying = false;
  clearTeacherTimers();
  teacherAllNotesOff();
  els.playButton.disabled = false;
  els.pauseButton.disabled = true;
  els.stopButton.disabled = false;
  updateTransportStatus("Paused");
}

function stopTeacherPlayback(resetPosition = true) {
  if (state.teacherPlaying) state.teacherPosition = currentTeacherPosition();
  state.teacherPlaying = false;
  clearTeacherTimers();
  teacherAllNotesOff();
  if (resetPosition) state.teacherPosition = 0;
  els.playButton.disabled = state.teacherEvents.length === 0;
  els.pauseButton.disabled = true;
  els.stopButton.disabled = true;
  updateTransportStatus(resetPosition ? "Stopped" : "Teacher halted");
}

async function loadMidiFile(file) {
  if (!file) return;
  stopTeacherPlayback(true);
  els.fileName.textContent = `Loading ${file.name}…`;
  els.transportStatus.textContent = "Reading MIDI locally…";

  try {
    const buffer = await file.arrayBuffer();
    const parsed = parseMidiFile(buffer);
    state.teacherEvents = parsed.events;
    state.teacherDuration = parsed.duration;
    state.teacherPosition = 0;
    els.fileName.textContent = file.name;
    els.playButton.disabled = parsed.events.length === 0;
    els.pauseButton.disabled = true;
    els.stopButton.disabled = true;
    els.transportStatus.textContent = `${parsed.trackCount} track${parsed.trackCount === 1 ? "" : "s"} • ${parsed.events.length} MIDI events • ${formatTime(parsed.duration)} • teacher ch 2`;
  } catch (error) {
    console.error(error);
    state.teacherEvents = [];
    state.teacherDuration = 0;
    state.teacherPosition = 0;
    els.fileName.textContent = "Could not load MIDI";
    els.transportStatus.textContent = error.message || String(error);
    els.playButton.disabled = true;
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
els.panicButton.addEventListener("click", () => {
  stopTeacherPlayback(true);
  stopAllNotes();
});

els.midiFileInput.addEventListener("change", event => loadMidiFile(event.target.files?.[0]));
els.playButton.addEventListener("click", playTeacher);
els.pauseButton.addEventListener("click", pauseTeacher);
els.stopButton.addEventListener("click", () => stopTeacherPlayback(true));
els.speedSelect.addEventListener("change", event => {
  const wasPlaying = state.teacherPlaying;
  const position = currentTeacherPosition();
  if (wasPlaying) {
    state.teacherPosition = position;
    state.teacherPlaying = false;
    clearTeacherTimers();
    teacherAllNotesOff();
  }
  state.speed = Number(event.target.value) || 1;
  if (wasPlaying) scheduleTeacherFrom(position);
  else updateTransportStatus("Speed changed");
});

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
window.addEventListener("blur", stopStudentNotes);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopStudentNotes();
});

populateBaseNotes();
buildGrid();
