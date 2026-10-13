/**
 * sprite-engine/assets/palette.ts
 * 16-color quantized reference palette derived from the user reference robot image.
 * Features 32-bit precomputed integers (0xAABBGGRR) for zero-allocation canvas blitting.
 */

export type PaletteToken =
  | '.' | '0' | '1' | '2' | '3' | '4' | '5' | '6'
  | '7' | '8' | '9' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface ColorDef {
  token: PaletteToken;
  name: string;
  hex: string;
  rgb: [number, number, number];
  alpha: number;
  uint32: number; // Little-endian 0xAABBGGRR for direct Uint32Array blits
}

export const PALETTE_COLORS: Record<PaletteToken, ColorDef> = {
  '.': { token: '.', name: 'TRANSPARENT',        hex: 'rgba(0,0,0,0)', rgb: [0, 0, 0],       alpha: 0,   uint32: 0x00000000 },
  '0': { token: '0', name: 'OUTLINE_DARK',       hex: '#12162A',       rgb: [18, 22, 42],    alpha: 255, uint32: 0xFF2A1612 },
  '1': { token: '1', name: 'SCREEN_BG',          hex: '#1E2140',       rgb: [30, 33, 64],    alpha: 255, uint32: 0xFF40211E },
  '2': { token: '2', name: 'CHASSIS_BLUE',       hex: '#5085E1',       rgb: [80, 133, 225],  alpha: 255, uint32: 0xFFE18550 },
  '3': { token: '3', name: 'CHASSIS_BLUE_DARK',  hex: '#3050A5',       rgb: [48, 80, 165],   alpha: 255, uint32: 0xFFA55030 },
  '4': { token: '4', name: 'CHASSIS_BLUE_LIGHT', hex: '#6B9DF2',       rgb: [107, 157, 242], alpha: 255, uint32: 0xFFF29D6B },
  '5': { token: '5', name: 'CASING_WHITE',        hex: '#FFFFFF',       rgb: [255, 255, 255], alpha: 255, uint32: 0xFFFFFFFF },
  '6': { token: '6', name: 'CASING_OFFWHITE',     hex: '#E6EEFB',       rgb: [230, 238, 251], alpha: 255, uint32: 0xFFFBEEE6 },
  '7': { token: '7', name: 'CASING_SHADE',        hex: '#A1ADC1',       rgb: [161, 173, 193], alpha: 255, uint32: 0xFFC1ADA1 },
  '8': { token: '8', name: 'CYAN_CORE',          hex: '#00F0FF',       rgb: [0, 240, 255],   alpha: 255, uint32: 0xFFFFF000 },
  '9': { token: '9', name: 'CYAN_BRIGHT',        hex: '#5AFAEF',       rgb: [90, 250, 239],  alpha: 255, uint32: 0xFFEFFA5A },
  'A': { token: 'A', name: 'CYAN_DIM',           hex: '#26A8B8',       rgb: [38, 168, 184],  alpha: 255, uint32: 0xFFB8A826 },
  'B': { token: 'B', name: 'STAR_YELLOW',        hex: '#FAE756',       rgb: [250, 231, 86],  alpha: 255, uint32: 0xFF56E7FA },
  'C': { token: 'C', name: 'STAR_AMBER',         hex: '#F5A43B',       rgb: [245, 164, 59],  alpha: 255, uint32: 0xFF3BA4F5 },
  'D': { token: 'D', name: 'STAR_SPARK',         hex: '#FFF7A6',       rgb: [255, 247, 166], alpha: 255, uint32: 0xFFA6F7FF },
  'E': { token: 'E', name: 'SHADOW_GROUND',       hex: '#272636',       rgb: [39, 38, 54],    alpha: 255, uint32: 0xFF362627 },
};

/**
 * 256-entry lookup array for O(1) ASCII byte code to 32-bit pixel mapping.
 */
export const COLOR_LUT_32 = new Uint32Array(256);
for (const [token, def] of Object.entries(PALETTE_COLORS)) {
  COLOR_LUT_32[token.charCodeAt(0)] = def.uint32;
}

/**
 * Helper to convert a palette token to CSS rgba string.
 */
export function tokenToRgba(token: PaletteToken | string): string {
  const def = PALETTE_COLORS[token as PaletteToken];
  if (!def || def.alpha === 0) return 'rgba(0,0,0,0)';
  return `rgba(${def.rgb[0]}, ${def.rgb[1]}, ${def.rgb[2]}, ${(def.alpha / 255).toFixed(2)})`;
}

/**
 * Helper to get hex string by token.
 */
export function tokenToHex(token: PaletteToken | string): string {
  const def = PALETTE_COLORS[token as PaletteToken];
  return def ? def.hex : 'rgba(0,0,0,0)';
}

export const PALETTE = {
  colors: PALETTE_COLORS,
  lut32: COLOR_LUT_32,
  tokenToRgba,
  tokenToHex,
};
