const fingeringState = {
  enabled: false,
  steps: [],
  stepIndex: 0,
  selectedSlot: 0,
  assignmentsByChunk: new Map(),
};

const fingeringEls = {
  modeButton: document.getElementById("fingeringModeButton"),
  previousButton: document.getElementById("previousStepButton"),
  nextButton: document.getElementById("nextStepButton"),
  stepReadout: document.getElementById("stepReadout"),
  notes: document.getElementById("fingeringNotes"),
  clearButton: document.getElementById("clearStepButton"),
  status: document.getElementById("fingeringStatus"),
};

function activeFingeringChunk() {
  return chunkState.chunks.find(chunk => chunk.id === chunkState.activeChunkId) || null;
}

function buildFingeringSteps() {
  const chunk = activeFingeringChunk();
  fingeringState.steps = [];
  fingeringState.stepIndex = 0;
  fingeringState.selectedSlot = 0;

  if (!chunk) return;

  const noteOns = state.teacherEvents.filter(event =>
    event.type === 0x90 &&
    event.data2 > 0 &&
    event.time >= chunk.start &&
    event.time < chunk.end
  );

  const tolerance = 0.003;
  for (const event of noteOns) {
    let step = fingeringState.steps[fingeringState.steps.length - 1];
    if (!step || Math.abs(event.time - step.time) > tolerance) {
      step = { time: event.time, notes: [] };
      fingeringState.steps.push(step);
    }
    step.notes.push({ note: event.data1, originalChannel: event.originalChannel });
  }

  if (!fingeringState.assignmentsByChunk.has(chunk.id)) {
    fingeringState.assignmentsByChunk.set(chunk.id, []);
  }
}

function assignmentsForCurrentChunk() {
  const chunk = activeFingeringChunk();
  if (!chunk) return [];
  if (!fingeringState.assignmentsByChunk.has(chunk.id)) {
    fingeringState.assignmentsByChunk.set(chunk.id, []);
  }
  return fingeringState.assignmentsByChunk.get(chunk.id);
}

function assignmentsForStep(stepIndex = fingeringState.stepIndex) {
  const all = assignmentsForCurrentChunk();
  if (!all[stepIndex]) all[stepIndex] = [];
  return all[stepIndex];
}

function currentStep() {
  return fingeringState.steps[fingeringState.stepIndex] || null;
}

function nextUnassignedSlot() {
  const step = currentStep();
  if (!step) return 0;
  const assignments = assignmentsForStep();
  const index = step.notes.findIndex((_, i) => !assignments[i]);
  return index >= 0 ? index : Math.min(fingeringState.selectedSlot, Math.max(0, step.notes.length - 1));
}

function clearPadGuideClasses() {
  document.querySelectorAll(".pad.fingering-candidate, .pad.fingering-assigned, .pad.fingering-selected")
    .forEach(pad => pad.classList.remove("fingering-candidate", "fingering-assigned", "fingering-selected"));
}

function padAt(row, column) {
  return document.querySelector(`.pad[data-row="${row}"][data-column="${column}"]`);
}

function renderFingeringGuide() {
  clearPadGuideClasses();
  fingeringEls.notes.replaceChildren();

  const chunk = activeFingeringChunk();
  const step = currentStep();
  const hasChunk = !!chunk;
  const hasSteps = fingeringState.steps.length > 0;

  fingeringEls.modeButton.disabled = !hasChunk || !hasSteps;
  fingeringEls.previousButton.disabled = !hasSteps || fingeringState.stepIndex <= 0;
  fingeringEls.nextButton.disabled = !hasSteps || fingeringState.stepIndex >= fingeringState.steps.length - 1;
  fingeringEls.clearButton.disabled = !hasSteps;

  if (!hasChunk) {
    fingeringEls.stepReadout.textContent = "Select a chunk";
    fingeringEls.status.textContent = "Choose a saved chunk to assign exact pad locations.";
    fingeringEls.modeButton.textContent = "Assign Pads";
    return;
  }

  if (!hasSteps || !step) {
    fingeringEls.stepReadout.textContent = "No note events";
    fingeringEls.status.textContent = "This chunk contains no MIDI note-on events.";
    fingeringEls.modeButton.textContent = "Assign Pads";
    return;
  }

  const assignments = assignmentsForStep();
  fingeringState.selectedSlot = Math.max(0, Math.min(fingeringState.selectedSlot, step.notes.length - 1));

  fingeringEls.stepReadout.textContent = `Step ${fingeringState.stepIndex + 1}/${fingeringState.steps.length} • ${formatTime(step.time)}`;
  fingeringEls.modeButton.textContent = fingeringState.enabled ? "Done Assigning" : "Assign Pads";

  step.notes.forEach((noteEvent, index) => {
    const chip = document.createElement("button");
    const assignment = assignments[index];
    chip.className = "fingering-note";
    if (assignment) chip.classList.add("assigned");
    if (index === fingeringState.selectedSlot) chip.classList.add("selected");
    chip.textContent = assignment
      ? `${midiNoteName(noteEvent.note)} → R${assignment.row + 1} C${assignment.column + 1}`
      : midiNoteName(noteEvent.note);
    chip.addEventListener("click", () => {
      fingeringState.selectedSlot = index;
      renderFingeringGuide();
    });
    fingeringEls.notes.appendChild(chip);
  });

  let assignedCount = 0;
  assignments.forEach(assignment => {
    if (!assignment) return;
    assignedCount++;
    const pad = padAt(assignment.row, assignment.column);
    if (pad) pad.classList.add("fingering-assigned");
  });

  const selectedEvent = step.notes[fingeringState.selectedSlot];
  const selectedAssignment = assignments[fingeringState.selectedSlot];

  if (fingeringState.enabled && selectedEvent) {
    const candidates = Array.from(document.querySelectorAll(`.pad[data-note="${selectedEvent.note}"]`));
    candidates.forEach(pad => pad.classList.add("fingering-candidate"));
    if (selectedAssignment) {
      const selectedPad = padAt(selectedAssignment.row, selectedAssignment.column);
      if (selectedPad) selectedPad.classList.add("fingering-selected");
    }

    if (candidates.length === 0) {
      fingeringEls.status.textContent = `${midiNoteName(selectedEvent.note)} has no visible pad in the current grid. Change Base/Rows/Columns if needed.`;
    } else {
      fingeringEls.status.textContent = `Tap the exact ${midiNoteName(selectedEvent.note)} pad you want. ${assignedCount}/${step.notes.length} notes assigned in this step.`;
    }
  } else {
    fingeringEls.status.textContent = `${assignedCount}/${step.notes.length} notes assigned in this step. Tap Assign Pads to edit.`;
  }
}

function assignPadToSelectedSlot(pad) {
  if (!fingeringState.enabled || !pad) return false;
  const step = currentStep();
  if (!step) return false;

  const slot = fingeringState.selectedSlot;
  const target = step.notes[slot];
  if (!target) return false;

  const padNote = Number(pad.dataset.note);
  if (padNote !== target.note) {
    fingeringEls.status.textContent = `That pad is ${midiNoteName(padNote)}. Choose a ${midiNoteName(target.note)} pad.`;
    return false;
  }

  const assignments = assignmentsForStep();
  assignments[slot] = {
    note: target.note,
    row: Number(pad.dataset.row),
    column: Number(pad.dataset.column),
  };

  const next = step.notes.findIndex((_, index) => index > slot && !assignments[index]);
  if (next >= 0) fingeringState.selectedSlot = next;
  else {
    const firstUnassigned = step.notes.findIndex((_, index) => !assignments[index]);
    if (firstUnassigned >= 0) fingeringState.selectedSlot = firstUnassigned;
  }

  renderFingeringGuide();
  return true;
}

function selectFingeringStep(index) {
  if (!fingeringState.steps.length) return;
  fingeringState.stepIndex = Math.max(0, Math.min(index, fingeringState.steps.length - 1));
  fingeringState.selectedSlot = nextUnassignedSlot();
  const step = currentStep();
  if (step) setTeacherPosition(step.time);
  renderFingeringGuide();
}

function refreshFingeringForChunk() {
  fingeringState.enabled = false;
  buildFingeringSteps();
  renderFingeringGuide();
}

fingeringEls.modeButton.addEventListener("click", () => {
  fingeringState.enabled = !fingeringState.enabled;
  if (fingeringState.enabled) {
    stopTeacherPlayback(false);
    fingeringState.selectedSlot = nextUnassignedSlot();
  }
  renderFingeringGuide();
});

fingeringEls.previousButton.addEventListener("click", () => selectFingeringStep(fingeringState.stepIndex - 1));
fingeringEls.nextButton.addEventListener("click", () => selectFingeringStep(fingeringState.stepIndex + 1));
fingeringEls.clearButton.addEventListener("click", () => {
  const all = assignmentsForCurrentChunk();
  all[fingeringState.stepIndex] = [];
  fingeringState.selectedSlot = 0;
  renderFingeringGuide();
});

els.padGrid.addEventListener("pointerdown", event => {
  if (!fingeringState.enabled) return;
  const pad = event.target.closest?.(".pad");
  if (!pad || pad.classList.contains("out-of-range")) return;
  assignPadToSelectedSlot(pad);
}, true);

const originalSelectChunk = selectChunk;
selectChunk = function(id) {
  originalSelectChunk(id);
  refreshFingeringForChunk();
};

const originalSelectWholeFile = selectWholeFile;
selectWholeFile = function() {
  originalSelectWholeFile();
  refreshFingeringForChunk();
};

const originalDeleteChunk = deleteChunk;
deleteChunk = function(id) {
  fingeringState.assignmentsByChunk.delete(id);
  originalDeleteChunk(id);
  refreshFingeringForChunk();
};

const originalBuildGridForFingerings = buildGrid;
buildGrid = function() {
  originalBuildGridForFingerings();
  renderFingeringGuide();
};

els.midiFileInput.addEventListener("change", () => {
  fingeringState.enabled = false;
  fingeringState.steps = [];
  fingeringState.assignmentsByChunk.clear();
  setTimeout(renderFingeringGuide, 150);
});

renderFingeringGuide();
