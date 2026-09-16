const guidanceState = { enabled:true, activePads:new Set(), shownStep:-1 };

function clearGuidancePads(){
  guidanceState.activePads.forEach(pad=>pad?.classList.remove("teacher-guide"));
  guidanceState.activePads.clear();
  guidanceState.shownStep=-1;
}

function showAssignedStep(stepIndex){
  if(guidanceState.shownStep===stepIndex) return;
  clearGuidancePads();
  const assignments=(assignmentsForCurrentChunk()[stepIndex]||[]);
  assignments.forEach(assignment=>{
    if(!assignment) return;
    const pad=padAt(assignment.row,assignment.column);
    if(!pad) return;
    pad.classList.add("teacher-guide");
    guidanceState.activePads.add(pad);
  });
  guidanceState.shownStep=stepIndex;
}

function guidanceStepForPosition(position){
  if(!activeFingeringChunk()||!fingeringState.steps.length) return -1;
  let found=-1;
  for(let i=0;i<fingeringState.steps.length;i++){
    if(fingeringState.steps[i].time<=position+0.03) found=i; else break;
  }
  return found;
}

function refreshTeacherGuide(){
  if(!guidanceState.enabled||fingeringState.enabled||!state.teacherPlaying){
    if(!state.teacherPlaying) clearGuidancePads();
    return;
  }
  const chunk=activeFingeringChunk();
  if(!chunk){ clearGuidancePads(); return; }
  const position=currentTeacherPosition();
  if(position<chunk.start||position>=chunk.end){ clearGuidancePads(); return; }
  const index=guidanceStepForPosition(position);
  if(index>=0) showAssignedStep(index);
}

// requestAnimationFrame is more reliable than rapid setInterval timers in iOS WebKit wrappers.
let guidanceFrame=0;
function guidanceLoop(){ refreshTeacherGuide(); guidanceFrame=requestAnimationFrame(guidanceLoop); }
guidanceFrame=requestAnimationFrame(guidanceLoop);

// Prevent iOS text selection/callout from stealing long presses and drags from the instrument UI.
for(const type of ["contextmenu","selectstart","dragstart"]){
  document.addEventListener(type,event=>{
    if(event.target.closest?.(".app-shell")) event.preventDefault();
  },{capture:true});
}
document.addEventListener("touchmove",event=>{
  if(event.target.closest?.(".pad-grid")) event.preventDefault();
},{passive:false,capture:true});

const guidanceBaseSelectFingeringStep=selectFingeringStep;
selectFingeringStep=function(index){
  clearGuidancePads();
  guidanceBaseSelectFingeringStep(index);
  if(!fingeringState.enabled) showAssignedStep(fingeringState.stepIndex);
};

const guidanceBaseRefreshFingeringForChunk=refreshFingeringForChunk;
refreshFingeringForChunk=function(){ clearGuidancePads(); guidanceBaseRefreshFingeringForChunk(); };

window.addEventListener("beforeunload",()=>{
  cancelAnimationFrame(guidanceFrame);
  clearGuidancePads();
});
