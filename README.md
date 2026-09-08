# midi-chunk-trainer

A simple LinnStrument-oriented MIDI practice trainer designed to run as a WebMIDI app on iPad/iPhone and later work with a physical LinnStrument.

## Current build

- Responsive square isomorphic pad grid
- Multi-touch chords
- Configurable base note
- Configurable row and column count
- Configurable horizontal and vertical pitch intervals
- Default mapping: A0 base, +1 semitone across, +5 semitones up
- Web MIDI output selection
- Student touchscreen notes transmit on MIDI channel 1
- Teacher MIDI is reserved for MIDI channel 2
- Panic / All Notes Off

## iPad + AUM test setup

1. Update the iPad 6th generation to iPadOS 17.6 or later if needed.
2. Install MIDIWeb Browser.
3. Install/open AUM.
4. In AUM, add an AUv3 instrument such as Pianoteq.
5. Leave AUM running in the background.
6. Open this LinnTrainer site in MIDIWeb Browser.
7. Tap **Enable MIDI**.
8. In **MIDI out**, select the AUM virtual destination if it appears.
9. In AUM's MIDI matrix, route the **AUM** virtual MIDI source to the desired AUv3 instrument.
10. Touch pads in LinnTrainer. They should play the AUv3 instrument through AUM.

For two separate sounds later:

- Student MIDI: channel 1
- Teacher MIDI: channel 2

AUM can use per-destination MIDI channel filters so channel 1 and channel 2 can feed separate AUv3 instrument instances, or both can feed the same instrument.

## GitHub Pages

The repository contains `.github/workflows/deploy.yml` for GitHub Pages deployment.

In GitHub:

1. Open **Settings** for this repository.
2. Open **Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.

The deploy workflow runs on pushes to `main`.

## Planned milestones

1. MIDI file import
2. MIDI playback / teacher channel
3. Shadow mode
4. Wait-for-correct-pad mode
5. Named chunk creation
6. Exact pad/fingering assignment per event
7. Physical LinnStrument MIDI input and LED control
