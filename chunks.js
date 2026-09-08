const chunkState = {
  chunks: [],
  activeChunkId: null,
  draftStart: 0,
  draftEnd: 0,
  loop: false,
};

const chunkEls = {
  slider: document.getElementById("timelineSlider"),
  readout: document.getElementById("timelineReadout"),
  markStart: document.getElementById("markStartButton"),
  markEnd: document.getElementById("markEndButton"),
  startReadout: document.getElementById("chunkStartReadout"),
  endReadout: document.getElementById("chunkEndReadout"),
  nameInput: document.getElementById("chunkNameInput"),
  saveButton: document.getElementById("saveChunkButton"),
  loopCheckbox: document.getElementById("loopChunkCheckbox"),
  wholeButton: document.getElementById("playWholeButton"),
  activeReadout: document.getElementById("activeChunkReadout"),
  list: document.getElementById("chunkList"),
};

function chunkBounds() {
  const active = chunkState.chunks.find(chunk => chunk.id === chunkState.activeChunkId);
  if (active) return { start: active.start, end: active.end };
  return { start: 0, end: state.teacherDuration };
}

function setTeacherPosition(position) {
  const next = Math.max(0, Math.min(Number(position) || 0, state.teacherDuration || 0));
  if (state.teacherPlaying) {
    state.teacherPosition = currentTeacherPosition();
    state.teacherPlaying = false;
    clearTeacherTimers();
    teacherAllNotesOff();
  }
  state.teacherPosition = next;
  els.playButton.disabled = state.teacherEvents.length === 0;
  els.pauseButton.disabled = true;
  els.stopButton.disabled = state.teacherEvents.length === 0;
  updateChunkTimeline();
  updateTransportStatus("Ready");
}

function updateChunkTimeline() {
  const duration = state.teacherDuration || 0;
  const position = currentTeacherPosition();
  chunkEls.slider.max = String(Math.max(duration, 0.01));
  chunkEls.slider.value = String(Math.min(position, duration));
  chunkEls.readout.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
  chunkEls.startReadout.textContent = `Start ${formatTime(chunkState.draftStart)}`;
  chunkEls.endReadout.textContent = `End ${formatTime(chunkState.draftEnd)}`;
}

function enableChunkEditor() {
  const enabled = state.teacherEvents.length > 0 && state.teacherDuration > 0;
  for (const element of [chunkEls.slider, chunkEls.markStart, chunkEls.markEnd, chunkEls.nameInput, chunkEls.saveButton, chunkEls.wholeButton]) {
    element.disabled = !enabled;
  }
  if (!enabled) return;

  chunkState.activeChunkId = null;
  chunkState.draftStart = 0;
  chunkState.draftEnd = state.teacherDuration;
  renderChunks();
  updateChunkTimeline();
}

function watchForMidiLoad() {
  const file = els.midiFileInput.files?.[0];
  if (!file) return;
  const startedAt = Date.now();
  const timer = setInterval(() => {
    if (state.teacherEvents.length > 0 && state.teacherDuration > 0) {
      clearInterval(timer);
      chunkState.chunks = [];
      enableChunkEditor();
      return;
    }
    if (Date.now() - startedAt > 10000) clearInterval(timer);
  }, 100);
}

function renderChunks() {
  chunkEls.list.replaceChildren();

  for (const chunk of chunkState.chunks) {
    const row = document.createElement("div");
    row.className = "chunk-item" + (chunk.id === chunkState.activeChunkId ? " selected" : "");

    const choose = document.createElement("button");
    choose.className = "chunk-select";
    choose.textContent = `${chunk.name}  ${formatTime(chunk.start)}–${formatTime(chunk.end)}`;
    choose.addEventListener("click", () => selectChunk(chunk.id));

    const remove = document.createElement("button");
    remove.className = "chunk-delete";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Delete ${chunk.name}`);
    remove.addEventListener("click", () => deleteChunk(chunk.id));

    row.append(choose, remove);
    chunkEls.list.appendChild(row);
  }
}

function selectChunk(id) {
  const chunk = chunkState.chunks.find(item => item.id === id);
  if (!chunk) return;
  stopTeacherPlayback(true);
  chunkState.activeChunkId = id;
  chunkState.draftStart = chunk.start;
  chunkState.draftEnd = chunk.end;
  state.teacherPosition = chunk.start;
  chunkEls.activeReadout.textContent = `Chunk: ${chunk.name}`;
  renderChunks();
  updateChunkTimeline();
  updateTransportStatus(`Selected ${chunk.name}`);
}

function selectWholeFile() {
  stopTeacherPlayback(true);
  chunkState.activeChunkId = null;
  chunkState.draftStart = 0;
  chunkState.draftEnd = state.teacherDuration;
  state.teacherPosition = 0;
  chunkEls.activeReadout.textContent = "Whole file";
  renderChunks();
  updateChunkTimeline();
  updateTransportStatus("Whole file selected");
}

function deleteChunk(id) {
  chunkState.chunks = chunkState.chunks.filter(chunk => chunk.id !== id);
  if (chunkState.activeChunkId === id) selectWholeFile();
  else renderChunks();
}

function saveDraftChunk() {
  const start = Math.max(0, Math.min(chunkState.draftStart, state.teacherDuration));
  const end = Math.max(0, Math.min(chunkState.draftEnd, state.teacherDuration));
  if (!(end > start)) {
    els.transportStatus.textContent = "Chunk end must be after chunk start";
    return;
  }

  const name = chunkEls.nameInput.value.trim() || `Chunk ${chunkState.chunks.length + 1}`;
  const chunk = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    start,
    end,
  };
  chunkState.chunks.push(chunk);
  chunkEls.nameInput.value = "";
  selectChunk(chunk.id);
}

const baseScheduleTeacherFrom = scheduleTeacherFrom;

scheduleTeacherFrom = function(position) {
  if (!state.output) {
    els.transportStatus.textContent = "Choose a MIDI output first";
    return;
  }
  if (!state.teacherEvents.length) return;

  const bounds = chunkBounds();
  let startPosition = Math.max(bounds.start, Math.min(position, bounds.end));
  if (startPosition >= bounds.end) startPosition = bounds.start;

  clearTeacherTimers();
  teacherAllNotesOff();
  state.teacherPosition = startPosition;
  state.teacherStartedAt = performance.now();
  state.teacherPlaying = true;
  els.playButton.disabled = true;
  els.pauseButton.disabled = false;
  els.stopButton.disabled = false;
  updateTransportStatus(chunkState.activeChunkId ? "Playing chunk" : "Playing teacher");

  for (const event of state.teacherEvents) {
    if (event.time < startPosition || event.time >= bounds.end) continue;
    const delay = Math.max(0, ((event.time - startPosition) / state.speed) * 1000);
    const timer = setTimeout(() => {
      if (!state.teacherPlaying) return;
      sendRaw(teacherBytesForEvent(event));
      updateChunkTimeline();
    }, delay);
    state.teacherTimers.push(timer);
  }

  const remaining = Math.max(0, bounds.end - startPosition);
  state.teacherEndTimer = setTimeout(() => {
    teacherAllNotesOff();
    state.teacherPlaying = false;
    clearTeacherTimers();

    if (chunkState.loop && chunkState.activeChunkId != null) {
      state.teacherPosition = bounds.start;
      scheduleTeacherFrom(bounds.start);
      return;
    }

    state.teacherPosition = bounds.start;
    els.playButton.disabled = false;
    els.pauseButton.disabled = true;
    els.stopButton.disabled = true;
    updateChunkTimeline();
    updateTransportStatus(chunkState.activeChunkId ? "Chunk finished" : "Finished");
  }, (remaining / state.speed) * 1000 + 60);
};

const baseUpdateTransportStatus = updateTransportStatus;
updateTransportStatus = function(prefix = "") {
  const position = currentTeacherPosition();
  const bounds = chunkBounds();
  const timeText = chunkState.activeChunkId
    ? `${formatTime(position)} / ${formatTime(bounds.end)}`
    : `${formatTime(position)} / ${formatTime(state.teacherDuration)}`;
  els.transportStatus.textContent = prefix ? `${prefix} — ${timeText}` : timeText;
  updateChunkTimeline();
};

chunkEls.slider.addEventListener("input", event => {
  setTeacherPosition(Number(event.target.value));
});

chunkEls.markStart.addEventListener("click", () => {
  chunkState.draftStart = currentTeacherPosition();
  if (chunkState.draftEnd <= chunkState.draftStart) chunkState.draftEnd = state.teacherDuration;
  updateChunkTimeline();
});

chunkEls.markEnd.addEventListener("click", () => {
  chunkState.draftEnd = currentTeacherPosition();
  updateChunkTimeline();
});

chunkEls.saveButton.addEventListener("click", saveDraftChunk);
chunkEls.wholeButton.addEventListener("click", selectWholeFile);
chunkEls.loopCheckbox.addEventListener("change", event => {
  chunkState.loop = event.target.checked;
});
els.midiFileInput.addEventListener("change", watchForMidiLoad);

const timelineTimer = setInterval(() => {
  if (state.teacherPlaying) updateChunkTimeline();
}, 100);

window.addEventListener("beforeunload", () => clearInterval(timelineTimer));
