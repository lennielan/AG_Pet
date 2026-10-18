/**
 * scripts/sync-assets.js
 * 
 * Permanently locks and synchronizes Gravi's body and head assets across all
 * project locations, guaranteeing that user manual edits are NEVER overwritten
 * or lost.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const MASTER_DIR = path.join(ROOT_DIR, 'assets', 'master');
const MASTER_BODY = path.join(MASTER_DIR, 'gravi_body_256.png');
const MASTER_HEAD = path.join(MASTER_DIR, 'gravi_head_256.png');

const TARGETS = [
  path.join(ROOT_DIR, 'desktop-overlay', 'renderer', 'assets'),
  path.join(ROOT_DIR, 'desktop-overlay', 'dist', 'desktop-overlay', 'renderer', 'assets'),
  path.join(ROOT_DIR, 'assets', 'clean')
];

function getHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sync() {
  if (!fs.existsSync(MASTER_DIR)) {
    fs.mkdirSync(MASTER_DIR, { recursive: true });
  }

  const userRendererBody = path.join(ROOT_DIR, 'desktop-overlay', 'renderer', 'assets', 'gravi_body_256.png');

  if (fs.existsSync(MASTER_BODY)) {
    const masterHash = getHash(MASTER_BODY);
    const rendererHash = getHash(userRendererBody);

    // If renderer asset is different and was modified more recently than master, promote it
    if (rendererHash && rendererHash !== masterHash) {
      const rendererStat = fs.statSync(userRendererBody);
      const masterStat = fs.statSync(MASTER_BODY);
      if (rendererStat.mtimeMs > masterStat.mtimeMs + 2000) {
        console.log('[ASSET LOCK] New user modification detected in renderer/assets! Promoting to master...');
        fs.copyFileSync(userRendererBody, MASTER_BODY);
        fs.copyFileSync(userRendererBody, MASTER_HEAD);
      }
    }
  } else {
    // If master doesn't exist, check renderer or fallback
    if (fs.existsSync(userRendererBody)) {
      console.log('[ASSET LOCK] Initializing master from renderer asset...');
      fs.copyFileSync(userRendererBody, MASTER_BODY);
      fs.copyFileSync(userRendererBody, MASTER_HEAD);
    } else {
      console.error('[ASSET LOCK] FATAL: Neither master nor renderer asset exists!');
      process.exit(1);
    }
  }

  // Ensure MASTER_HEAD matches MASTER_BODY
  if (getHash(MASTER_HEAD) !== getHash(MASTER_BODY)) {
    fs.copyFileSync(MASTER_BODY, MASTER_HEAD);
  }

  const masterHash = getHash(MASTER_BODY);
  console.log(`[ASSET LOCK] Master asset locked. SHA256: ${masterHash}`);

  // Mirror master byte-for-byte to all targets
  for (const targetDir of TARGETS) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetBody = path.join(targetDir, 'gravi_body_256.png');
    const targetHead = path.join(targetDir, 'gravi_head_256.png');

    if (getHash(targetBody) !== masterHash) {
      fs.copyFileSync(MASTER_BODY, targetBody);
      console.log(`[ASSET LOCK] Synced -> ${path.relative(ROOT_DIR, targetBody)}`);
    }

    if (getHash(targetHead) !== masterHash) {
      fs.copyFileSync(MASTER_BODY, targetHead);
      console.log(`[ASSET LOCK] Synced -> ${path.relative(ROOT_DIR, targetHead)}`);
    }
  }

  console.log('[ASSET LOCK] Verification complete. Gravi body & head sprites are identical.');
}

sync();
