/**
 * sprite-engine/renderer.ts
 * Two-tier Canvas rendering engine for AG Pet.
 * Features 60fps delta-time compositing, crisp integer nearest-neighbor scaling (1x, 1.5x, 2x),
 * and zero bilinear blur artifacts across display resolutions.
 */

import { AnimationPose, PetScale, RendererOptions, RigPose } from '../shared/types';
import { CANVAS_SIZE, BODY_CHASSIS_LAYER, SCREEN_BOUNDS, EXPRESSIONS, LEFT_HAND_BOUNDS, RIGHT_HAND_BOUNDS, HAND_POSES, RING_BOUNDS, LEVITATION_RING_FRAMES, SHADOW_BOUNDS, SHADOW_FRAMES } from './assets/robot-sprites';
import { PALETTE_COLORS, PaletteToken } from './assets/palette';
import { PetAnimator } from './animator';

export class PetRenderer {
  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D | null = null;
  private offscreenCanvas: HTMLCanvasElement | null = null;
  private offscreenCtx: CanvasRenderingContext2D | null = null;
  private animator?: PetAnimator;
  private scale: PetScale = 1.0;
  private baseMultiplier = 2.0; // 128px at 1.0x, 192px at 1.5x, 256px at 2.0x
  private isRunning = false;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private masterSpriteImage: any = null;
  private masterSpriteLoaded = false;
  private bodyImage: any = null;
  private headImage: any = null;
  private torsoImage: any = null;
  private leftHandImage: any = null;
  private rightHandImage: any = null;
  private leftHandUpImage: any = null;
  private rightHandThinkImage: any = null;
  private rightHandUpImage: any = null;
  private skeletalPartsLoaded = false;

  public readonly NATIVE_SIZE = CANVAS_SIZE; // 64x64

  private readonly PIVOTS = {
    torso: { x: 128, y: 151 },
    head: { x: 128, y: 113 },
    leftHand: { x: 60, y: 137 },
    rightHand: { x: 196, y: 137 },
    rightHandThink: { x: 152, y: 116 },
    rightHandUp: { x: 194, y: 108 },
    leftHandUp: { x: 62, y: 108 },
  };

  public onFrame?: (pose: AnimationPose) => void;

  constructor(
    displayCanvas: HTMLCanvasElement,
    options: RendererOptions & { animator?: PetAnimator; onFrame?: (pose: AnimationPose) => void } = {}
  ) {
    this.displayCanvas = displayCanvas;
    this.animator = options.animator;
    this.onFrame = options.onFrame;
    this.scale = options.scale ?? 1.0;
    if (options.baseMultiplier !== undefined) {
      this.baseMultiplier = options.baseMultiplier;
    }

    this.initCanvases();
    this.setScale(this.scale);
  }

  private initCanvases(): void {
    if (typeof this.displayCanvas?.getContext === 'function') {
      this.displayCtx = this.displayCanvas.getContext('2d', { alpha: true });
    }

    // Initialize 64x64 offscreen buffer
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.offscreenCanvas = document.createElement('canvas');
      this.offscreenCanvas.width = this.NATIVE_SIZE;
      this.offscreenCanvas.height = this.NATIVE_SIZE;
      this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: true });
    }

    // Load master 2D game assets if running in DOM / Electron environment
    if (typeof Image !== 'undefined') {
      try {
        let loadedParts = 0;
        const onPartLoaded = () => {
          loadedParts++;
          if (loadedParts >= 4) {
            this.skeletalPartsLoaded = true;
            this.masterSpriteLoaded = true;
            if (this.animator) {
              this.render(this.animator.getCurrentFrame());
            }
          }
        };

        this.bodyImage = new Image();
        this.bodyImage.onload = onPartLoaded;
        this.bodyImage.src = 'assets/gravi_body_256.png';

        this.headImage = new Image();
        this.headImage.onload = onPartLoaded;
        this.headImage.src = 'assets/gravi_head_256.png';

        this.torsoImage = new Image();
        this.torsoImage.onload = onPartLoaded;
        this.torsoImage.src = 'assets/gravi_torso_256.png';

        this.leftHandImage = new Image();
        this.leftHandImage.onload = onPartLoaded;
        this.leftHandImage.src = 'assets/gravi_left_hand_256.png';

        this.rightHandImage = new Image();
        this.rightHandImage.onload = onPartLoaded;
        this.rightHandImage.src = 'assets/gravi_right_hand_256.png';

        this.rightHandThinkImage = new Image();
        this.rightHandThinkImage.onload = onPartLoaded;
        this.rightHandThinkImage.src = 'assets/gravi_right_hand_think_256.png';

        this.rightHandUpImage = new Image();
        this.rightHandUpImage.onload = onPartLoaded;
        this.rightHandUpImage.src = 'assets/gravi_right_hand_up_256.png';

        this.leftHandUpImage = new Image();
        this.leftHandUpImage.onload = onPartLoaded;
        this.leftHandUpImage.src = 'assets/gravi_left_hand_up_256.png';

        // Master cropped asset fallback
        this.masterSpriteImage = new Image();
        this.masterSpriteImage.onload = () => {
          if (!this.skeletalPartsLoaded) {
            this.masterSpriteLoaded = true;
            if (this.animator) {
              this.render(this.animator.getCurrentFrame());
            }
          }
        };
        this.masterSpriteImage.src = 'assets/gravi_cropped_256.png';
      } catch (_e) {}
    }

    this.configureZeroBlur();
  }

  /**
   * Enforces zero-blur nearest-neighbor pixel rendering across all browser engines.
   */
  public configureZeroBlur(): void {
    if (this.displayCtx) {
      this.displayCtx.imageSmoothingEnabled = false;
      const ctxAny = this.displayCtx as any;
      ctxAny.webkitImageSmoothingEnabled = false;
      ctxAny.mozImageSmoothingEnabled = false;
      ctxAny.msImageSmoothingEnabled = false;
    }

    if (this.offscreenCtx) {
      this.offscreenCtx.imageSmoothingEnabled = false;
      const octxAny = this.offscreenCtx as any;
      octxAny.webkitImageSmoothingEnabled = false;
      octxAny.mozImageSmoothingEnabled = false;
      octxAny.msImageSmoothingEnabled = false;
    }

    if (this.displayCanvas?.style) {
      this.displayCanvas.style.imageRendering = 'pixelated';
    }
  }

  public setScale(scale: PetScale): void {
    this.scale = scale;
    const pixelDimension = Math.round(this.NATIVE_SIZE * this.baseMultiplier * scale);

    if (this.displayCanvas) {
      this.displayCanvas.width = pixelDimension;
      this.displayCanvas.height = pixelDimension;
      if (this.displayCanvas.style) {
        this.displayCanvas.style.width = `${pixelDimension}px`;
        this.displayCanvas.style.height = `${pixelDimension}px`;
      }
    }

    this.configureZeroBlur();
  }

  public getScale(): PetScale {
    return this.scale;
  }

  public setAnimator(animator: PetAnimator): void {
    this.animator = animator;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // Render initial pose synchronously to guarantee immediate paint on window creation
    if (this.animator) {
      const initialPose = this.animator.getCurrentFrame();
      this.render(initialPose);
    } else {
      this.render();
    }

    const loop = (timestamp: number) => {
      if (!this.isRunning) return;

      const state = this.animator ? this.animator.getState() : 'idle';
      const isQuietState = state === 'idle' || state === 'sleeping';

      // Adaptive FPS: 30 FPS (interval >= 32ms) for idle/sleeping, 60 FPS for active states
      const minInterval = isQuietState ? 32 : 0;
      const elapsed = timestamp - this.lastTime;
      if (minInterval > 0 && elapsed < minInterval) {
        if (typeof requestAnimationFrame === 'function') {
          this.animFrameId = requestAnimationFrame(loop);
        }
        return;
      }

      const dt = Math.min(elapsed / 1000.0, 0.100);
      this.lastTime = timestamp;

      if (this.animator) {
        const pose = this.animator.update(dt);
        this.render(pose);
        if (this.onFrame) {
          this.onFrame(pose);
        }
      }

      if (typeof requestAnimationFrame === 'function') {
        this.animFrameId = requestAnimationFrame(loop);
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      this.animFrameId = requestAnimationFrame(loop);
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Renders a single animation frame onto the canvas.
   */
  public render(pose?: AnimationPose): void {
    if (!this.displayCtx) return;

    // High-fidelity master asset rendering in live browser environments
    if (this.masterSpriteLoaded && this.masterSpriteImage) {
      this.drawMasterSprite(this.displayCtx, pose);
      return;
    }

    // In environments with an offscreen canvas, composite layers to 64x64 buffer first
    const targetCtx = this.offscreenCtx || this.displayCtx;
    const isOffscreen = targetCtx === this.offscreenCtx;

    targetCtx.clearRect(0, 0, this.NATIVE_SIZE, this.NATIVE_SIZE);

    if (pose) {
      this.drawCompositeLayers(targetCtx, pose);
    } else {
      // Fallback: draw static body chassis if no pose provided
      this.drawSubMatrix(targetCtx, BODY_CHASSIS_LAYER.matrix, BODY_CHASSIS_LAYER.bounds.x, BODY_CHASSIS_LAYER.bounds.y);
    }

    // Blit native offscreen buffer to display canvas with point nearest-neighbor sampling
    if (isOffscreen && this.offscreenCanvas && this.displayCtx) {
      this.displayCtx.clearRect(0, 0, this.displayCanvas.width, this.displayCanvas.height);
      this.displayCtx.drawImage(
        this.offscreenCanvas,
        0, 0, this.NATIVE_SIZE, this.NATIVE_SIZE,
        0, 0, this.displayCanvas.width, this.displayCanvas.height
      );
    }
  }

  /**
   * Renders the crisp, clean master 2D game asset directly onto display canvas.
   * Uses 4-component skeletal rigging (torso, head, leftHand, rightHand) with
   * procedural eyes strictly bound inside the head's transformation matrix.
   */
  private drawMasterSprite(ctx: CanvasRenderingContext2D, pose?: AnimationPose): void {
    if (this.skeletalPartsLoaded && this.headImage && this.torsoImage && this.leftHandImage && this.rightHandImage) {
      this.drawSkeletalSprite(ctx, pose);
      return;
    }

    // Monolithic sprite fallback
    const w = this.displayCanvas.width;
    const h = this.displayCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const bobY = pose ? Math.round(pose.bobY * (w / 64.0)) : 0;
    const shudderX = pose ? Math.round(pose.shudderX * (w / 64.0)) : 0;

    ctx.save();
    if (pose && pose.bodyRotation !== 0) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(pose.bodyRotation);
      ctx.translate(-w / 2, -h / 2);
    }

    ctx.drawImage(this.masterSpriteImage, shudderX, bobY, w, h);

    if (pose && pose.state !== 'idle') {
      this.drawExpressionOverlay(ctx, pose, shudderX, bobY, w, h);
    }

    ctx.restore();
  }

  /**
   * Multi-Part Skeletal Rigging Renderer.
   * Layer order:
   * 1. Torso (with dark neck collar extension)
   * 2. Head (with visor screen and procedural eyes bound inside head matrix)
   * 3. Left Hand
   * 4. Right Hand
   */
  private drawSkeletalSprite(ctx: CanvasRenderingContext2D, pose?: AnimationPose): void {
    const w = this.displayCanvas.width;
    const h = this.displayCanvas.height;
    const scale = w / 256.0;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const rig = pose?.rig || {
      torso: { dx: 0, dy: pose ? pose.bobY : 0, rotation: pose ? pose.bodyRotation : 0, scaleX: pose ? pose.torsoScaleX : 1.0, scaleY: pose ? pose.torsoScaleY : 1.0 },
      head: { dx: pose ? pose.headOffsetX : 0, dy: pose ? pose.bobY + pose.headOffsetY : 0, rotation: pose ? pose.headTilt : 0, scaleX: 1.0, scaleY: 1.0 },
      leftHand: { dx: pose ? pose.leftHandX - 18 : 0, dy: pose ? pose.leftHandY - 38 : 0, rotation: pose ? pose.leftHandRot : 0, scaleX: 1.0, scaleY: 1.0 },
      rightHand: { dx: pose ? pose.rightHandX - 46 : 0, dy: pose ? pose.rightHandY - 38 : 0, rotation: pose ? pose.rightHandRot : 0, scaleX: 1.0, scaleY: 1.0 },
      lookX: 0,
      lookY: 0,
      eyeScaleY: 1.0,
      expression: (pose?.state as any) || 'idle',
    };

    const COORD_RATIO = 4.0; // 256 / 64

    // Layer 1: Unified Seamless Body & Screen Visor
    const bodyImg = (this.bodyImage && this.bodyImage.complete && this.bodyImage.naturalWidth > 0) ? this.bodyImage : this.headImage;
    ctx.save();
    const tPivotX = (this.PIVOTS.torso.x + rig.torso.dx * COORD_RATIO) * scale;
    const tPivotY = (this.PIVOTS.torso.y + rig.torso.dy * COORD_RATIO) * scale;
    ctx.translate(Math.round(tPivotX), Math.round(tPivotY));
    if (Math.abs(rig.torso.rotation) > 0.08) {
      ctx.rotate(rig.torso.rotation);
    }
    ctx.scale(rig.torso.scaleX, rig.torso.scaleY);
    ctx.translate(-Math.round(this.PIVOTS.torso.x * scale), -Math.round(this.PIVOTS.torso.y * scale));

    // 1a. Draw Seamless Monolithic Body (head, neck, star emblem, torso)
    ctx.drawImage(bodyImg, 0, 0, w, h);

    // 1b. Draw Visor Screen & Procedural Eyes inside Body matrix
    this.drawScreenFace(ctx, scale, rig);

    ctx.restore();

    // Layer 3: Left Hand (Foreground)
    const isLhUp = (pose?.state === 'ready');
    const lhImg = (isLhUp && this.leftHandUpImage) ? this.leftHandUpImage : this.leftHandImage;
    const lhPivot = isLhUp ? this.PIVOTS.leftHandUp : this.PIVOTS.leftHand;
    ctx.save();
    const lhPivotX = (lhPivot.x + rig.leftHand.dx * COORD_RATIO) * scale;
    const lhPivotY = (lhPivot.y + rig.leftHand.dy * COORD_RATIO) * scale;
    ctx.translate(Math.round(lhPivotX), Math.round(lhPivotY));
    if (Math.abs(rig.leftHand.rotation) > 0.08) {
      ctx.rotate(rig.leftHand.rotation);
    }
    ctx.scale(rig.leftHand.scaleX, rig.leftHand.scaleY);
    ctx.translate(-Math.round(lhPivot.x * scale), -Math.round(lhPivot.y * scale));
    ctx.drawImage(lhImg, 0, 0, w, h);
    ctx.restore();

    // Layer 4: Right Hand (Foreground)
    const state = pose?.state;
    const isRhThink = (state === 'thinking' || state === 'needs_input');
    const isRhUp = (state === 'waving' || state === 'ready');
    let rhImg = this.rightHandImage;
    let rhPivot = this.PIVOTS.rightHand;
    if (isRhThink && this.rightHandThinkImage) {
      rhImg = this.rightHandThinkImage;
      rhPivot = this.PIVOTS.rightHandThink;
    } else if (isRhUp && this.rightHandUpImage) {
      rhImg = this.rightHandUpImage;
      rhPivot = this.PIVOTS.rightHandUp;
    }
    ctx.save();
    const rhPivotX = (rhPivot.x + rig.rightHand.dx * COORD_RATIO) * scale;
    const rhPivotY = (rhPivot.y + rig.rightHand.dy * COORD_RATIO) * scale;
    ctx.translate(Math.round(rhPivotX), Math.round(rhPivotY));
    if (Math.abs(rig.rightHand.rotation) > 0.08) {
      ctx.rotate(rig.rightHand.rotation);
    }
    ctx.scale(rig.rightHand.scaleX, rig.rightHand.scaleY);
    ctx.translate(-Math.round(rhPivot.x * scale), -Math.round(rhPivot.y * scale));
    ctx.drawImage(rhImg, 0, 0, w, h);
    ctx.restore();

    // Floating Particles (e.g. sleep Zzz, celebration sparks)
    if (pose && pose.particles && pose.particles.length > 0) {
      this.drawParticles(ctx, pose.particles, scale);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: any[], scale: number): void {
    ctx.save();
    for (const p of particles) {
      // Completely eliminate square particles under Gravi - only render text particles (Zzz)
      if (!p.text || p.life <= 0) continue;

      const progress = Math.max(0, Math.min(1, 1.0 - p.life / p.maxLife));
      const age = p.maxLife - p.life;

      // Smooth Fade-In and Fade-Out envelope
      let alpha = 1.0;
      if (progress < 0.20) {
        alpha = progress / 0.20;
      } else if (progress > 0.65) {
        alpha = Math.max(0, 1.0 - (progress - 0.65) / 0.35);
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // S-curve drift & sine wave floating
      const waveOffsetX = Math.sin(age * 3.2) * 6.0 * scale;
      const px = p.x * scale * 4.0 + waveOffsetX;
      const py = p.y * scale * 4.0;

      const fontScale = 0.65 + 0.60 * progress;
      const tilt = Math.sin(age * 2.8) * 0.18;

      ctx.translate(px, py);
      ctx.rotate(tilt);
      ctx.scale(fontScale, fontScale);

      const fontSize = Math.max(10, Math.round(14 * scale));
      ctx.font = `bold ${fontSize}px 'Consolas', 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Dark blue crisp outline
      ctx.strokeStyle = '#0B192C';
      ctx.lineWidth = Math.max(2, 3 * scale);
      ctx.strokeText(p.text, 0, 0);

      // Particle fill (cyan for Zzz, coral/pink for hearts)
      ctx.fillStyle = p.color || '#7DD3FC';
      ctx.fillText(p.text, 0, 0);

      ctx.restore();
    }
    ctx.restore();
  }



  /**
   * Renders procedural facial expressions and visor screen strictly inside the head's coordinate matrix.
   * Zero drift when head tilts, lifts, or rotates.
   */
  private drawScreenFace(ctx: CanvasRenderingContext2D, scale: number, rig: RigPose): void {
    const screenLeft = Math.round(88 * scale);
    const screenTop = Math.round(64 * scale);
    const screenW = Math.round(80 * scale);
    const screenH = Math.round(28 * scale);

    ctx.save();
    ctx.globalAlpha = 1.0;

    // Clear eyes region with exact screen dark navy background color (#1D2144)
    ctx.fillStyle = '#1D2144';
    ctx.fillRect(screenLeft, screenTop, screenW, screenH);

    const pw = Math.max(1, Math.round(scale * 2.5)); // pixel brush width
    const lx = Math.round((107 + rig.lookX * 4.0) * scale);
    const rx = Math.round((149 + rig.lookX * 4.0) * scale);
    const ey = Math.round((79 + rig.lookY * 4.0) * scale);

    const expr = rig.expression || 'idle';

    if (expr === 'running') {
      const u = Math.max(1, Math.round(2 * scale));
      const pw = Math.max(2, Math.round(3 * scale));
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.008;
      for (let i = -2; i <= 2; i++) {
        const bx = Math.round((128 + i * 11 + rig.lookX * 1.5) * scale) - Math.floor(pw / 2);
        const wave = (Math.sin(t - i * 0.9) + 1.0) * 0.5; // 0..1
        const rawH = (4 + Math.round(wave * 10)) * scale;
        const barH = Math.max(pw, Math.round(rawH / u) * u);
        const by = Math.round(79 * scale - barH / 2);

        // Основной цвет полоски — фирменный голубой #00F0FF
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(bx, by, pw, barH);

        // Внутренний светлый блик в центре высоких полосок (#8CFAFF)
        if (barH >= 8 * scale) {
          ctx.fillStyle = '#8CFAFF';
          ctx.fillRect(bx, by + u, pw, barH - 2 * u);
        }
      }
    } else if (expr === 'needs_input') {
      // Amber question eyes '? ?' (#FBBF24)
      ctx.fillStyle = '#FBBF24';
      for (const cx of [lx, rx]) {
        ctx.fillRect(Math.round(cx - pw), Math.round(ey - 3.5 * pw), Math.round(2 * pw), pw);
        ctx.fillRect(Math.round(cx + pw), Math.round(ey - 2.5 * pw), pw, Math.round(2 * pw));
        ctx.fillRect(Math.round(cx), Math.round(ey - 0.5 * pw), pw, pw);
        ctx.fillRect(Math.round(cx), Math.round(ey + 1.5 * pw), pw, pw);
      }
    } else if (expr === 'ready') {
      // Excited golden star eyes '★ ★' (#FDE047)
      ctx.fillStyle = '#FDE047';
      for (const cx of [lx, rx]) {
        ctx.fillRect(Math.round(cx - pw / 2), Math.round(ey - 3.5 * pw), pw, Math.round(7 * pw));
        ctx.fillRect(Math.round(cx - 3.5 * pw), Math.round(ey - pw / 2), Math.round(7 * pw), pw);
        ctx.fillRect(Math.round(cx - 2 * pw), Math.round(ey - 2 * pw), pw, pw);
        ctx.fillRect(Math.round(cx + pw), Math.round(ey - 2 * pw), pw, pw);
        ctx.fillRect(Math.round(cx - 2 * pw), Math.round(ey + pw), pw, pw);
        ctx.fillRect(Math.round(cx + pw), Math.round(ey + pw), pw, pw);
      }
    } else if (expr === 'blocked') {
      // Error red crosses 'X X' (#F87171)
      ctx.fillStyle = '#F87171';
      for (const cx of [lx, rx]) {
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(Math.round(cx + i * pw), Math.round(ey + i * pw), pw, pw);
          ctx.fillRect(Math.round(cx - i * pw), Math.round(ey + i * pw), pw, pw);
        }
      }
    } else if (expr === 'waving') {
      // Friendly wink: Left eye open smiling arc, right eye closed horizontal line
      ctx.fillStyle = '#00F0FF';
      // Left eye arc
      this.drawEyeArc(ctx, lx, ey, pw, 1.0);
      // Right eye wink line
      ctx.fillRect(Math.round(rx - 3 * pw), Math.round(ey), Math.round(6 * pw), pw);
    } else if (expr === 'sleeping') {
      // Sleeping eyes '- -' (#38BDF8)
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(Math.round(lx - 3 * pw), Math.round(ey), Math.round(6 * pw), pw);
      ctx.fillRect(Math.round(rx - 3 * pw), Math.round(ey), Math.round(6 * pw), pw);
    } else if (expr === 'dragging') {
      // Wind squint '> <' (#00F0FF)
      ctx.fillStyle = '#00F0FF';
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(Math.round(lx - Math.abs(i) * pw + pw), Math.round(ey + i * pw), pw, pw);
        ctx.fillRect(Math.round(rx + Math.abs(i) * pw - pw), Math.round(ey + i * pw), pw, pw);
      }
    } else if (expr === 'thinking') {
      // Astro Bot thoughtful LED eyes looking up, smoothly tracking left-right
      const u = Math.max(1, Math.round(2 * scale));
      const thinkEy = Math.round((75 + rig.lookY * 2.0) * scale);
      const thinkLx = Math.round((107 + rig.lookX * 3.0) * scale);
      const thinkRx = Math.round((149 + rig.lookX * 3.0) * scale);

      // Left eye (thinkLx) — thoughtful squint (large half-closed LED eye)
      // Main cyan #00F0FF: rect 6*u x 3*u + top rounded cap 4*u x u
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(thinkLx - 3 * u, thinkEy - u, 6 * u, 3 * u);
      ctx.fillRect(thinkLx - 2 * u, thinkEy - 2 * u, 4 * u, u);
      // Top highlight #8CFAFF: rect 3*u x u
      ctx.fillStyle = '#8CFAFF';
      ctx.fillRect(thinkLx - 2 * u, thinkEy - u, 3 * u, u);

      // Right eye (thinkRx) — wide open thinking LED eye looking up
      // Main cyan #00F0FF: rect 6*u x 4*u + top & bottom caps 4*u x u
      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(thinkRx - 3 * u, thinkEy - 2 * u, 6 * u, 4 * u);
      ctx.fillRect(thinkRx - 2 * u, thinkEy - 3 * u, 4 * u, u);
      ctx.fillRect(thinkRx - 2 * u, thinkEy + 2 * u, 4 * u, u);
      // Top highlight #8CFAFF: rect 3*u x 2*u
      ctx.fillStyle = '#8CFAFF';
      ctx.fillRect(thinkRx - 2 * u, thinkEy - 2 * u, 3 * u, 2 * u);
    } else if (expr === 'headpat') {
      ctx.fillStyle = '#00F0FF';
      const headpatEy = Math.round(ey - Math.max(1, Math.round(1 * scale)));
      this.drawEyeArc(ctx, lx, headpatEy, pw, 1.0);
      this.drawEyeArc(ctx, rx, headpatEy, pw, 1.0);
    } else {
      // Default 'idle' and 'blink': Smiling cyan arches '^ ^' with vertical squash
      ctx.fillStyle = '#00F0FF';
      const eyeScale = Math.max(0.1, Math.min(1.0, rig.eyeScaleY));
      this.drawEyeArc(ctx, lx, ey, pw, eyeScale);
      this.drawEyeArc(ctx, rx, ey, pw, eyeScale);
    }

    ctx.restore();
  }

  private drawEyeArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, pw: number, scaleY: number): void {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1.0, scaleY);
    ctx.translate(-cx, -cy);

    if (scaleY <= 0.25) {
      // Flat blink bar when fully squashed
      ctx.fillRect(Math.round(cx - 4 * pw), Math.round(cy - pw / 2), Math.round(8 * pw), pw);
    } else {
      // Pixel-perfect smiling arc '^'
      ctx.fillRect(Math.round(cx - 2.5 * pw), Math.round(cy - 2 * pw), Math.round(5 * pw), pw);
      ctx.fillRect(Math.round(cx - 4 * pw), Math.round(cy - pw), Math.round(1.5 * pw), pw);
      ctx.fillRect(Math.round(cx - 4.5 * pw), Math.round(cy), pw, Math.round(2 * pw));
      ctx.fillRect(Math.round(cx + 2.5 * pw), Math.round(cy - pw), Math.round(1.5 * pw), pw);
      ctx.fillRect(Math.round(cx + 3.5 * pw), Math.round(cy), pw, Math.round(2 * pw));
    }

    ctx.restore();
  }

  /**
   * Overlays pixel-perfect screen facial expressions on the visor display.
   * Visor center in cropped asset is X: 50%, Y: 30.5% from top.
   */
  private drawExpressionOverlay(
    ctx: CanvasRenderingContext2D,
    pose: AnimationPose,
    offsetX: number,
    offsetY: number,
    w: number,
    h: number
  ): void {
    // If state is idle or dragging, preserve master sprite eyes with zero mask
    if (pose.state === 'idle' || pose.state === 'dragging') {
      return;
    }

    const scale = w / 256.0;
    const screenLeft = Math.round(92 * scale + offsetX);
    const screenTop = Math.round(68 * scale + offsetY);
    const screenW = Math.round(72 * scale);
    const screenH = Math.round(22 * scale);

    ctx.save();
    ctx.globalAlpha = 1.0;

    // Clear eyes region with exact screen dark navy background color (#1D2144)
    ctx.fillStyle = '#1D2144';
    ctx.fillRect(screenLeft, screenTop, screenW, screenH);

    const pw = Math.max(1, Math.round(scale * 3)); // pixel brush width

    if (pose.state === 'running') {
      const u = Math.max(1, Math.round(2 * scale));
      const pwBar = Math.max(2, Math.round(3 * scale));
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.008;
      const centerX = screenLeft + Math.round(screenW / 2);
      const centerY = screenTop + Math.round(screenH / 2);
      for (let i = -2; i <= 2; i++) {
        const bx = Math.round(centerX + i * 11 * scale) - Math.floor(pwBar / 2);
        const wave = (Math.sin(t - i * 0.9) + 1.0) * 0.5; // 0..1
        const rawH = (4 + Math.round(wave * 10)) * scale;
        const barH = Math.max(pwBar, Math.round(rawH / u) * u);
        const by = Math.round(centerY - barH / 2);

        // Основной цвет полоски — фирменный голубой #00F0FF
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(bx, by, pwBar, barH);

        // Внутренний светлый блик в центре высоких полосок (#8CFAFF)
        if (barH >= 8 * scale) {
          ctx.fillStyle = '#8CFAFF';
          ctx.fillRect(bx, by + u, pwBar, barH - 2 * u);
        }
      }
    } else if (pose.state === 'needs_input') {
      // Amber question eyes '? ?' (#FBBF24)
      ctx.fillStyle = '#FBBF24';
      const eyeL = screenLeft + Math.round(18 * scale);
      const eyeR = screenLeft + screenW - Math.round(24 * scale);
      for (const ex of [eyeL, eyeR]) {
        ctx.fillRect(ex, screenTop + Math.round(2 * scale), pw * 2, pw);
        ctx.fillRect(ex + pw, screenTop + Math.round(5 * scale), pw, pw);
        ctx.fillRect(ex + pw / 2, screenTop + Math.round(10 * scale), pw, pw);
      }
    } else if (pose.state === 'ready') {
      // Excited golden star eyes '★ ★' (#FDE047)
      ctx.fillStyle = '#FDE047';
      const eyeL = screenLeft + Math.round(16 * scale);
      const eyeR = screenLeft + screenW - Math.round(26 * scale);
      for (const ex of [eyeL, eyeR]) {
        ctx.fillRect(ex + pw, screenTop + Math.round(2 * scale), pw, pw * 3);
        ctx.fillRect(ex, screenTop + Math.round(3 * scale), pw * 3, pw);
      }
    } else if (pose.state === 'blocked') {
      // Error red crosses 'X X' (#F87171)
      ctx.fillStyle = '#F87171';
      const eyeL = screenLeft + Math.round(16 * scale);
      const eyeR = screenLeft + screenW - Math.round(26 * scale);
      for (const ex of [eyeL, eyeR]) {
        for (let i = 0; i < 4; i++) {
          ctx.fillRect(ex + i * pw, screenTop + Math.round(2 * scale) + i * pw, pw, pw);
          ctx.fillRect(ex + (3 - i) * pw, screenTop + Math.round(2 * scale) + i * pw, pw, pw);
        }
      }
    } else if (pose.state === 'waving') {
      // Friendly wink: Left eye open smiling arc, right eye closed line
      ctx.fillStyle = '#00F0FF';
      const eyeL = screenLeft + Math.round(16 * scale);
      const eyeR = screenLeft + screenW - Math.round(26 * scale);
      // Left eye arc
      ctx.fillRect(eyeL + pw, screenTop + Math.round(2 * scale), pw * 2, pw);
      ctx.fillRect(eyeL, screenTop + Math.round(5 * scale), pw, pw * 2);
      ctx.fillRect(eyeL + pw * 3, screenTop + Math.round(5 * scale), pw, pw * 2);
      // Right eye wink bar
      ctx.fillRect(eyeR, screenTop + Math.round(6 * scale), pw * 4, pw);
    } else if (pose.state === 'sleeping') {
      // Sleeping eyes '- -' (#38BDF8)
      ctx.fillStyle = '#38BDF8';
      const eyeL = screenLeft + Math.round(16 * scale);
      const eyeR = screenLeft + screenW - Math.round(26 * scale);
      ctx.fillRect(eyeL, screenTop + Math.round(6 * scale), pw * 4, pw);
      ctx.fillRect(eyeR, screenTop + Math.round(6 * scale), pw * 4, pw);
    } else if (pose.state === 'thinking') {
      const u = Math.max(1, Math.round(2 * scale));
      const eyeL = screenLeft + Math.round(18 * scale);
      const eyeR = screenLeft + screenW - Math.round(24 * scale);
      const ey = screenTop + Math.round(10 * scale);

      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(eyeL - 3 * u, ey - u, 6 * u, 3 * u);
      ctx.fillRect(eyeL - 2 * u, ey - 2 * u, 4 * u, u);
      ctx.fillStyle = '#8CFAFF';
      ctx.fillRect(eyeL - 2 * u, ey - u, 3 * u, u);

      ctx.fillStyle = '#00F0FF';
      ctx.fillRect(eyeR - 3 * u, ey - 2 * u, 6 * u, 4 * u);
      ctx.fillRect(eyeR - 2 * u, ey - 3 * u, 4 * u, u);
      ctx.fillRect(eyeR - 2 * u, ey + 2 * u, 4 * u, u);
      ctx.fillStyle = '#8CFAFF';
      ctx.fillRect(eyeR - 2 * u, ey - 2 * u, 3 * u, 2 * u);
    }

    ctx.restore();
  }

  /**
   * Composites the modular layers onto the 64x64 coordinate space.
   */
  private drawCompositeLayers(ctx: CanvasRenderingContext2D, pose: AnimationPose): void {
    const bobY = Math.round(pose.bobY);
    const shudderX = Math.round(pose.shudderX);

    // Layer 0 (Ground Shadow) and Layer 1 (Levitation Ring) completely removed per specification

    // Layer 2: Floating Text Particles (e.g. Zzz) - square particles completely removed
    for (const p of pose.particles) {
      if (p.life > 0 && p.text) {
        ctx.fillStyle = p.color;
        ctx.font = '8px monospace';
        ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
      }
    }

    // Layer 3: Head, Helmet Visor Casing, and Body Chassis
    ctx.save();
    if (pose.bodyRotation !== 0) {
      ctx.translate(32, 32);
      ctx.rotate(pose.bodyRotation);
      ctx.translate(-32, -32);
    }

    const bodyX = BODY_CHASSIS_LAYER.bounds.x + shudderX;
    const bodyY = BODY_CHASSIS_LAYER.bounds.y + bobY;
    this.drawSubMatrix(ctx, BODY_CHASSIS_LAYER.matrix, bodyX, bodyY);

    // Layer 4: Screen Visor Face Expression
    let exprKey = pose.state as string;
    if (pose.state === 'idle' && (pose.time % 4.0 >= 3.85 && pose.time % 4.0 <= 3.97)) {
      exprKey = 'blink';
    } else if (pose.state === 'running') {
      exprKey = pose.gearFrame % 2 === 1 ? 'running_f2' : 'running_f1';
    }
    const screenMatrix = EXPRESSIONS[exprKey] || EXPRESSIONS.idle;
    const faceX = SCREEN_BOUNDS.x + shudderX + Math.round(pose.headOffsetX);
    const faceY = SCREEN_BOUNDS.y + bobY + Math.round(pose.headOffsetY);

    if (pose.headTilt !== 0) {
      ctx.save();
      ctx.translate(32, 22);
      ctx.rotate(pose.headTilt);
      ctx.translate(-32, -22);
      this.drawSubMatrix(ctx, screenMatrix, faceX, faceY);
      ctx.restore();
    } else {
      this.drawSubMatrix(ctx, screenMatrix, faceX, faceY);
    }

    // Layer 5: Left Hand (Detached)
    let leftHand = HAND_POSES.left_resting;
    if (pose.state === 'ready') leftHand = HAND_POSES.left_cheer;
    else if (pose.state === 'running' && pose.gearFrame % 2 === 1) leftHand = HAND_POSES.left_type_up;
    else if (pose.state === 'blocked') leftHand = HAND_POSES.left_droop;

    ctx.save();
    const lx = Math.round(pose.leftHandX);
    const ly = Math.round(pose.leftHandY);
    if (pose.leftHandRot !== 0) {
      ctx.translate(lx + 5, ly + 5);
      ctx.rotate(pose.leftHandRot);
      ctx.translate(-(lx + 5), -(ly + 5));
    }
    this.drawSubMatrix(ctx, leftHand, lx, ly);
    ctx.restore();

    // Layer 6: Right Hand (Detached)
    let rightHand = HAND_POSES.right_resting;
    if (pose.state === 'ready') rightHand = HAND_POSES.right_cheer;
    else if (pose.state === 'running' && pose.gearFrame % 2 === 0) rightHand = HAND_POSES.right_type_up;
    else if (pose.state === 'blocked') rightHand = HAND_POSES.right_droop;
    else if (pose.state === 'waving') {
      rightHand = pose.rightHandRot > 0 ? HAND_POSES.right_wave_tilt_right : HAND_POSES.right_wave_tilt_left;
    }

    ctx.save();
    const rx = Math.round(pose.rightHandX);
    const ry = Math.round(pose.rightHandY);
    if (pose.rightHandRot !== 0) {
      ctx.translate(rx + 5, ry + 5);
      ctx.rotate(pose.rightHandRot);
      ctx.translate(-(rx + 5), -(ry + 5));
    }
    this.drawSubMatrix(ctx, rightHand, rx, ry);
    ctx.restore();

    ctx.restore(); // Restore bodyRotation
  }

  /**
   * Draws a token matrix directly into the context using integer quantization.
   */
  private drawSubMatrix(
    ctx: CanvasRenderingContext2D,
    matrix: string[],
    startX: number,
    startY: number,
    alpha = 1.0
  ): void {
    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1.0) {
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    }

    for (let r = 0; r < matrix.length; r++) {
      const y = startY + r;
      if (y < 0 || y >= this.NATIVE_SIZE) continue;
      const row = matrix[r];
      for (let c = 0; c < row.length; c++) {
        const x = startX + c;
        if (x < 0 || x >= this.NATIVE_SIZE) continue;
        const token = row[c] as PaletteToken;
        if (token !== '.') {
          const colorDef = PALETTE_COLORS[token];
          if (colorDef && colorDef.alpha > 0) {
            ctx.fillStyle = colorDef.hex;
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }

    if (alpha !== 1.0) {
      ctx.globalAlpha = prevAlpha;
    }
  }
}

// Public alias for index.ts export
export { PetRenderer as PixelRenderer };
