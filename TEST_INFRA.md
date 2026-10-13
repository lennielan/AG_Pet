# E2E Test Infra: AG Pet

## Test Philosophy
- Opaque-box, requirement-driven. Validates user-facing functionality, lifecycle management, visual rendering invariants, and status synchronization directly from specifications without depending on private implementation details.
- Systematic 4-tier methodology: Category-Partition, Boundary Value Analysis, Pairwise Interaction, and Real-World Workload Simulation.

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 (Features) | Tier 2 (Boundaries) | Tier 3 (Cross-Feature) | Tier 4 (Workload) |
|---|---------|-------------------|:-----------------:|:-------------------:|:----------------------:|:-----------------:|
| 1 | Reference Robot Pixel-Art Asset | ORIGINAL_REQUEST §R3 | ≥5 | ≥5 | ✓ | ✓ |
| 2 | Modular Animation States (7 states)| ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 3 | 60fps Canvas / Pixel Renderer | ORIGINAL_REQUEST §R1, §R3 | ≥5 | ≥5 | ✓ | ✓ |
| 4 | Web Audio Retro Synth & Mute | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 5 | Transparent Electron Overlay Window| ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 6 | Drag & Drop Multi-Screen & Persist | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 7 | Context Menu (Scale, Mute, Hide) | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 8 | Interactive Tooltip & Activity Badge| ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 9 | Click Focus Antigravity IDE | ORIGINAL_REQUEST §R1 | ≥5 | ≥5 | ✓ | ✓ |
| 10| Parent Process PID Watchdog | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| 11| Extension Lifecycle (activate/exit)| ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| 12| Transcript Watcher & Parsing | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| 13| Agent State Machine Extraction | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |
| 14| Real-Time IPC/WebSocket Bridge | ORIGINAL_REQUEST §R2 | ≥5 | ≥5 | ✓ | ✓ |

## Test Architecture
- **Test Runner**: Node.js test runner executing `tests/runner.js`. Returns exit code 0 when all tests pass, non-zero on failure.
- **Harness Infrastructure**:
  - `MockTranscriptGenerator`: Simulates realistic Antigravity transcript events (tool starts, completions, model thinking, errors, turn conclusions) into temporary `.jsonl` files.
  - `MockAntigravityProcess`: Simulates IDE parent process with known PID, graceful exits, and sudden crashes/kills to test watchdog termination.
  - `MockOverlayClient`: Simulates Electron overlay WebSocket client to verify handshake, state streaming, and focus requests.
  - `PixelValidator`: Verifies sprite matrix color values, exact reference palette adherence (cyan, blue, white, glow values), and crisp scaling without blurring.

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature (14 features × 5 = 70 test cases). Validates each feature in isolation.
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature (14 features × 5 = 70 test cases). Validates rapid state transitions, invalid/corrupt JSONL lines, missing config, extreme screen coordinates, multi-monitor negative coordinates, process death timing.
- **Tier 3 (Cross-Feature Combinations)**: ≥14 pairwise interaction tests (e.g., dragging while state changes to `running`, context menu scale switch during celebration animation, mute toggle with rapid state sounds, transcript append during reconnection).
- **Tier 4 (Real-World Workload Scenarios)**: ≥7 realistic full-cycle end-to-end scenarios:
  1. Full Developer Coding Session (Startup → Idle → Running with tools → Input prompt → Running fix → Completion flip `★ ★`).
  2. Multi-Turn Error Recovery Session (Idle → Running → Tool exception `X X` blocked → User input prompt → Fixed → Ready).
  3. Window Dragging Across Dual Monitors & Config Save/Load on Restart.
  4. Sudden IDE Process Crash (Kill PID → Overlay terminates in <500ms without orphan).
  5. Rapid State Churn & Hover Activity Tooltip Responsiveness.
  6. Context Menu Customization (Scale 2x, Mute audio) surviving state changes and relaunch.
  7. Multi-File Brain Directory Traversal & Active Transcript Selection.

- **Total Target**: ≥160 test cases.
