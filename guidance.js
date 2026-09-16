const guidanceState = {
  enabled: true,
  timers: [],
  activePads: new Set(),
};

function clearGuidanceTimers() {
  guidanceState.timers.forEach(clearTimeout);
  guidanceState.timers = [];
}

function clearGuidancePads() {
  guidanceState.activePads.forEach(pad => pad?.classList.remove("teacher-guide"));
  guidanceState.activePads.clear();
}

function clearTeacherGuidance() {
  clearGuidanceTimers();
  clearGuidancePads();
}

function showAssignedStep(stepIndex) {
  clearGuidancePads();
  const assignments = assignmentsForCurrentChunk()[stepIndex] || [];
  assignments.forEach(assignment => {
    if (!assignment) return;
    const pad = padAt(assignment.row, assignment.column);
    if (!pad) return;
    pad.classList.add("teacher-guide");
    guidanceState.activePads.add(pad);
  });
}

function scheduleAssignedGuidance(position) {
  clearTeacherGuidance();
  if (!guidanceState.enabled || !activeFingeringChunk() || !fingeringState.steps.length) return;

  const bounds = chunkBounds();
  const start = Math.max(bounds.start, Math.min(position, bounds.end));
  const steps = fingeringState.steps;

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (step.time < start || step.time >= bounds.end) continue;
    const delay = Math.max(0, ((step.time - start) / state.speed) * 1000);
    const timer = setTimeout(() => {
      if (!state.teacherPlaying) return;
      showAssignedStep(index);
    }, delay);
    guidanceState.timers.push(timer);
  }

  const endDelay = Math.max(0, ((bounds.end - start) / state.speed) * 1000);
  guidanceState.timers.push(setTimeout(clearGuidancePads, endDelay + 20));
}

const guidanceBaseScheduleTeacherFrom = scheduleTeacherFrom;
scheduleTeacherFrom = function(position) {
  const bounds = chunkBounds();
  let start = Math.max(bounds.start, Math.min(position, bounds.end));
  if (start >= bounds.end) start = bounds.start;
  guidanceBaseScheduleTeacherFrom(start);
  if (state.teacherPlaying) scheduleAssignedGuidance(start);
};

const guidanceBasePauseTeacher = pauseTeacher;
pauseTeacher = function() {
  clearTeacherGuidance();
  guidanceBasePauseTeacher();
};

const guidanceBaseStopTeacherPlayback = stopTeacherPlayback;
stopTeacherPlayback = function(resetPosition = true) {
  clearTeacherGuidance();
  guidanceBaseStopTeacherPlayback(resetPosition);
};

const guidanceBaseSelectFingeringStep = selectFingeringStep;
selectFingeringStep = function(index) {
  clearTeacherGuidance();
  guidanceBaseSelectFingeringStep(index);
  if (!fingeringState.enabled) showAssignedStep(fingeringState.stepIndex);
};

window.addEventListener("beforeunload", clearTeacherGuidance);
