const guidanceState = {
  enabled: true,
  activePads: new Set(),
  shownStep: -1,
};

function clearGuidancePads() {
  guidanceState.activePads.forEach(pad => pad?.classList.remove("teacher-guide"));
  guidanceState.activePads.clear();
  guidanceState.shownStep = -1;
}

function showAssignedStep(stepIndex) {
  if (guidanceState.shownStep === stepIndex) return;
  clearGuidancePads();

  const allAssignments = assignmentsForCurrentChunk();
  const assignments = allAssignments[stepIndex] || [];
  assignments.forEach(assignment => {
    if (!assignment) return;
    const pad = padAt(assignment.row, assignment.column);
    if (!pad) return;
    pad.classList.add("teacher-guide");
    guidanceState.activePads.add(pad);
  });
  guidanceState.shownStep = stepIndex;
}

function guidanceStepForPosition(position) {
  if (!activeFingeringChunk() || !fingeringState.steps.length) return -1;
  let found = -1;
  for (let i = 0; i < fingeringState.steps.length; i++) {
    if (fingeringState.steps[i].time <= position + 0.025) found = i;
    else break;
  }
  return found;
}

// Poll the actual teacher playhead instead of maintaining a second set of
// playback timers. This keeps the visual guide locked to pause, speed,
// seeking, looping, and the chunk transport.
const guidanceClock = setInterval(() => {
  if (!guidanceState.enabled || fingeringState.enabled || !state.teacherPlaying) {
    if (!state.teacherPlaying && guidanceState.activePads.size) clearGuidancePads();
    return;
  }

  const chunk = activeFingeringChunk();
  if (!chunk) {
    clearGuidancePads();
    return;
  }

  const position = currentTeacherPosition();
  if (position < chunk.start || position >= chunk.end) {
    clearGuidancePads();
    return;
  }

  const stepIndex = guidanceStepForPosition(position);
  if (stepIndex >= 0) showAssignedStep(stepIndex);
}, 20);

const guidanceBaseSelectFingeringStep = selectFingeringStep;
selectFingeringStep = function(index) {
  clearGuidancePads();
  guidanceBaseSelectFingeringStep(index);
  if (!fingeringState.enabled) showAssignedStep(fingeringState.stepIndex);
};

const guidanceBaseRefreshFingeringForChunk = refreshFingeringForChunk;
refreshFingeringForChunk = function() {
  clearGuidancePads();
  guidanceBaseRefreshFingeringForChunk();
};

window.addEventListener("beforeunload", () => {
  clearInterval(guidanceClock);
  clearGuidancePads();
});
