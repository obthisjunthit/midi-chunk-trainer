// Simulate two documented LinnStrument touch-matrix limitations so practice
// on the iPad transfers more faithfully to the physical instrument:
// 1) If three held cells are three corners of a rectangle, the fourth corner
//    will not trigger.
// 2) A fourth simultaneously-held cell in the same vertical column will not trigger.
(function () {
  if (typeof pressPointer !== 'function' || typeof releasePointer !== 'function' || typeof state === 'undefined') return;

  const originalPressPointer = pressPointer;

  function coordinatesForPad(pad) {
    if (!pad) return null;
    const row = Number(pad.dataset.row);
    const column = Number(pad.dataset.column);
    if (!Number.isFinite(row) || !Number.isFinite(column)) return null;
    return { row, column, key: `${row}:${column}` };
  }

  function heldCellsExcluding(pointerId) {
    const cells = new Map();
    for (const [id, active] of state.activePointers.entries()) {
      if (id === pointerId) continue;
      const cell = coordinatesForPad(active?.pad);
      if (cell) cells.set(cell.key, cell);
    }
    return [...cells.values()];
  }

  function violatesColumnLimit(target, held) {
    let count = 0;
    for (const cell of held) {
      if (cell.column === target.column) count += 1;
    }
    return count >= 3;
  }

  function completesBlockedRectangle(target, held) {
    const heldSet = new Set(held.map(cell => cell.key));
    const sameRowColumns = new Set();
    const sameColumnRows = new Set();

    for (const cell of held) {
      if (cell.row === target.row && cell.column !== target.column) {
        sameRowColumns.add(cell.column);
      }
      if (cell.column === target.column && cell.row !== target.row) {
        sameColumnRows.add(cell.row);
      }
    }

    for (const otherColumn of sameRowColumns) {
      for (const otherRow of sameColumnRows) {
        if (heldSet.has(`${otherRow}:${otherColumn}`)) return true;
      }
    }
    return false;
  }

  function isPhysicallyBlocked(pointerId, pad) {
    const target = coordinatesForPad(pad);
    if (!target) return false;

    const held = heldCellsExcluding(pointerId);
    return violatesColumnLimit(target, held) || completesBlockedRectangle(target, held);
  }

  pressPointer = function (pointerId, pad) {
    if (!pad) return;

    const previous = state.activePointers.get(pointerId);
    if (previous?.pad === pad) {
      originalPressPointer(pointerId, pad);
      return;
    }

    if (isPhysicallyBlocked(pointerId, pad)) {
      // If a held finger slides from a valid cell into a cell the hardware
      // would reject, release the old cell and do not sound/light the new one.
      if (previous) releasePointer(pointerId);
      return;
    }

    originalPressPointer(pointerId, pad);
  };

  window.isLinnStrumentCellBlocked = isPhysicallyBlocked;
})();
