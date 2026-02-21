(function () {
  'use strict';

  const arena = document.getElementById('arena');
  const sprite = document.getElementById('sprite');


  const AUDIO_FILE = "f1theme.mp3";

  const PADDING = 40;
  const SPRITE_R = 16;
  const MAX_SPEED = 7000;
  const MIN_DISTANCE = 8;
  // Speed = k / dist^SPEED_CURVE. > 1 = harder to catch when mouse is close (steeper ramp).
  const SPEED_CURVE = 1;
  const MOVING_THRESHOLD = 5;
  const AUDIO_GAIN = 0.2;
  // Horizontal chase: pitch. Positive = chase right = higher pitch. Scale: px/s = cents.
  const PITCH_CENTS_PER_PX_S = -0.8;
  // Vertical chase: melody speed. Positive = chase up = faster. Scale: px/s =  playback rate offset.
  const PLAYBACK_RATE_PER_PX_S = -0.003;
  const PLAYBACK_RATE_MIN = 0.3;
  const PLAYBACK_RATE_MAX = 2.5;

  let arenaRect = { left: 0, top: 0, width: 0, height: 0 };
  let mouse = { x: null, y: null };
  let pos = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let audioReady = false;
  let audioContext = null;
  let gainNode = null;
  let oscillator = null;
  let audioElement = null;
  let melodyIndex = 0;
  let melodyTime = 0;

  const MELODY = [261.63, 329.63, 392, 523.25, 392, 329.63, 261.63, 196];
  const MELODY_STEP_DURATION = 0.25;

  function updateArenaRect() {
    arenaRect = arena.getBoundingClientRect();
  }

  function setSpritePosition(x, y) {
    pos.x = x;
    pos.y = y;
    sprite.style.left = x + 'px';
    sprite.style.top = y + 'px';
    sprite.style.transform = 'translate(-50%, -50%)';
  }

  function initSpritePosition() {
    setSpritePosition(arenaRect.width / 2 - SPRITE_R, arenaRect.height / 2 - SPRITE_R);
  }

  function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(audioContext.destination);

    if (AUDIO_FILE) {
      audioElement = new Audio(AUDIO_FILE);
      audioElement.loop = true;
      var source = audioContext.createMediaElementSource(audioElement);
      source.connect(gainNode);
      audioReady = true;
    } else {
      oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = MELODY[0];
      oscillator.connect(gainNode);
      oscillator.start(0);
      audioReady = true;
    }
  }

  function resumeAudio() {
    if (audioContext?.state === 'suspended') audioContext.resume();
  }

  function tryStartAudio() {
    initAudio();
    if (audioContext?.state === 'suspended') audioContext.resume();
    if (audioElement) audioElement.play().catch(function () {});
  }

  arena.addEventListener('click', tryStartAudio);
  arena.addEventListener('mousemove', tryStartAudio, { once: true });

  window.addEventListener('resize', function () {
    updateArenaRect();
    pos.x = Math.max(PADDING, Math.min(arenaRect.width - PADDING - SPRITE_R * 2, pos.x));
    pos.y = Math.max(PADDING, Math.min(arenaRect.height - PADDING - SPRITE_R * 2, pos.y));
    setSpritePosition(pos.x, pos.y);
  });

  arena.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX - arenaRect.left;
    mouse.y = e.clientY - arenaRect.top;
  });

  arena.addEventListener('mouseleave', function () {
    mouse.x = null;
    mouse.y = null;
  });

  function tick(dt) {
    const minX = PADDING;
    const minY = PADDING;
    const maxX = arenaRect.width - PADDING - SPRITE_R * 2;
    const maxY = arenaRect.height - PADDING - SPRITE_R * 2;

    if (mouse.x != null && mouse.y != null && arenaRect.width && arenaRect.height) {
      const cx = pos.x + SPRITE_R;
      const cy = pos.y + SPRITE_R;
      const dx = cx - mouse.x;
      const dy = cy - mouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      const speed = dist < MIN_DISTANCE ? 0 : Math.min(MAX_SPEED, (MAX_SPEED * Math.pow(MIN_DISTANCE, SPEED_CURVE)) / Math.pow(dist, SPEED_CURVE));
      const ux = dx / dist;
      const uy = dy / dist;

      const newX = pos.x + ux * speed * dt;
      const newY = pos.y + uy * speed * dt;

      velocity.x = (newX - pos.x) / dt;
      velocity.y = (newY - pos.y) / dt;

      pos.x = Math.max(minX, Math.min(maxX, newX));
      pos.y = Math.max(minY, Math.min(maxY, newY));
    } else {
      velocity.x *= 0.9;
      velocity.y *= 0.9;
    }

    setSpritePosition(pos.x, pos.y);

    const speed = Math.hypot(velocity.x, velocity.y);
    const isMoving = audioReady && speed > MOVING_THRESHOLD;

    if (audioReady) {
      resumeAudio();
      gainNode.gain.setTargetAtTime(isMoving ? AUDIO_GAIN : 0, audioContext.currentTime, 0.05);
    }

    if (isMoving) {
      const detuneCents = -velocity.x * PITCH_CENTS_PER_PX_S;
      const speedFactor = Math.max(PLAYBACK_RATE_MIN, Math.min(PLAYBACK_RATE_MAX, 1 + velocity.y * PLAYBACK_RATE_PER_PX_S));
      const pitchFactor = Math.pow(2, detuneCents / 1200);

      if (audioElement) {
        audioElement.playbackRate = Math.max(0.25, Math.min(4, speedFactor * pitchFactor));
      } else {
        oscillator.detune.setTargetAtTime(detuneCents, audioContext.currentTime, 0.02);
        melodyTime += dt * speedFactor;
        while (melodyTime >= MELODY_STEP_DURATION) {
          melodyTime -= MELODY_STEP_DURATION;
          melodyIndex = (melodyIndex + 1) % MELODY.length;
        }
        oscillator.frequency.setTargetAtTime(MELODY[melodyIndex], audioContext.currentTime, 0.02);
      }
    }
  }

  updateArenaRect();
  initSpritePosition();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    tick(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
