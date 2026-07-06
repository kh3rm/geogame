import { saveCatch } from './db.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function drawCreatureShape(PIXI, creature) {
  const root = new PIXI.Container();
  root.label = 'creature-root';

  const shadow = new PIXI.Graphics()
    .ellipse(0, 74, 72, 18)
    .fill({ color: creature.shadow, alpha: 0.36 });

  const body = new PIXI.Graphics()
    .roundRect(-54, -42, 108, 104, 42)
    .fill({ color: creature.color, alpha: 1 })
    .circle(-25, -10, 14)
    .circle(25, -10, 14)
    .fill({ color: creature.accent, alpha: 0.55 })
    .circle(-19, -11, 6)
    .circle(19, -11, 6)
    .fill({ color: 0x08130d, alpha: 1 })
    .circle(-17, -14, 2.3)
    .circle(21, -14, 2.3)
    .fill({ color: 0xffffff, alpha: 0.9 })
    .roundRect(-15, 20, 30, 6, 4)
    .fill({ color: 0x17351f, alpha: 0.62 });

  const leftLeaf = new PIXI.Graphics()
    .ellipse(-32, -60, 12, 30)
    .fill({ color: 0xbfffd2, alpha: 0.92 });
  leftLeaf.rotation = -0.58;

  const rightLeaf = new PIXI.Graphics()
    .ellipse(32, -62, 12, 30)
    .fill({ color: 0xbfffd2, alpha: 0.92 });
  rightLeaf.rotation = 0.58;

  const belly = new PIXI.Graphics()
    .ellipse(0, 27, 27, 20)
    .fill({ color: 0xffffff, alpha: 0.18 });

  const sparkle = new PIXI.Graphics()
    .moveTo(0, -9)
    .lineTo(3, -3)
    .lineTo(9, 0)
    .lineTo(3, 3)
    .lineTo(0, 9)
    .lineTo(-3, 3)
    .lineTo(-9, 0)
    .lineTo(-3, -3)
    .closePath()
    .fill({ color: creature.accent, alpha: 0.9 });
  sparkle.x = 48;
  sparkle.y = -46;

  root.addChild(shadow, leftLeaf, rightLeaf, body, belly, sparkle);
  root.shadow = shadow;
  root.sparkle = sparkle;
  return root;
}

function makeRing(PIXI, radius, color, width = 3, alpha = 0.8) {
  return new PIXI.Graphics()
    .circle(0, 0, radius)
    .stroke({ color, width, alpha });
}

function makeParticle(PIXI, color, x, y, vx, vy, life, size) {
  const g = new PIXI.Graphics()
    .circle(0, 0, size)
    .fill({ color, alpha: 0.86 });
  g.x = x;
  g.y = y;
  g.vx = vx;
  g.vy = vy;
  g.life = life;
  g.maxLife = life;
  return g;
}

export class EncounterController {
  constructor(elements) {
    this.el = elements;
    this.PIXI = window.PIXI;
    this.app = null;
    this.stream = null;
    this.creature = null;
    this.spawn = null;
    this.position = null;
    this.onComplete = null;
    this.phase = 'idle';
    this.phaseTime = 0;
    this.creatureRoot = null;
    this.portal = null;
    this.particles = [];
    this.pulses = [];
    this.captureAttempts = 0;
    this.orientation = { x: 0, y: 0 };
    this.motionEnabled = false;
    this.boundPointer = null;
    this.boundOrientation = (event) => this.handleOrientation(event);
  }

  async start({ creature, spawn, position, onComplete }) {
    if (!this.PIXI) {
      alert('PixiJS failed to load. Check your network connection, then refresh.');
      return;
    }

    this.creature = creature;
    this.spawn = spawn;
    this.position = position;
    this.onComplete = onComplete;
    this.phase = 'scanning';
    this.phaseTime = 0;
    this.captureAttempts = 0;
    this.particles = [];
    this.pulses = [];

    this.el.layer.classList.remove('hidden');
    this.el.layer.setAttribute('aria-hidden', 'false');
    this.el.title.textContent = `${creature.name} signal`;
    this.el.hint.textContent = 'Hold steady while the scanner resolves the signal…';
    this.el.pulseBtn.disabled = true;

    await this.startCamera();
    await this.startPixi();

    this.boundPointer = (event) => {
      if (this.phase !== 'ready') return;
      const rect = this.el.pixiHost.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (this.app.screen.width / rect.width);
      const y = (event.clientY - rect.top) * (this.app.screen.height / rect.height);
      this.tryPulse(x, y);
    };
    this.el.pixiHost.addEventListener('pointerdown', this.boundPointer);
  }

  async startCamera() {
    this.el.video.srcObject = null;
    this.el.video.classList.remove('hidden');
    this.el.fallback.classList.add('hidden');

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia is unavailable');
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      this.el.video.srcObject = this.stream;
      await this.el.video.play();
    } catch (error) {
      console.warn('Camera fallback active:', error);
      this.el.video.classList.add('hidden');
      this.el.fallback.classList.remove('hidden');
      this.stream = null;
    }
  }

  async startPixi() {
    this.el.pixiHost.replaceChildren();

    const PIXI = this.PIXI;
    this.app = new PIXI.Application();
    await this.app.init({
      resizeTo: this.el.pixiHost,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    this.el.pixiHost.appendChild(this.app.canvas);

    this.portal = new PIXI.Container();
    this.portal.label = 'portal';
    this.creatureRoot = drawCreatureShape(PIXI, this.creature);
    this.creatureRoot.scale.set(0.01);
    this.creatureRoot.alpha = 0;

    const inner = makeRing(PIXI, 78, this.creature.accent, 5, 0.84);
    const outer = makeRing(PIXI, 118, this.creature.color, 2, 0.58);
    const halo = new PIXI.Graphics()
      .circle(0, 0, 95)
      .fill({ color: this.creature.color, alpha: 0.08 });
    const reticle = new PIXI.Graphics()
      .moveTo(-34, 0).lineTo(-13, 0)
      .moveTo(13, 0).lineTo(34, 0)
      .moveTo(0, -34).lineTo(0, -13)
      .moveTo(0, 13).lineTo(0, 34)
      .stroke({ color: 0xffffff, width: 2, alpha: 0.72 });

    this.portal.addChild(halo, outer, inner, reticle);
    this.portal.inner = inner;
    this.portal.outer = outer;
    this.portal.halo = halo;
    this.portal.reticle = reticle;

    this.app.stage.addChild(this.portal, this.creatureRoot);
    this.app.ticker.add((ticker) => this.tick(ticker.deltaTime / 60));
  }

  tick(dt) {
    if (!this.app || this.phase === 'idle') return;
    const PIXI = this.PIXI;
    const screen = this.app.screen;
    const t = performance.now() / 1000;
    this.phaseTime += dt;

    const baseX = screen.width * 0.5 + this.orientation.x * 28;
    const baseY = screen.height * 0.48 + this.orientation.y * 20;
    const bob = Math.sin(t * 2.2) * 8;
    const drift = Math.sin(t * 1.1) * 18;

    this.portal.x = baseX;
    this.portal.y = baseY + bob * 0.3;
    this.portal.inner.rotation += dt * 1.8;
    this.portal.outer.rotation -= dt * 0.9;
    this.portal.halo.scale.set(1 + Math.sin(t * 2.6) * 0.07);
    this.portal.reticle.alpha = 0.52 + Math.sin(t * 4) * 0.2;

    this.creatureRoot.x = baseX + drift;
    this.creatureRoot.y = baseY + 18 + bob;
    this.creatureRoot.rotation = Math.sin(t * 1.45) * 0.045;
    this.creatureRoot.sparkle.rotation += dt * 3.5;
    this.creatureRoot.sparkle.alpha = 0.42 + Math.sin(t * 6) * 0.42;

    if (this.phase === 'scanning') {
      const progress = clamp(this.phaseTime / 2.2, 0, 1);
      this.portal.scale.set(0.6 + progress * 0.7 + Math.sin(t * 12) * 0.015);
      this.portal.alpha = 0.22 + progress * 0.72;
      this.creatureRoot.alpha = progress * 0.24;
      this.creatureRoot.scale.set(0.42 + progress * 0.22);
      if (this.phaseTime > 2.25) this.setPhase('reveal');
    }

    if (this.phase === 'reveal') {
      const progress = clamp(this.phaseTime / 1.2, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      this.portal.scale.set(1.22 - eased * 0.16);
      this.portal.alpha = 0.95 - progress * 0.28;
      this.creatureRoot.alpha = 0.24 + eased * 0.76;
      this.creatureRoot.scale.set(0.58 + Math.sin(progress * Math.PI) * 0.28 + eased * 0.32);
      if (Math.random() < 0.32) this.spawnParticle(baseX, baseY, 1.5);
      if (this.phaseTime > 1.2) this.setPhase('ready');
    }

    if (this.phase === 'ready') {
      this.portal.scale.set(1.04 + Math.sin(t * 2.2) * 0.03);
      this.portal.alpha = 0.43;
      this.creatureRoot.alpha = 1;
      this.creatureRoot.scale.set(0.94 + Math.sin(t * 2.2) * 0.025);
      if (Math.random() < 0.09) this.spawnParticle(this.creatureRoot.x, this.creatureRoot.y - 20, 1);
    }

    if (this.phase === 'caught') {
      const progress = clamp(this.phaseTime / 1.25, 0, 1);
      this.creatureRoot.scale.set((1 - progress) * 1.05 + 0.04);
      this.creatureRoot.alpha = 1 - progress;
      this.portal.scale.set(1 + progress * 2.8);
      this.portal.alpha = 1 - progress;
      if (Math.random() < 0.48) this.spawnParticle(this.creatureRoot.x, this.creatureRoot.y, 4.8);
      if (progress >= 1) this.finishCatch();
    }

    this.updateParticles(PIXI, dt);
    this.updatePulses(dt);
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseTime = 0;
    if (phase === 'reveal') {
      this.el.hint.textContent = 'Signal locked — something is coming through.';
      this.burst(38, this.app.screen.width * 0.5, this.app.screen.height * 0.48);
    }
    if (phase === 'ready') {
      this.el.hint.textContent = 'Tap the creature or use Pulse capture when it is centered.';
      this.el.pulseBtn.disabled = false;
      this.burst(24, this.creatureRoot.x, this.creatureRoot.y);
    }
    if (phase === 'caught') {
      this.el.hint.textContent = 'Capture successful — adding it to your collection…';
      this.el.pulseBtn.disabled = true;
      this.burst(72, this.creatureRoot.x, this.creatureRoot.y);
    }
  }

  spawnParticle(x, y, strength = 1) {
    if (!this.app) return;
    const angle = Math.random() * Math.PI * 2;
    const speed = (18 + Math.random() * 72) * strength;
    const particle = makeParticle(
      this.PIXI,
      Math.random() > 0.42 ? this.creature.accent : this.creature.color,
      x + (Math.random() - 0.5) * 100,
      y + (Math.random() - 0.5) * 80,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      0.6 + Math.random() * 0.8,
      2 + Math.random() * 4,
    );
    this.particles.push(particle);
    this.app.stage.addChild(particle);
  }

  burst(count, x, y) {
    for (let i = 0; i < count; i += 1) this.spawnParticle(x, y, 2.2);
  }

  updateParticles(PIXI, dt) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 50 * dt;
      p.alpha = clamp(p.life / p.maxLife, 0, 1);
      p.scale.set(0.8 + (1 - p.alpha) * 0.7);
      if (p.life <= 0) {
        p.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  updatePulses(dt) {
    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i];
      pulse.age += dt;
      const progress = clamp(pulse.age / pulse.life, 0, 1);
      pulse.clear()
        .circle(pulse.cx, pulse.cy, 20 + progress * 260)
        .stroke({ color: this.creature.accent, width: 5 * (1 - progress), alpha: 0.8 * (1 - progress) });
      if (progress >= 1) {
        pulse.destroy();
        this.pulses.splice(i, 1);
      }
    }
  }

  tryPulse(x, y) {
    if (!this.app || this.phase !== 'ready') return;
    this.captureAttempts += 1;

    const pulse = new this.PIXI.Graphics();
    pulse.cx = x;
    pulse.cy = y;
    pulse.age = 0;
    pulse.life = 0.72;
    this.pulses.push(pulse);
    this.app.stage.addChild(pulse);

    const dx = x - this.creatureRoot.x;
    const dy = y - this.creatureRoot.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const centeredBonus = clamp(1 - dist / 210, 0, 1);
    const chance = 0.28 + centeredBonus * 0.62 + Math.min(this.captureAttempts, 3) * 0.06;

    if (Math.random() < chance || this.captureAttempts >= 4) {
      this.setPhase('caught');
    } else {
      this.el.hint.textContent = this.captureAttempts === 1
        ? 'Close — it dodged the pulse. Try tapping closer to the creature.'
        : 'Still unstable. Wait for the bob, then pulse again.';
      this.creatureRoot.x += (Math.random() > 0.5 ? 1 : -1) * 54;
      this.burst(12, this.creatureRoot.x, this.creatureRoot.y - 20);
    }
  }

  pulseFromButton() {
    if (!this.app || this.phase !== 'ready') return;
    this.tryPulse(this.app.screen.width * 0.5, this.app.screen.height * 0.5);
  }

  async enableMotion() {
    try {
      const DeviceOrientation = window.DeviceOrientationEvent;
      if (!DeviceOrientation) {
        this.el.hint.textContent = 'Motion sensors are not available on this device.';
        return;
      }
      if (typeof DeviceOrientation.requestPermission === 'function') {
        const permission = await DeviceOrientation.requestPermission();
        if (permission !== 'granted') {
          this.el.hint.textContent = 'Motion permission was not granted. Scanner still works without it.';
          return;
        }
      }
      window.addEventListener('deviceorientation', this.boundOrientation, { passive: true });
      this.motionEnabled = true;
      this.el.motionBtn.textContent = 'Motion on';
      this.el.motionBtn.disabled = true;
    } catch (error) {
      console.warn(error);
      this.el.hint.textContent = 'Motion setup failed. Scanner still works without it.';
    }
  }

  handleOrientation(event) {
    const gamma = event.gamma ?? 0;
    const beta = event.beta ?? 0;
    this.orientation.x = clamp(gamma / 25, -1, 1);
    this.orientation.y = clamp((beta - 45) / 35, -1, 1);
  }

  async finishCatch() {
    const catchRecord = {
      id: nowId('catch'),
      creatureId: this.creature.id,
      creatureName: this.creature.name,
      spawnId: this.spawn?.id ?? 'unknown',
      spawnLabel: this.spawn?.label ?? 'Unknown signal',
      rarity: this.creature.rarity,
      caughtAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lat: this.position?.lat ?? null,
      lng: this.position?.lng ?? null,
    };
    const savedCatch = await saveCatch(catchRecord);
    const onComplete = this.onComplete;
    await this.stop();
    onComplete?.(savedCatch);
  }

  async stop() {
    this.phase = 'idle';
    this.el.layer.classList.add('hidden');
    this.el.layer.setAttribute('aria-hidden', 'true');
    this.el.pulseBtn.disabled = false;
    if (this.boundPointer) {
      this.el.pixiHost.removeEventListener('pointerdown', this.boundPointer);
      this.boundPointer = null;
    }
    if (this.motionEnabled) {
      window.removeEventListener('deviceorientation', this.boundOrientation);
      this.motionEnabled = false;
      this.el.motionBtn.textContent = 'Enable motion';
      this.el.motionBtn.disabled = false;
    }
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true });
      this.app = null;
    }
    this.el.pixiHost.replaceChildren();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.el.video.srcObject = null;
  }
}
