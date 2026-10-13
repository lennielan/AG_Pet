/**
 * pixel-validator.js
 * Invariant validator for pixel-art sprite matrices, palettes, and crisp integer scaling.
 */

const { REFERENCE_PALETTE } = require('./spec-contracts');

class PixelValidator {
  /**
   * Normalizes hex or rgba colors to uppercase hex or rgba format.
   */
  static normalizeColor(color) {
    if (!color) return 'TRANSPARENT';
    const c = String(color).trim();
    if (c === 'rgba(0,0,0,0)' || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') {
      return 'TRANSPARENT';
    }
    if (c.startsWith('#')) {
      return c.toUpperCase();
    }
    return c;
  }

  /**
   * Validates that all non-transparent pixels in matrix exist within the defined palette.
   */
  static validatePalette(matrix, allowedPalette = Object.values(REFERENCE_PALETTE)) {
    const normalizedPalette = new Set(allowedPalette.map(c => this.normalizeColor(c)));
    normalizedPalette.add('TRANSPARENT');

    const violations = [];
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        const color = this.normalizeColor(matrix[y][x]);
        if (!normalizedPalette.has(color)) {
          violations.push({ x, y, color });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violationsCount: violations.length,
      violations: violations.slice(0, 10), // sample first 10
      error: violations.length === 0 ? null : `Found ${violations.length} pixels with unauthorized palette colors`
    };
  }

  /**
   * Validates matrix dimensions.
   */
  static validateDimensions(matrix, expectedW = 32, expectedH = 32) {
    if (!Array.isArray(matrix) || matrix.length !== expectedH) {
      return {
        valid: false,
        error: `Expected height ${expectedH}, got ${Array.isArray(matrix) ? matrix.length : 'non-array'}`
      };
    }
    for (let y = 0; y < matrix.length; y++) {
      if (!Array.isArray(matrix[y]) || matrix[y].length !== expectedW) {
        return {
          valid: false,
          error: `Row ${y} length expected ${expectedW}, got ${Array.isArray(matrix[y]) ? matrix[y].length : 'non-array'}`
        };
      }
    }
    return { valid: true };
  }

  /**
   * Simulates nearest-neighbor integer scaling of a pixel matrix.
   */
  static scaleMatrix(matrix, scaleFactor) {
    if (scaleFactor === 1.0) return matrix;
    const origH = matrix.length;
    const origW = matrix[0].length;
    const scaledH = Math.round(origH * scaleFactor);
    const scaledW = Math.round(origW * scaleFactor);

    const scaled = [];
    for (let sy = 0; sy < scaledH; sy++) {
      const origY = Math.min(origH - 1, Math.floor(sy / scaleFactor));
      const row = [];
      for (let sx = 0; sx < scaledW; sx++) {
        const origX = Math.min(origW - 1, Math.floor(sx / scaleFactor));
        row.push(matrix[origY][origX]);
      }
      scaled.push(row);
    }
    return scaled;
  }

  /**
   * Validates that a scaled matrix strictly preserves crisp integer pixelation
   * without blurring, bilinear interpolation, or color bleeding.
   */
  static validateCrispScaling(originalMatrix, scaledMatrix, scaleFactor) {
    const expectedH = Math.round(originalMatrix.length * scaleFactor);
    const expectedW = Math.round(originalMatrix[0].length * scaleFactor);

    if (scaledMatrix.length !== expectedH || scaledMatrix[0].length !== expectedW) {
      return {
        valid: false,
        error: `Scaled dimensions mismatch: expected ${expectedW}x${expectedH}, got ${scaledMatrix[0].length}x${scaledMatrix.length}`
      };
    }

    // Every block of scaleFactor x scaleFactor pixels must match the single source pixel
    const intScale = Math.floor(scaleFactor);
    if (Number.isInteger(scaleFactor)) {
      for (let y = 0; y < originalMatrix.length; y++) {
        for (let x = 0; x < originalMatrix[0].length; x++) {
          const expectedColor = this.normalizeColor(originalMatrix[y][x]);
          for (let dy = 0; dy < intScale; dy++) {
            for (let dx = 0; dx < intScale; dx++) {
              const actualColor = this.normalizeColor(scaledMatrix[y * intScale + dy][x * intScale + dx]);
              if (actualColor !== expectedColor) {
                return {
                  valid: false,
                  error: `Pixel blur/mismatch at scaled (${x * intScale + dx}, ${y * intScale + dy}): expected ${expectedColor}, got ${actualColor}`
                };
              }
            }
          }
        }
      }
    } else {
      // Fractional scale (1.5x) - nearest neighbor check
      for (let sy = 0; sy < expectedH; sy++) {
        const origY = Math.min(originalMatrix.length - 1, Math.floor(sy / scaleFactor));
        for (let sx = 0; sx < expectedW; sx++) {
          const origX = Math.min(originalMatrix[0].length - 1, Math.floor(sx / scaleFactor));
          const expectedColor = this.normalizeColor(originalMatrix[origY][origX]);
          const actualColor = this.normalizeColor(scaledMatrix[sy][sx]);
          if (actualColor !== expectedColor) {
            return {
              valid: false,
              error: `Nearest-neighbor mismatch at (${sx}, ${sy}): expected ${expectedColor}, got ${actualColor}`
            };
          }
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validates robot anatomy invariants in the matrix:
   * - Screen area has cyan glow
   * - Torso area has star emblem
   * - Hands are present
   * - Anti-gravity ring is at bottom
   */
  static validateRobotAnatomy(matrix) {
    const H = matrix.length;
    const W = matrix[0].length;

    let hasScreenCyan = false;
    let hasStarCyan = false;
    let hasHands = false;
    let hasRingCyan = false;
    let hasWhiteChassis = false;

    const cyanTones = new Set([
      REFERENCE_PALETTE.SCREEN_CYAN_GLOW,
      REFERENCE_PALETTE.SCREEN_CYAN_LIGHT,
      REFERENCE_PALETTE.SCREEN_CYAN_DARK,
      REFERENCE_PALETTE.RING_CYAN_GLOW,
      REFERENCE_PALETTE.RING_CYAN_PULSE,
      REFERENCE_PALETTE.CHEST_STAR_CYAN
    ].map(c => this.normalizeColor(c)));

    const whiteTones = new Set([
      REFERENCE_PALETTE.CHASSIS_WHITE,
      REFERENCE_PALETTE.CHASSIS_WHITE_SHADOW,
      REFERENCE_PALETTE.HAND_WHITE
    ].map(c => this.normalizeColor(c)));

    // Upper third (head & screen region: y in [0.15*H, 0.45*H])
    for (let y = Math.floor(0.15 * H); y < Math.floor(0.45 * H); y++) {
      for (let x = Math.floor(0.25 * W); x < Math.floor(0.75 * W); x++) {
        const c = this.normalizeColor(matrix[y][x]);
        if (cyanTones.has(c)) hasScreenCyan = true;
        if (whiteTones.has(c)) hasWhiteChassis = true;
      }
    }

    // Middle third (torso and chest star: y in [0.45*H, 0.75*H])
    for (let y = Math.floor(0.45 * H); y < Math.floor(0.75 * H); y++) {
      for (let x = Math.floor(0.35 * W); x < Math.floor(0.65 * W); x++) {
        const c = this.normalizeColor(matrix[y][x]);
        if (cyanTones.has(c)) hasStarCyan = true;
      }
    }

    // Flanks (hands: x in [0.05*W, 0.25*W] and [0.75*W, 0.95*W])
    for (let y = Math.floor(0.35 * H); y < Math.floor(0.75 * H); y++) {
      for (let x of [Math.floor(0.1 * W), Math.floor(0.9 * W)]) {
        const c = this.normalizeColor(matrix[y][x]);
        if (whiteTones.has(c) || c !== 'TRANSPARENT') hasHands = true;
      }
    }

    // Bottom region (anti-gravity ring: y in [0.75*H, 0.98*H])
    for (let y = Math.floor(0.75 * H); y < H; y++) {
      for (let x = Math.floor(0.2 * W); x < Math.floor(0.8 * W); x++) {
        const c = this.normalizeColor(matrix[y][x]);
        if (cyanTones.has(c)) hasRingCyan = true;
      }
    }

    const missingAnatomy = [];
    if (!hasScreenCyan) missingAnatomy.push('Screen cyan LED pixels');
    if (!hasWhiteChassis) missingAnatomy.push('White chassis chassis pixels');
    if (!hasStarCyan) missingAnatomy.push('Chest star emblem pixels');
    if (!hasHands) missingAnatomy.push('Detached floating hands');
    if (!hasRingCyan) missingAnatomy.push('Anti-gravity ring pixels');

    return {
      valid: missingAnatomy.length === 0,
      missingAnatomy,
      error: missingAnatomy.length === 0 ? null : `Missing robot anatomical features: ${missingAnatomy.join(', ')}`
    };
  }

  /**
   * Generates a reference compliant canonical robot sprite matrix (32x32)
   * used as an oracle / baseline in tests.
   */
  static generateCanonicalReferenceSprite() {
    const W = 32;
    const H = 32;
    const m = Array.from({ length: H }, () => Array(W).fill(REFERENCE_PALETTE.TRANSPARENT));

    // Head / chassis body (oval / rounded dome from y=5 to y=23)
    for (let y = 5; y <= 23; y++) {
      const halfWidth = y < 14 ? Math.round(6 + (y - 5) * 0.5) : Math.round(10 - (y - 14) * 0.4);
      for (let x = 15 - halfWidth; x <= 16 + halfWidth; x++) {
        m[y][x] = REFERENCE_PALETTE.CHASSIS_WHITE;
      }
    }

    // Outer blue trim / shadow
    for (let y = 6; y <= 22; y++) {
      for (let x of [15 - 8, 16 + 8]) {
        if (m[y][x] === REFERENCE_PALETTE.CHASSIS_WHITE) {
          m[y][x] = REFERENCE_PALETTE.CHASSIS_BLUE_PRIMARY;
        }
      }
    }

    // Cyan LED screen face (y: 8..13, x: 10..21)
    for (let y = 8; y <= 13; y++) {
      for (let x = 10; x <= 21; x++) {
        m[y][x] = REFERENCE_PALETTE.SCREEN_BG;
      }
    }
    // Eyes: cyan glowing pixels
    m[10][12] = REFERENCE_PALETTE.SCREEN_CYAN_GLOW;
    m[10][13] = REFERENCE_PALETTE.SCREEN_CYAN_GLOW;
    m[10][18] = REFERENCE_PALETTE.SCREEN_CYAN_GLOW;
    m[10][19] = REFERENCE_PALETTE.SCREEN_CYAN_GLOW;

    // Chest star emblem (y: 16..19, centered across x=15,16)
    m[16][15] = REFERENCE_PALETTE.CHEST_STAR_CYAN;
    m[16][16] = REFERENCE_PALETTE.CHEST_STAR_CYAN;
    m[17][14] = REFERENCE_PALETTE.CHEST_STAR_CYAN;
    m[17][15] = REFERENCE_PALETTE.CHEST_STAR_CENTER;
    m[17][16] = REFERENCE_PALETTE.CHEST_STAR_CENTER;
    m[17][17] = REFERENCE_PALETTE.CHEST_STAR_CYAN;
    m[18][15] = REFERENCE_PALETTE.CHEST_STAR_CYAN;
    m[18][16] = REFERENCE_PALETTE.CHEST_STAR_CYAN;

    // Detached floating hands (left hand: x: 3..5; right hand: x: 26..28)
    for (let y = 14; y <= 17; y++) {
      for (let x = 3; x <= 5; x++) m[y][x] = REFERENCE_PALETTE.HAND_WHITE;
      for (let x = 26; x <= 28; x++) m[y][x] = REFERENCE_PALETTE.HAND_WHITE;
    }

    // Anti-gravity levitation ring at bottom (y: 25..27, x: 7..24)
    for (let x = 7; x <= 24; x++) {
      m[26][x] = REFERENCE_PALETTE.RING_CYAN_GLOW;
    }
    m[25][11] = REFERENCE_PALETTE.RING_PARTICLE;
    m[25][20] = REFERENCE_PALETTE.RING_PARTICLE;
    m[27][9] = REFERENCE_PALETTE.RING_CORE;
    m[27][22] = REFERENCE_PALETTE.RING_CORE;

    return m;
  }
}

module.exports = PixelValidator;
