# Project: AG Pet

## Architecture
AG Pet is a desktop companion for Antigravity IDE featuring a faithfully reproduced pixel-art robot companion matching the reference design. The system operates across three decoupled modules communicating via typed local IPC / WebSocket channels:

1. **Sprite Engine (`sprite-engine/`)**:
   - Faithful pixel-art representation of the reference robot (curved white/blue chassis, glowing cyan LED screen, four-pointed star chest emblem, detached floating hands, cyan anti-gravity ring with particle glow).
   - Crisp integer pixel scaling (`image-rendering: pixelated`) supporting 1x, 1.5x, 2x scaling at smooth 60fps.
   - Modular animation layer state machine (idle, running, needs_input, ready, blocked, dragging, waving).
   - Procedural Web Audio API synthesizer for gentle retro sci-fi audio effects.

2. **Desktop Overlay (`desktop-overlay/`)**:
   - Electron application running a borderless, transparent, always-on-top window on Windows.
   - Custom cross-monitor mouse drag handler with coordinates and preferences persisted in `config.json`.
   - Native/custom context menu (Scale: 1x, 1.5x, 2x; Mute/Unmute; Hide/Quit).
   - Interactive hover badge/tooltip displaying current agent activity summary.
   - Click-on-pet focus handler bringing Antigravity IDE window to the foreground.
   - Process watchdog monitoring parent Antigravity PID, closing immediately if parent exits or crashes.

3. **Antigravity Extension (`extension/`)**:
   - VS Code / Antigravity IDE extension activating `onStartupFinished`.
   - Spawns desktop pet overlay on startup with parent PID and IPC port; terminates it cleanly on `deactivate`.
   - Real-time transcript watcher monitoring `~/.gemini/antigravity/brain/**/transcript.jsonl`.
   - Agent state parser extracting real-time states (`running`, `needs_input`, `ready`, `blocked`) and activity descriptions.
   - Local WebSocket/IPC bridge broadcasting states to desktop overlay.

4. **E2E Test Track (`tests/`)**:
   - Opaque-box test suite verifying all 15 features across Tiers 1-4.
   - Harness with mock transcript generators, process monitors, and IPC stream verification.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Reference Pixel-Art Robot Sprite | Faithful reproduction of reference robot (white/blue chassis, cyan screen, star emblem, floating hands, cyan ring) | M1 | ORIGINAL_REQUEST §R3 |
| 2 | Modular Animation States | 7 distinct animation states (idle `^ ^`, running stream/gears, needs_input `? ?`, ready `★ ★`, blocked `X X`, dragging lean, waving) | M1 | ORIGINAL_REQUEST §R1 |
| 3 | 60fps Canvas / Pixel Renderer | High-performance 60fps renderer with crisp integer scaling (1x, 1.5x, 2x) and zero blur | M1 | ORIGINAL_REQUEST §R1, §R3 |
| 4 | Web Audio Retro Synth | Procedural Web Audio API sound synthesis for state transitions and interactions (toggleable) | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Transparent Overlay Window | Borderless, transparent, always-on-top Electron window on Windows | M2 | ORIGINAL_REQUEST §R1 |
| 6 | Drag & Drop Multi-Monitor | Smooth drag across screens and coordinate persistence in configuration file | M2 | ORIGINAL_REQUEST §R1 |
| 7 | Right-Click Context Menu | Context menu for scaling (1x, 1.5x, 2x), Mute/Unmute audio, and Hide | M2 | ORIGINAL_REQUEST §R1 |
| 8 | Interactive Activity Tooltip | Hover badge displaying readable agent activity text and state summary | M2 | ORIGINAL_REQUEST §R1 |
| 9 | Click Focus Antigravity | Clicking on pet brings Antigravity IDE into foreground focus | M2 | ORIGINAL_REQUEST §R1 |
| 10| Parent PID Watchdog | Overlay monitors Antigravity PID and exits immediately on parent exit or crash | M2 | ORIGINAL_REQUEST §R2 |
| 11| Extension Lifecycle Management| Auto-spawns overlay on `onStartupFinished` and terminates cleanly on `deactivate` | M3 | ORIGINAL_REQUEST §R2 |
| 12| Transcript Log Watcher | File watcher monitoring `~/.gemini/antigravity/brain/**/transcript.jsonl` | M3 | ORIGINAL_REQUEST §R2 |
| 13| Agent State Machine Extraction| Parsing logs into `running`, `needs_input`, `ready`, `blocked` + status summary text | M3 | ORIGINAL_REQUEST §R2 |
| 14| Real-Time IPC/WebSocket Bridge | Local bridge streaming state events between extension and overlay | M3 | ORIGINAL_REQUEST §R2 |
| 15| Opaque-Box E2E Test Suite | Autonomous test suite covering Tiers 1-4 with 100% pass rate | M4 | ORIGINAL_REQUEST §Acceptance |
| 16| Adversarial Coverage Hardening | Tier 5 white-box stress testing and boundary validation | M5 | Project Pattern Tier 5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1| Sprite & Asset Pipeline Engine | `shared/`, `sprite-engine/`: reference sprite layers, 60fps canvas renderer, 7 animation states, Web Audio synthesizer | none | DONE |
| M2| Desktop Pet Overlay | `desktop-overlay/`: Electron window, drag-and-drop, persistence, context menu, hover badge, click-focus, PID watchdog | M1 (interface) | DONE |
| M3| Antigravity Extension & Watcher| `extension/`: extension manifest, startup/shutdown lifecycle, transcript watcher, state machine, WebSocket bridge | M1 (interface) | DONE |
| M4| E2E Test Suite & Integration | `tests/`: Tiers 1-4 full test suite execution, integration verification, 100% pass | M1, M2, M3 | IN_PROGRESS |
| M5| Tier 5 Adversarial Hardening | White-box stress testing, corner cases, error recovery | M4 | PLANNED |

## Interface Contracts

### `shared/types.ts`
```typescript
export type AgentState = 'idle' | 'running' | 'needs_input' | 'ready' | 'blocked' | 'dragging' | 'waving';

export interface StatePayload {
  state: AgentState;
  summary: string;
  timestamp: number;
  metadata?: {
    toolName?: string;
    conversationId?: string;
    step?: number;
  };
}

export interface PetConfig {
  x: number;
  y: number;
  scale: 1.0 | 1.5 | 2.0;
  isMuted: boolean;
  parentPid?: number;
  wsPort?: number;
}

export interface IPCClientMessage {
  type: 'focus_ide' | 'pet_ready' | 'pet_close';
}

export interface IPCServerMessage {
  type: 'state_update' | 'config_update' | 'heartbeat';
  payload?: StatePayload;
}
```

## Code Layout
```
d:\Projects\AG_Pet/
├── package.json
├── tsconfig.json
├── shared/
│   ├── types.ts
│   └── constants.ts
├── sprite-engine/
│   ├── assets/
│   │   ├── palette.ts
│   │   └── robot-sprites.ts
│   ├── renderer.ts
│   ├── animator.ts
│   ├── audio.ts
│   └── index.ts
├── desktop-overlay/
│   ├── package.json
│   ├── main/
│   │   ├── index.ts
│   │   ├── pid-watchdog.ts
│   │   ├── config.ts
│   │   └── client-bridge.ts
│   └── renderer/
│       ├── index.html
│       ├── app.ts
│       ├── drag-controller.ts
│       ├── context-menu.ts
│       ├── status-badge.ts
│       └── style.css
├── extension/
│   ├── package.json
│   ├── src/
│   │   ├── extension.ts
│   │   ├── transcript-watcher.ts
│   │   ├── state-machine.ts
│   │   ├── server-bridge.ts
│   │   └── process-launcher.ts
│   └── tsconfig.json
└── tests/
    ├── harness/
    │   ├── mock-transcript.ts
    │   └── test-harness.ts
    ├── tier1-features/
    │   └── *.test.ts
    ├── tier2-boundaries/
    │   └── *.test.ts
    ├── tier3-integration/
    │   └── *.test.ts
    ├── tier4-workloads/
    │   └── *.test.ts
    └── runner.js
```
