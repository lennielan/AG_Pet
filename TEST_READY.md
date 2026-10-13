# TEST_READY: AG Pet E2E Test Suite

## Status
- **Test Suite Status**: COMPLETE & VALIDATED
- **Total Test Cases**: 161
- **Passed**: 161 (100%)
- **Failed**: 0
- **Runner Exit Code**: 0
- **Execution Command**: `node tests/runner.js`

---

## 4-Tier Test Inventory

| Tier | Category | Scope | File Count | Test Count | Pass Rate | Status |
|:---:|:---|:---|:---:|:---:|:---:|:---:|
| **Tier 1** | Feature Coverage | F01 - F14 isolated specifications | 14 | 70 | 100% | PASS |
| **Tier 2** | Boundary & Corner Cases | F01 - F14 edge conditions & error paths | 14 | 70 | 100% | PASS |
| **Tier 3** | Cross-Feature Interaction | Pairwise feature combinations | 14 | 14 | 100% | PASS |
| **Tier 4** | Real-World Workloads | End-to-end full developer scenarios | 7 | 7 | 100% | PASS |
| **Total** | **Full E2E Suite** | **Complete project specification** | **49** | **161** | **100%** | **PASS** |

---

## Test Harness Infrastructure (`tests/harness/`)

1. **`spec-contracts.js`**:
   - Canonical definitions for `VALID_AGENT_STATES`, `VALID_SCALES`, `REFERENCE_PALETTE`, `SCREEN_EXPRESSIONS`, `WINDOW_SPEC`, and `AUDIO_PRESETS`.
   - Structural validators: `validatePetConfig()`, `validateStatePayload()`, and `validateIPCMessage()`.

2. **`pixel-validator.js`**:
   - `PixelValidator.validatePalette()`: Verifies matrix adheres to reference palette.
   - `PixelValidator.validateDimensions()`: Verifies canonical 32x32 dimensions.
   - `PixelValidator.validateCrispScaling()`: Verifies nearest-neighbor scaling at 1x, 1.5x (48x48), 2x (64x64) without color bleeding.
   - `PixelValidator.validateRobotAnatomy()`: Verifies LED screen cyan glow, white chassis, star emblem, floating hands, and anti-gravity ring.
   - `PixelValidator.generateCanonicalReferenceSprite()`: Canonical reference oracle matrix.

3. **`mock-transcript.js`**:
   - `MockTranscriptGenerator`: Simulates Antigravity JSONL session logs (tool calls, thinking, prompt_user, turn_complete, blocked errors, session rotations).

4. **`mock-process.js`**:
   - `MockAntigravityProcess`: Spawns real OS sleeper processes with PIDs, simulates graceful exits and sudden SIGKILL crashes.
   - `MockAntigravityProcess.startWatchdog()`: Simulates overlay PID watchdog loop with configurable polling frequency.

5. **`mock-overlay.js`**:
   - `MinimalWebSocketServer`: Zero-dependency RFC-6455 WebSocket server supporting multi-frame parsing, broadcasts, and heartbeat.
   - `MockOverlayClient`: WebSocket client simulating Electron overlay with message listeners and connection handlers.

6. **`test-harness.js`**:
   - Unified harness coordinating all mocks, reference state machines, audio synth models, drag persistence managers, and automatic teardown.

---

## Detailed Feature Coverage (Features 1 - 14)

### Tier 1: Feature Coverage (70 tests, 5 tests per feature)
- **F01 (Robot Sprite)**: Dimensions 32x32, palette adherence, anatomy elements, screen contrast, horizontal chassis symmetry.
- **F02 (Animation States)**: 7 states validity, face expressions (`^ ^`, `||||`, `? ?`, `★ ★`, `X X`), transitions, payload contract, sinusoidal bobbing.
- **F03 (60fps Canvas)**: 16.67ms frame budget, 1.0x, 1.5x, 2.0x integer scaling, pixelated smoothing disabled.
- **F04 (Audio Synth)**: Presets defined, default 0.3 gain, mute attenuation to 0.0, toggle idempotence, retro frequencies.
- **F05 (Overlay Window)**: Transparency, borderless/frameless, alwaysOnTop, skipTaskbar, bounds calculation.
- **F06 (Drag & Persist)**: Delta translation, negative multi-monitor virtual coords, disk persistence, schema check, reload restore.
- **F07 (Context Menu)**: Menu item structure, scale 1.5x selection, mute audio toggle, hide action, disk persistence trigger.
- **F08 (Activity Tooltip)**: Hover activation, activity text display, mouse leave hide, state color indicators, truncation with ellipsis.
- **F09 (Click Focus IDE)**: Focus message dispatch, waving animation reaction, 200ms debouncing, message validation, 5px drag separation.
- **F10 (PID Watchdog)**: Live PID detection, crash detection, <500ms detection latency, graceful exit trigger, zero orphan processes.
- **F11 (Extension Lifecycle)**: Spawn arguments (`--parent-pid`, `--ws-port`), `deactivate()` process kill, valid PID passing, ephemeral port allocation, crash telemetry.
- **F12 (Transcript Watcher)**: New file discovery, incremental byte tailing, atomic multiline appends, non-transcript file filter, session rotation.
- **F13 (State Extraction)**: Tool call -> `running`, prompt_user -> `needs_input`, turn_complete -> `ready`, error -> `blocked`, thinking -> `running`.
- **F14 (IPC Bridge)**: Handshake, server state broadcast, client focus request, heartbeat ping/pong, clean socket teardown.

### Tier 2: Boundary & Corner Cases (70 tests, 5 tests per feature)
- **F01**: Empty matrix rejection, non-square dimensions rejection, unauthorized rogue color detection, inverted zero contrast detection, extreme scaling (0.5x, 4.0x).
- **F02**: Invalid state transition rejection, 100 rapid transitions churn, empty summary string rejection, negative timestamp rejection, unknown expression fallback.
- **F03**: Fractional 1.25x scaling, 0x0 canvas bounds safety, 100ms frame lag spike recovery, 4x scaling performance, transparent pixel skip optimization.
- **F04**: Unknown preset error, 50 rapid sound bursts under mute, mid-playback unmuting, safe human hearing frequency clamping (20-20000Hz), gain bounds clamping [0.0, 1.0].
- **F05**: Off-screen negative virtual desktop (-3840px), 8K desktop bounds (7680px), zero/negative dimension prevention, alwaysOnTop level invariant, DPI scaling changes (150%).
- **F06**: Drag move without start no-op, 10,000px mouse jump, corrupted JSON config recovery, missing keys default filling, read-only save error handling.
- **F07**: Rapid scale cycling (30 times), invalid scale values (0x, 10x, -1.5x), uninitialized config defaults, double hide idempotence, menu suppression during active drag.
- **F08**: Empty summary fallback to state name, massive 50,000 char summary truncation, 50 rapid enter/leave events, unknown state color fallback, screen edge positioning clamping.
- **F09**: Click with dead PID handling, microsecond debounce boundaries, multitouch pointer tracking, malformed IPC envelope rejection, exact 5.0px drag threshold.
- **F10**: PID 0 and negative PID rejection, rapid 10ms poll interval stress, double stop idempotence, kill during shutdown safety, non-existent PID safety.
- **F11**: Missing binary path error, busy port fallback, double activate process replacement, deactivate on dead process safety, 5-crash storm alarm.
- **F12**: 0-byte empty file safety, existing 100-line file initial tail, corrupt JSON line skip with recovery, UTF-8 multilingual and emoji parsing, file truncation offset reset.
- **F13**: Empty and whitespace lines return null, unclosed JSON syntax returns `{ type: 'corrupted' }`, missing tool name fallback, error precedence over completion, unrecognized role lines return null.
- **F14**: Connection refused retry, 100KB massive payload handling, 4 concurrent client connections, abrupt server shutdown handling, 25 rapid burst messages framing.

### Tier 3: Cross-Feature Pairwise Interaction (14 tests)
- `drag-while-running.test.js`: F06 (Drag) × F02/F13 (Running State)
- `scale-during-celebration.test.js`: F07 (Scale Menu) × F02 (Celebration State)
- `mute-with-rapid-states.test.js`: F04 (Mute Audio) × F02/F14 (State Stream)
- `transcript-append-reconnect.test.js`: F12 (Transcript Tail) × F14 (Bridge Reconnect)
- `pid-exit-during-drag.test.js`: F10 (PID Watchdog) × F06 (Active Drag)
- `tooltip-during-state-churn.test.js`: F08 (Tooltip Badge) × F13 (State Churn)
- `click-focus-during-blocked.test.js`: F09 (Click Focus) × F02/F13 (Blocked Error)
- `multi-screen-drag-with-scale.test.js`: F06 (Multi-Monitor) × F07 (1.5x Scale)
- `corrupted-log-state-recovery.test.js`: F12 (Corrupt Line) × F13 (State Recovery)
- `extension-restart-overlay-reconnect.test.js`: F11 (Extension Restart) × F14 (Bridge)
- `audio-unmute-ready-chime.test.js`: F04 (Audio Synth) × F02 (Ready Chime)
- `brain-rotation-watcher-handoff.test.js`: F12 (Session Rotation) × F14 (Live Stream)
- `rapid-input-prompt-cycle.test.js`: F13 (Needs Input) × F02 (`? ?`) × F04 (Chirp)
- `window-hide-and-restore-state.test.js`: F07 (Hide Pet) × F14 (Background State Sync)

### Tier 4: Real-World Workload Scenarios (7 tests)
- `workload-1-developer-coding-session.test.js`: Full developer session (startup -> idle -> running -> needs_input -> running -> ready flip -> idle).
- `workload-2-multi-turn-error-recovery.test.js`: Build error recovery (idle -> running -> blocked error `X X` -> click focus IDE -> patch applied -> ready celebration).
- `workload-3-dual-monitor-drag-persist.test.js`: Multi-monitor drag to negative coordinates (-1400px), 1.5x scale, mute, save to disk, reload on restart.
- `workload-4-sudden-ide-crash-watchdog.test.js`: Sudden IDE process crash detection within <500ms and immediate overlay termination without orphans.
- `workload-5-rapid-state-churn-tooltip.test.js`: High-velocity 12-tool pipeline execution with live tooltip and state updates.
- `workload-6-context-menu-scale-mute-relaunch.test.js`: Customization to 2.0x scale (64x64) and mute, persisting across multiple tasks and app relaunch.
- `workload-7-multi-file-brain-traversal.test.js`: Antigravity multi-session brain traversal, newest transcript detection, and session rotation handoff.

---

## How to Execute the Suite

```bash
# Run all 161 tests across all 4 tiers
node tests/runner.js

# Run individual tiers
node tests/runner.js --tier=1
node tests/runner.js --tier=2
node tests/runner.js --tier=3
node tests/runner.js --tier=4

# Filter tests by keyword
node tests/runner.js --filter=sprite
node tests/runner.js --filter=watchdog
```

---

## Milestone Readiness
- **M1 (Sprite & Asset Pipeline)**: Test suite provides reference matrix, palette validator, and 60fps / scaling checks.
- **M2 (Desktop Overlay)**: Test suite provides window configuration, drag calculation, context menu, and PID watchdog validators.
- **M3 (Antigravity Extension & Watcher)**: Test suite provides transcript log simulator, state machine extractor, and WebSocket bridge verifiers.
- **M4 (Full Integration)**: Test suite is ready to run directly against authored components.
