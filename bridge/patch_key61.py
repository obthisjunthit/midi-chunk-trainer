#!/usr/bin/env python3
"""Patch MIT-licensed upstream usb-audio addin to emit USB MIDI and audio together.

Upstream: jacob-sabella/mpc-addin-usb-audio, release 1.2.0 commit d0f1c4e...
Original copyright (c) 2026 Jacob Sabella. See LICENSE in build output.
All patch anchors are intentionally strict: fail the CI build on upstream changes.
"""
from pathlib import Path

p = Path("src/gadget.c")
src = p.read_text()

def replace_once(old, new):
    global src
    n = src.count(old)
    if n != 1:
        raise SystemExit(f"STOP: expected exactly one upstream anchor; got {n}: {old[:90]!r}")
    src = src.replace(old, new, 1)

replace_once(
    '  snprintf(p, sizeof p, "%s/configs/c.1/uac2.%s", g, c->instance); unlink(p);',
    '  snprintf(p, sizeof p, "%s/configs/c.1/midi.usb0", g); unlink(p);\n'
    '  snprintf(p, sizeof p, "%s/configs/c.1/uac2.%s", g, c->instance); unlink(p);'
)
replace_once(
    '  snprintf(p, sizeof p, "%s/functions/uac2.%s", g, c->instance); rmdir(p);',
    '  snprintf(p, sizeof p, "%s/functions/midi.usb0", g); rmdir(p);\n'
    '  snprintf(p, sizeof p, "%s/functions/uac2.%s", g, c->instance); rmdir(p);'
)
replace_once(
    '  snprintf(p, sizeof p, "%s/configs/c.1", g);\n  STEP(mk(p), "config");',
    '  char mdir[384];\n'
    '  snprintf(mdir, sizeof mdir, "%s/functions/midi.usb0", g);\n'
    '  STEP(mk(mdir), "MIDI function");\n'
    '  STEP(wr(mdir, "in_ports", "1"), "MIDI inputs");\n'
    '  STEP(wr(mdir, "out_ports", "1"), "MIDI outputs");\n'
    '\n'
    '  snprintf(p, sizeof p, "%s/configs/c.1", g);\n  STEP(mk(p), "config");'
)
replace_once(
    '  STEP(wr(g, "UDC", udc), "bind to the UDC");',
    '  snprintf(p, sizeof p, "%s/configs/c.1/midi.usb0", g);\n'
    '  if (symlink(mdir, p) != 0 && errno != EEXIST) STEP(-errno, "link MIDI");\n'
    '  STEP(wr(g, "UDC", udc), "bind to the UDC");'
)
p.write_text(src)
print("Key 61 composite USB audio+MIDI patch applied.")
