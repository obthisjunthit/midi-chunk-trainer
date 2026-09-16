// Emergency MIDI panic control.
// Stops anything the app believes is sounding, then sends standard MIDI
// All Sound Off / Reset All Controllers / All Notes Off on every channel.
function panicAllMidi() {
  try {
    if (typeof stopAllNotes === "function") stopAllNotes();
  } catch (_) {}

  try {
    if (typeof state !== "undefined" && state.bundleTimer) {
      clearTimeout(state.bundleTimer);
      state.bundleTimer = null;
    }
  } catch (_) {}

  try {
    if (typeof sendRaw === "function") {
      for (let channel = 0; channel < 16; channel++) {
        // Explicit note-offs are included for synths that ignore CC panic messages.
        for (let note = 0; note < 128; note++) {
          sendRaw([0x80 | channel, note, 0]);
        }
        sendRaw([0xB0 | channel, 120, 0]); // All Sound Off
        sendRaw([0xB0 | channel, 121, 0]); // Reset All Controllers
        sendRaw([0xB0 | channel, 123, 0]); // All Notes Off
      }
    }
  } catch (_) {}

  try {
    document.querySelectorAll(".pad.active").forEach(pad => pad.classList.remove("active"));
    if (typeof updateVisualizers === "function") updateVisualizers();
  } catch (_) {}

  const button = document.getElementById("panicButton");
  if (button) {
    const original = button.textContent;
    button.textContent = "Silenced";
    setTimeout(() => { button.textContent = original; }, 650);
  }
}

document.getElementById("panicButton")?.addEventListener("click", event => {
  event.preventDefault();
  panicAllMidi();
});
