/**
 * desktop-overlay/main/config.ts
 * Manages configuration persistence, validation, and defaults for the AG Pet overlay.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PetConfig, PetScale } from '../../shared/types';
import {
  DEFAULT_CONFIG,
  CONFIG_FILE_NAME,
  SUPPORTED_SCALES,
  validatePetConfig,
} from '../../shared/constants';

/**
 * Returns the default system path for the AG Pet configuration file.
 */
export function getDefaultConfigPath(): string {
  const baseDir =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.config'));
  return path.join(baseDir, 'ag-pet', CONFIG_FILE_NAME);
}

/**
 * Safely loads and validates the PetConfig from disk.
 * Falls back to defaults upon missing file, corrupted JSON, or partial schema.
 */
export function loadPetConfig(customPath?: string): PetConfig {
  const filePath = customPath || getDefaultConfigPath();

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_CONFIG };
    }

    // Merge with defaults to guarantee all required fields exist
    const config: PetConfig = {
      x: typeof parsed.x === 'number' && Number.isFinite(parsed.x) ? parsed.x : DEFAULT_CONFIG.x,
      y: typeof parsed.y === 'number' && Number.isFinite(parsed.y) ? parsed.y : DEFAULT_CONFIG.y,
      scale: SUPPORTED_SCALES.includes(parsed.scale as PetScale)
        ? (parsed.scale as PetScale)
        : DEFAULT_CONFIG.scale,
      isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : DEFAULT_CONFIG.isMuted,
      parentPid: undefined, // Ephemeral runtime PID: strictly not loaded from persistent config
      wsPort:
        typeof parsed.wsPort === 'number' && parsed.wsPort >= 1024 && parsed.wsPort <= 65535
          ? parsed.wsPort
          : DEFAULT_CONFIG.wsPort,
    };

    const validation = validatePetConfig(config);
    if (validation.valid) {
      return config;
    }
    return { ...DEFAULT_CONFIG };
  } catch (_e) {
    // Corrupted JSON or read failure: safely return defaults
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Safely saves the PetConfig to disk.
 * Creates parent directory if needed and handles read-only/invalid paths without throwing.
 */
export function savePetConfig(
  config: PetConfig,
  customPath?: string
): { success: boolean; error?: string } {
  const filePath = customPath || getDefaultConfigPath();

  try {
    const validation = validatePetConfig(config);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { parentPid: _ignored, ...persistedConfig } = config;
    const payload = JSON.stringify(persistedConfig, null, 2);
    fs.writeFileSync(filePath, payload, 'utf8');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Stateful configuration manager with reactive update tracking.
 */
export class ConfigManager {
  private config: PetConfig;
  private filePath: string;

  constructor(customPath?: string, initialOverrides?: Partial<PetConfig>) {
    this.filePath = customPath || getDefaultConfigPath();
    const loaded = loadPetConfig(this.filePath);
    this.config = { ...loaded, ...initialOverrides };
  }

  public getConfig(): Readonly<PetConfig> {
    return { ...this.config };
  }

  public getFilePath(): string {
    return this.filePath;
  }

  public updateConfig(partial: Partial<PetConfig>): PetConfig {
    const updated: PetConfig = {
      ...this.config,
      ...partial,
    };

    const validation = validatePetConfig(updated);
    if (validation.valid) {
      this.config = updated;
    } else {
      // Partial updates that might be partially invalid: clamp or preserve valid
      if (typeof partial.x === 'number' && Number.isFinite(partial.x)) this.config.x = partial.x;
      if (typeof partial.y === 'number' && Number.isFinite(partial.y)) this.config.y = partial.y;
      if (partial.scale && SUPPORTED_SCALES.includes(partial.scale)) this.config.scale = partial.scale;
      if (typeof partial.isMuted === 'boolean') this.config.isMuted = partial.isMuted;
      if (typeof partial.wsPort === 'number' && partial.wsPort >= 1024) this.config.wsPort = partial.wsPort;
    }

    return { ...this.config };
  }

  public save(customPath?: string): { success: boolean; error?: string } {
    return savePetConfig(this.config, customPath || this.filePath);
  }

  public reload(customPath?: string): PetConfig {
    if (customPath) {
      this.filePath = customPath;
    }
    this.config = loadPetConfig(this.filePath);
    return { ...this.config };
  }

  public resetToDefaults(): PetConfig {
    this.config = { ...DEFAULT_CONFIG };
    this.save();
    return { ...this.config };
  }
}
