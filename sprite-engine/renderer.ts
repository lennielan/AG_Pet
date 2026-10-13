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
  private headImage: any = null;
  private torsoImage: any = null;
  private leftHandImage: any = null;
  private rightHandImage: any = null;
  private skeletalPartsLoaded = false;

  public readonly NATIVE_SIZE = CANVAS_SIZE; // 64x64

  private readonly PIVOTS = {
    torso: { x: 128, y: 151 },
    head: { x: 128, y: 113 },
    leftHand: { x: 60, y: 137 },
    rightHand: { x: 196, y: 137 },
  };

  constructor(
    displayCanvas: HTMLCanvasElement,
    options: RendererOptions & { animator?: PetAnimator } = {}
  ) {
    this.displayCanvas = displayCanvas;
    this.animator = options.animator;
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
      const dt = Math.min((timestamp - this.lastTime) / 1000.0, 0.100);
      this.lastTime = timestamp;

      if (this.animator) {
        const pose = this.animator.update(dt);
        this.render(pose);
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

    // Layer 1: Torso (drawn first with extended collar)
    ctx.save();
    const tPivotX = (this.PIVOTS.torso.x + rig.torso.dx) * scale;
    const tPivotY = (this.PIVOTS.torso.y + rig.torso.dy) * scale;
    ctx.translate(tPivotX, tPivotY);
    ctx.rotate(rig.torso.rotation);
    ctx.scale(rig.torso.scaleX, rig.torso.scaleY);
    ctx.translate(-this.PIVOTS.torso.x * scale, -this.PIVOTS.torso.y * scale);
    ctx.drawImage(this.torsoImage, 0, 0, w, h);
    ctx.restore();

    // Layer 2: Head + Screen Visor & Eyes (bound strictly in head's transformation matrix!)
    ctx.save();
    const hPivotX = (this.PIVOTS.head.x + rig.head.dx) * scale;
    const hPivotY = (this.PIVOTS.head.y + rig.head.dy) * scale;
    ctx.translate(hPivotX, hPivotY);
    ctx.rotate(rig.head.rotation);
    ctx.scale(rig.head.scaleX, rig.head.scaleY);
    ctx.translate(-this.PIVOTS.head.x * scale, -this.PIVOTS.head.y * scale);

    // 2a. Draw Head Layer
    ctx.drawImage(this.headImage, 0, 0, w, h);

    // 2b. Draw Visor Screen & Procedural Eyes inside Head matrix
    this.drawScreenFace(ctx, scale, rig);
    ctx.restore();

    // Layer 3: Left Hand (Foreground)
    ctx.save();
    const lhPivotX = (this.PIVOTS.leftHand.x + rig.leftHand.dx) * scale;
    const lhPivotY = (this.PIVOTS.leftHand.y + rig.leftHand.dy) * scale;
    ctx.translate(lhPivotX, lhPivotY);
    ctx.rotate(rig.leftHand.rotation);
    ctx.scale(rig.leftHand.scaleX, rig.leftHand.scaleY);
    ctx.translate(-this.PIVOTS.leftHand.x * scale, -this.PIVOTS.leftHand.y * scale);
    ctx.drawImage(this.leftHandImage, 0, 0, w, h);
    ctx.restore();

    // Layer 4: Right Hand (Foreground)
    ctx.save();
    const rhPivotX = (this.PIVOTS.rightHand.x + rig.rightHand.dx) * scale;
    const rhPivotY = (this.PIVOTS.rightHand.y + rig.rightHand.dy) * scale;
    ctx.translate(rhPivotX, rhPivotY);
    ctx.rotate(rig.rightHand.rotation);
    ctx.scale(rig.rightHand.scaleX, rig.rightHand.scaleY);
    ctx.translate(-this.PIVOTS.rightHand.x * scale, -this.PIVOTS.rightHand.y * scale);
    ctx.drawImage(this.rightHandImage, 0, 0, w, h);
    ctx.restore();

    // Floating Particles (e.g. sleep Zzz, celebration sparks)
    if (pose && pose.particles && pose.particles.length > 0) {
      this.drawParticles(ctx, pose.particles, scale);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: any[], scale: number): void {
    ctx.save();
    for (const p of particles) {
      if (p.life > 0) {
        const px = Math.round(p.x * scale * 4.0);
        const py = Math.round(p.y * scale * 4.0);
        const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
        ctx.globalAlpha = alpha;
        if (p.text) {
          ctx.font = `bold ${Math.round(p.size * scale * 2.2)}px 'Consolas', monospace`;
          ctx.fillStyle = p.color || '#94A3B8';
          ctx.fillText(p.text, px, py);
        } else {
          ctx.fillStyle = p.color;
          const sz = Math.max(1, Math.round(p.size * scale * 4.0));
          ctx.fillRect(px, py, sz, sz);
        }
      }
    }
    ctx.restore();
  }

  /**
   * Renders procedural facial expressions and visor screen strictly inside the head's coordinate matrix.
   * Zero drift when head tilts, lifts, or rotates.
   */
  private drawScreenFace(ctx: CanvasRenderingContext2D, scale: number, rig: RigPose): void {
    const screenLeft = Math.round(92 * scale);
    const screenTop = Math.round(68 * scale);
    const screenW = Math.round(72 * scale);
    const screenH = Math.round(22 * scale);

    ctx.save();
    ctx.globalAlpha = 1.0;

    // Clear eyes region with exact screen dark navy background color (#1D2144)
    ctx.fillStyle = '#1D2144';
    ctx.fillRect(screenLeft, screenTop, screenW, screenH);

    const pw = Math.max(1, Math.round(scale * 2.5)); // pixel brush width
    const lx = Math.round((107 + rig.lookX) * scale);
    const rx = Math.round((149 + rig.lookX) * scale);
    const ey = Math.round((79 + rig.lookY) * scale);

    const expr = rig.expression || 'idle';

    if (expr === 'running') {
      // Data stream gear / pulse bars (Cyan #00F0FF)
      ctx.fillStyle = '#00F0FF';
      const barCount = 4;
      const spacing = Math.round(screenW / (barCount + 1));
      for (let i = 1; i <= barCount; i++) {
        const barH = ((i + Math.floor(Math.abs(rig.lookX))) % 2 === 0 ? 12 : 6) * scale;
        ctx.fillRect(screenLeft + i * spacing - pw / 2 + rig.lookX * scale, screenTop + screenH / 2 - barH / 2, pw, barH);
      }
    } else if (expr === 'needs_input') {
      // Amber question eyes '? ?' (#FBBF24)
      ctx.fillStyle = '#FBBF24';
      for (const cx of [lx, rx]) {
        ctx.fillRect(cx - pw, ey - 3.5 * pw, 2 * pw, pw);
        ctx.fillRect(cx + pw, ey - 2.5 * pw, pw, 2 * pw);
        ctx.fillRect(cx, ey - 0.5 * pw, pw, pw);
        ctx.fillRect(cx, ey + 1.5 * pw, pw, pw);
      }
    } else if (expr === 'ready') {
      // Excited golden star eyes '★ ★' (#FDE047)
      ctx.fillStyle = '#FDE047';
      for (const cx of [lx, rx]) {
        ctx.fillRect(cx - pw / 2, ey - 3.5 * pw, pw, 7 * pw);
        ctx.fillRect(cx - 3.5 * pw, ey - pw / 2, 7 * pw, pw);
        ctx.fillRect(cx - 2 * pw, ey - 2 * pw, pw, pw);
        ctx.fillRect(cx + pw, ey - 2 * pw, pw, pw);
        ctx.fillRect(cx - 2 * pw, ey + pw, pw, pw);
        ctx.fillRect(cx + pw, ey + pw, pw, pw);
      }
    } else if (expr === 'blocked') {
      // Error red crosses 'X X' (#F87171)
      ctx.fillStyle = '#F87171';
      for (const cx of [lx, rx]) {
        for (let i = -2; i <= 2; i++) {
          ctx.fillRect(cx + i * pw, ey + i * pw, pw, pw);
          ctx.fillRect(cx - i * pw, ey + i * pw, pw, pw);
        }
      }
    } else if (expr === 'waving') {
      // Friendly wink: Left eye open smiling arc, right eye closed horizontal line
      ctx.fillStyle = '#00F0FF';
      // Left eye arc
      this.drawEyeArc(ctx, lx, ey, pw, 1.0);
      // Right eye wink line
      ctx.fillRect(rx - 3 * pw, ey, 6 * pw, pw);
    } else if (expr === 'sleeping') {
      // Sleeping eyes '- -' (#38BDF8)
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(lx - 3 * pw, ey, 6 * pw, pw);
      ctx.fillRect(rx - 3 * pw, ey, 6 * pw, pw);
    } else if (expr === 'dragging') {
      // Wind squint '> <' (#00F0FF)
      ctx.fillStyle = '#00F0FF';
      for (let i = -2; i <= 2; i++) {
        ctx.fillRect(lx - Math.abs(i) * pw + pw, ey + i * pw, pw, pw);
        ctx.fillRect(rx + Math.abs(i) * pw - pw, ey + i * pw, pw, pw);
      }
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
      ctx.fillRect(cx - 4 * pw, cy - pw / 2, 8 * pw, pw);
    } else {
      // Pixel-perfect smiling arc '^'
      ctx.fillRect(cx - 2.5 * pw, cy - 2 * pw, 5 * pw, pw);
      ctx.fillRect(cx - 4 * pw, cy - pw, 1.5 * pw, pw);
      ctx.fillRect(cx - 4.5 * pw, cy, pw, 2 * pw);
      ctx.fillRect(cx + 2.5 * pw, cy - pw, 1.5 * pw, pw);
      ctx.fillRect(cx + 3.5 * pw, cy, pw, 2 * pw);
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
      // Data stream gear / pulse bars (Cyan #00F0FF)
      ctx.fillStyle = '#00F0FF';
      const frame = pose.gearFrame || 0;
      const barCount = 4;
      const spacing = Math.round(screenW / (barCount + 1));
      for (let i = 1; i <= barCount; i++) {
        const barH = ((i + frame) % 2 === 0 ? 12 : 6) * scale;
        ctx.fillRect(screenLeft + i * spacing - pw / 2, screenTop + screenH / 2 - barH / 2, pw, barH);
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

    // Layer 2: Ring Particles (below body)
    for (const p of pose.particles) {
      if (p.life > 0) {
        ctx.fillStyle = p.color;
        if (p.text) {
          ctx.font = '8px monospace';
          ctx.fillText(p.text, Math.round(p.x), Math.round(p.y));
        } else {
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
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
