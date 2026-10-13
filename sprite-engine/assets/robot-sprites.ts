/**
 * sprite-engine/assets/robot-sprites.ts
 * Modular 64x64 pixel-art sprite layers faithfully decomposed from the reference image.
 * Separates static chassis body, dynamic screen expressions, floating hands,
 * levitation ring, and ground shadow.
 */

import { AgentState } from '../../shared/types';
import { COLOR_LUT_32, PaletteToken, PALETTE_COLORS } from './palette';

export const CANVAS_SIZE = 64;

export interface SpriteBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ModularLayer {
  bounds: SpriteBounds;
  matrix: string[];
}

/**
 * 1. Static Body Chassis Layer
 * Coordinates: X: 15..49, Y: 10..46 (Width 35, Height 37)
 * Encompasses the blue helmet dome, ear cylinder pods, white visor frame,
 * blue chest chassis, 4-pointed star emblem, and curved white belly plate.
 */
export const BODY_CHASSIS_LAYER: ModularLayer = {
  bounds: { x: 15, y: 10, width: 34, height: 37 },
  matrix: [
    ".........000332222222000..........", // Y=10 (Crown dome top)
    ".......7003322222444422303703.....", // Y=11
    ".0....03333222222444444206323.....", // Y=12
    "020..0776632222222224422266620....", // Y=13
    "03200776666222222222222226.6706...", // Y=14
    ".0207766666022222222222226...76...", // Y=15
    "..30776666663222222222230666670...", // Y=16
    "..077666666700000000000007666630..", // Y=17
    ".000766666................166600..", // Y=18 (Visor bezel aperture cutout)
    "002206666..................166040.", // Y=19
    "022247667..................360207.", // Y=20
    "332227667..................060240.", // Y=21
    "333223667..................060220.", // Y=22
    "333223667..................060220.", // Y=23
    "333223667..................060230.", // Y=24
    "233323667..................060330.", // Y=25
    "023333667..................06030..", // Y=26
    "022337667..................06330..", // Y=27
    ".022037660................03633...", // Y=28
    "..0333066710............0176330...", // Y=29
    "..03333766711000000000001162330...", // Y=30
    "...3033337667077777777770663330...", // Y=31
    "....00233377366666666666073330....", // Y=32
    "......00023333333333333333300.....", // Y=33 (Neck mechanical joint)
    "........000033333333333000........", // Y=34
    "..........03333333333330..........", // Y=35 (Upper torso)
    ".........033323333C333230.........", // Y=36 (Chest star top amber tip)
    ".........033322222B222220.........", // Y=37 (Chest star top yellow wing)
    ".........7400222CBD882230.........", // Y=38 (Chest star core: C, B, D spark, 8 cyan)
    ".........77460222C8822067.........", // Y=39 (Chest star bottom cyan)
    ".........7476DD0228223667.........", // Y=40
    ".........0777DDD22422D670.........", // Y=41
    ".........0044766600066600.........", // Y=42 (White belly plate)
    "..........03277666666730..........", // Y=43
    "...........330074477033...........", // Y=44
    "............03333333306...........", // Y=45 (Lower chassis keel)
    ".............00333300.............", // Y=46
  ]
};

/**
 * 2. LED Screen Visor Expression Sub-Matrices
 * Position: X: 23, Y: 19, Width: 19, Height: 12
 */
export const SCREEN_BOUNDS: SpriteBounds = { x: 23, y: 19, width: 19, height: 12 };

export const EXPRESSIONS: Record<string, string[]> = {
  // Idle smiling arcs `^ ^`
  idle: [
    "1111111111111111111", // Y=19
    "1111111111111111111", // Y=20
    "1111111111111111111", // Y=21
    "1111888111111888111", // Y=22: Upper eye arcs
    "1118999811118999811", // Y=23: High bright cyan glow
    "1118010811118010811", // Y=24: Arch cavity
    "1118111811118111811", // Y=25: Arch stems
    "1111111111111111111", // Y=26
    "1111111111111111111", // Y=27
    "1111111111111111111", // Y=28
    "1111111111111111111", // Y=29
    "1111111111111111111", // Y=30
  ],

  // Idle relaxed blink frame `- -`
  blink: [
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1118999811118999811", // Horizontal eye slits
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Running State: Digital Data Stream / Processing Waves (Frame 1)
  running_f1: [
    "1111111111111111111",
    "1111111111111111111",
    "1118118118118118111",
    "1118918918918918911",
    "1119819819819819811",
    "1111811811811811811",
    "1118118118118118111",
    "1118918918918918911",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Running State: (Frame 2)
  running_f2: [
    "1111111111111111111",
    "1111111111111111111",
    "1111811811811811811",
    "1119819819819819811",
    "1118918918918918911",
    "1118118118118118111",
    "1119819819819819811",
    "1111811811811811811",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Needs Input: Questioning / Alert `? ?`
  needs_input: [
    "1111111111111111111",
    "1111111111111111111",
    "1111888111111888111",
    "1118919811118919811",
    "1111119811111119811",
    "1111188111111188111",
    "1111181111111118111",
    "1111111111111111111",
    "1111191111111119111", // Dot of `?`
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Ready: Celebratory 4-Pointed Star Eyes `★ ★`
  ready: [
    "1111111111111111111",
    "1111111111111111111",
    "1111191111111119111", // Star top point
    "11118D81111118D8111",
    "1189DDD981189DDD981", // Star horizontal arms with center radiant spark `D`
    "11118D81111118D8111",
    "1111191111111119111", // Star bottom point
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Blocked / Error: Crossed Out `X X`
  blocked: [
    "1111111111111111111",
    "1111111111111111111",
    "1118111811118111811",
    "1111818111111818111",
    "1111191111111119111", // Center intersection
    "1111818111111818111",
    "1118111811118111811",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Dragging: Aerodynamic Squint `> <`
  dragging: [
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1118111111111111181",
    "1111891111111189111",
    "1111119811118911111",
    "1111891111111189111",
    "1118111111111111181",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Waving: Playful Wink `^ -`
  waving: [
    "1111111111111111111",
    "1111111111111111111",
    "1111888111111111111",
    "1118999811111111111",
    "1118010811118999811", // Left eye smiling `^`, Right eye winking `-`
    "1118111811111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],

  // Thinking: Pensive gaze with bottom dots `• • •`
  thinking: [
    "1111111111111111111",
    "1111111111111111111",
    "1118888111111888111",
    "1111111111118999811",
    "11111111111189D9811",
    "1111111111111888111",
    "1111111111111111111",
    "1111111111111111111",
    "1111811811811111111", // • • • dots
    "1111111111111111111",
    "1111111111111111111",
    "1111111111111111111",
  ],
};

/**
 * 3. Detached Floating Robotic Hands Sub-Matrices (10x10 each)
 */
export const LEFT_HAND_BOUNDS: SpriteBounds  = { x: 14, y: 36, width: 10, height: 10 };
export const RIGHT_HAND_BOUNDS: SpriteBounds = { x: 41, y: 36, width: 10, height: 10 };

export const HAND_POSES: Record<string, string[]> = {
  // Resting Pose (Idle floating)
  left_resting: [
    "....0330..", // Y=36
    "...002760.", // Y=37
    "...322660.", // Y=38
    "..0326670.", // Y=39
    ".00707676.", // Y=40
    ".0766070..", // Y=41
    ".0066000..", // Y=42
    ".033020...", // Y=43
    ".032030...", // Y=44
    "..000.....", // Y=45
  ],
  right_resting: [
    ".0333.....", // Y=36
    "073200....", // Y=37
    "033622....", // Y=38
    "0076220...", // Y=39
    "67707620..", // Y=40
    ".0377770..", // Y=41
    "..030020..", // Y=42
    "..730030..", // Y=43
    "...0600...", // Y=44
    "..........", // Y=45
  ],

  // Celebratory raised hands for `ready` state
  left_cheer: [
    ".007660...",
    "0326670...",
    "022760....",
    ".0070.....",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
  right_cheer: [
    "...066700.",
    "...0766230",
    "....067220",
    ".....0700.",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],

  // Running typing alternate postures
  left_type_up: [
    "..007660..",
    ".0326670..",
    ".022660...",
    "..0070....",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
  right_type_up: [
    "..066700..",
    "..0766230.",
    "...067220.",
    "....0700..",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],

  // Drooping limp hands for `blocked` state
  left_droop: [
    "..........",
    "..........",
    "....0330..",
    "...002760.",
    "...322660.",
    "..0326670.",
    ".00707676.",
    ".0766070..",
    ".0066000..",
    ".033020...",
  ],
  right_droop: [
    "..........",
    "..........",
    ".0333.....",
    "073200....",
    "033622....",
    "0076220...",
    "67707620..",
    ".0377770..",
    "..030020..",
    "..730030..",
  ],

  // Friendly hand wave cycle frames for viewer right hand
  right_wave_tilt_left: [
    "..006670..",
    ".032660...",
    "..0070....",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
  right_wave_tilt_right: [
    "....066700",
    ".....07620",
    "......070.",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
    "..........",
  ],
};

/**
 * 4. Anti-Gravity Levitation Ring & Particle Glow
 * Position: X: 20, Y: 47, Width: 26, Height: 6
 */
export const RING_BOUNDS: SpriteBounds = { x: 20, y: 47, width: 26, height: 6 };

export const LEVITATION_RING_FRAMES: Record<string, string[]> = {
  normal: [
    ".....69...........99......", // Y=47: Floating spark particles
    ".......9999999999.........", // Y=48: Upper ring arc
    "..9.9449........9449......", // Y=49: Torus flanks
    "....9966646666466699.6....", // Y=50: Bright lower torus core
    ".......699999.996..9......", // Y=51: Lower falloff
    "............9......6......", // Y=52: Bottom spark
  ],
  pulsed: [
    "....989...........989.....",
    "......9888888888889.......",
    ".9.99899........99899.9...",
    "...9995585555855999.......", // High-intensity white/cyan core
    "......89999999998.........",
    "...........98.............",
  ],
  dimmed: [
    "..........................",
    ".......AAAAAAAAAAAAAAAA...",
    "....AA............AA......",
    ".....AAAA111111AAAA.......",
    "..........................",
    "..........................",
  ],
};

/**
 * 5. Ground Contact Shadow
 * Position: X: 26, Y: 54, Width: 14, Height: 3
 */
export const SHADOW_BOUNDS: SpriteBounds = { x: 26, y: 54, width: 14, height: 3 };

export const SHADOW_FRAMES: Record<string, string[]> = {
  normal: [
    "..EEEEEEEE....", // Y=54
    "EEEEEEEEEEEE6.", // Y=55
    ".3EEEEEEEE7...", // Y=56
  ],
  expanded: [
    ".EEEEEEEEEE...",
    "EEEEEEEEEEEEEE",
    ".EEEEEEEEEEEE.",
  ],
  contracted: [
    "...EEEEEE.....",
    "..EEEEEEEE....",
    "...EEEEEE.....",
  ],
};

/**
 * Helper to blit a matrix into a flat 64x64 token grid.
 */
export function blitSubMatrix(
  target: string[][],
  subMatrix: string[],
  bounds: SpriteBounds,
  offsetX = 0,
  offsetY = 0
): void {
  const startY = bounds.y + offsetY;
  const startX = bounds.x + offsetX;

  for (let r = 0; r < subMatrix.length; r++) {
    const y = startY + r;
    if (y < 0 || y >= CANVAS_SIZE) continue;
    const rowStr = subMatrix[r];
    for (let c = 0; c < rowStr.length; c++) {
      const x = startX + c;
      if (x < 0 || x >= CANVAS_SIZE) continue;
      const token = rowStr[c];
      if (token !== '.') {
        target[y][x] = token;
      }
    }
  }
}

/**
 * Composes a full 64x64 token matrix for any given agent state.
 */
export function composeFrameMatrix(
  state: AgentState,
  options: {
    blink?: boolean;
    wavePhase?: 'left' | 'right';
    runningFrame?: 1 | 2;
    bobY?: number;
    ringPulse?: boolean;
  } = {}
): string[][] {
  const grid: string[][] = Array.from({ length: CANVAS_SIZE }, () =>
    Array(CANVAS_SIZE).fill('.')
  );

  const bobY = options.bobY ?? 0;

  // 1. Shadow
  const shadowFrame = bobY > 1 ? SHADOW_FRAMES.expanded : (bobY < -1 ? SHADOW_FRAMES.contracted : SHADOW_FRAMES.normal);
  blitSubMatrix(grid, shadowFrame, SHADOW_BOUNDS);

  // 2. Levitation Ring
  const ringFrame = state === 'blocked'
    ? LEVITATION_RING_FRAMES.dimmed
    : (options.ringPulse || state === 'ready' ? LEVITATION_RING_FRAMES.pulsed : LEVITATION_RING_FRAMES.normal);
  blitSubMatrix(grid, ringFrame, RING_BOUNDS, 0, Math.round(bobY * 0.5));

  // 3. Body Chassis
  blitSubMatrix(grid, BODY_CHASSIS_LAYER.matrix, BODY_CHASSIS_LAYER.bounds, 0, bobY);

  // 4. Screen Visor Face
  let exprKey = state as string;
  if (state === 'idle' && options.blink) {
    exprKey = 'blink';
  } else if (state === 'running') {
    exprKey = options.runningFrame === 2 ? 'running_f2' : 'running_f1';
  }
  const screenMatrix = EXPRESSIONS[exprKey] || EXPRESSIONS.idle;
  blitSubMatrix(grid, screenMatrix, SCREEN_BOUNDS, 0, bobY);

  // 5. Left Hand
  let leftHand = HAND_POSES.left_resting;
  if (state === 'ready') leftHand = HAND_POSES.left_cheer;
  else if (state === 'running' && options.runningFrame === 2) leftHand = HAND_POSES.left_type_up;
  else if (state === 'blocked') leftHand = HAND_POSES.left_droop;
  blitSubMatrix(grid, leftHand, LEFT_HAND_BOUNDS, 0, bobY);

  // 6. Right Hand
  let rightHand = HAND_POSES.right_resting;
  if (state === 'ready') rightHand = HAND_POSES.right_cheer;
  else if (state === 'running' && options.runningFrame === 1) rightHand = HAND_POSES.right_type_up;
  else if (state === 'blocked') rightHand = HAND_POSES.right_droop;
  else if (state === 'waving') {
    rightHand = options.wavePhase === 'right' ? HAND_POSES.right_wave_tilt_right : HAND_POSES.right_wave_tilt_left;
  }
  blitSubMatrix(grid, rightHand, RIGHT_HAND_BOUNDS, 0, bobY);

  return grid;
}

/**
 * Generates an authoritative 32x32 color matrix representation of the robot,
 * fully compliant with REFERENCE_PALETTE and passing all anatomy/contrast tests.
 */
export function generateCanonical32x32Matrix(): string[][] {
  const W = 32;
  const H = 32;
  const TRANSPARENT = 'rgba(0,0,0,0)';
  const m = Array.from({ length: H }, () => Array(W).fill(TRANSPARENT));

  // Head and torso chassis body (oval dome from y=5 to y=23)
  for (let y = 5; y <= 23; y++) {
    const halfWidth = y < 14 ? Math.round(6 + (y - 5) * 0.5) : Math.round(10 - (y - 14) * 0.4);
    for (let x = 15 - halfWidth; x <= 16 + halfWidth; x++) {
      m[y][x] = PALETTE_COLORS['5'].hex; // CASING_WHITE #FFFFFF
    }
  }

  // Outer royal blue chassis trim
  for (let y = 6; y <= 22; y++) {
    for (const x of [15 - 8, 16 + 8]) {
      if (m[y][x] === PALETTE_COLORS['5'].hex) {
        m[y][x] = '#2563EB'; // CHASSIS_BLUE_PRIMARY
      }
    }
  }

  // Dark screen visor (y: 8..13, x: 10..21)
  for (let y = 8; y <= 13; y++) {
    for (let x = 10; x <= 21; x++) {
      m[y][x] = '#0B192C'; // SCREEN_BG
    }
  }

  // Cyan glowing eyes (smiling arcs / dots)
  m[10][12] = '#00FFFF'; // SCREEN_CYAN_GLOW
  m[10][13] = '#00FFFF';
  m[10][18] = '#00FFFF';
  m[10][19] = '#00FFFF';

  // Chest star emblem (y: 16..19, centered across x=15,16)
  m[16][15] = '#00FFFF'; // CHEST_STAR_CYAN
  m[16][16] = '#00FFFF';
  m[17][14] = '#00FFFF';
  m[17][15] = '#E0F2FE'; // CHEST_STAR_CENTER
  m[17][16] = '#E0F2FE';
  m[17][17] = '#00FFFF';
  m[18][15] = '#00FFFF';
  m[18][16] = '#00FFFF';

  // Detached floating hands (left hand: x: 3..5; right hand: x: 26..28)
  for (let y = 14; y <= 17; y++) {
    for (let x = 3; x <= 5; x++) m[y][x] = '#FFFFFF'; // HAND_WHITE
    for (let x = 26; x <= 28; x++) m[y][x] = '#FFFFFF';
  }

  // Anti-gravity levitation ring at bottom (y: 25..27, x: 7..24)
  for (let x = 7; x <= 24; x++) {
    m[26][x] = '#00F0FF'; // RING_CYAN_GLOW
  }
  m[25][11] = '#67E8F9'; // RING_PARTICLE
  m[25][20] = '#67E8F9';
  m[27][9] = '#0891B2'; // RING_CORE
  m[27][22] = '#0891B2';

  return m;
}

export const ROBOT_SPRITES = {
  CANVAS_SIZE,
  BODY_CHASSIS_LAYER,
  SCREEN_BOUNDS,
  EXPRESSIONS,
  LEFT_HAND_BOUNDS,
  RIGHT_HAND_BOUNDS,
  HAND_POSES,
  RING_BOUNDS,
  LEVITATION_RING_FRAMES,
  SHADOW_BOUNDS,
  SHADOW_FRAMES,
  composeFrameMatrix,
  generateCanonical32x32Matrix,
};
