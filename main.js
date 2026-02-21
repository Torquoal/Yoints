(function () {
  'use strict';

  /**
   * Audio manipulation (Web Audio API):
   * - Context: AudioContext + createGain() for volume; gain.gain.setTargetAtTime() mutes when sprite is still.
   * - File playback: Audio element + createMediaElementSource() into the graph; element.playbackRate is set each frame for speed.
   * - Tone (dark or bright): createBiquadFilter(), type 'lowpass'; filter.frequency.setTargetAtTime() from FILTER_MIN_HZ to FILTER_MAX_HZ by position.
   * - Fallback (no file): createOscillator() playing a MELODY array; oscillator.frequency and gain for the same speed/filter behaviour.
   * - Unlock: tryStartAudio() calls context.resume() and element.play() on click/mousemove cos of browser autoplay limits.
   */

  const arena = document.getElementById('arena');
  const sprite = document.getElementById('sprite');

  const AUDIO_FILE = 'f1theme.mp3';
  const PADDING = 40;
  const SPRITE_R = 60; // half of sprite CSS size (120px)
  const MAX_SPEED = 20000;
  const MIN_DISTANCE = 8;
  const SPEED_CURVE = 1.0; // > 1 = harder to catch when mouse is close
  const MOVING_THRESHOLD = 5;
  const AUDIO_GAIN = 0.2;
  const FILTER_MIN_HZ = 200;  /* bottom-left = dark */
  const FILTER_MAX_HZ = 8000; // top-right = bright
  const PLAYBACK_RATE_MIN = 0.3;
  const PLAYBACK_RATE_MAX = 2.5;

  let arenaRect = { left: 0, top: 0, width: 0, height: 0 };
  let mouse = { x: null, y: null };
  let pos = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };
  let audioReady = false;
  let audioContext = null;
  let gainNode = null;
  let filterNode = null;
  let oscillator = null;
  let audioElement = null;
  let melodyIndex = 0;
  let melodyTime = 0;

  const MELODY = [261.63, 329.63, 392, 523.25, 392, 329.63, 261.63, 196];
  const MELODY_STEP_DURATION = 0.25;

  var updateArenaRect = function () {
    arenaRect = arena.getBoundingClientRect();
  };

  function setSpritePosition(x, y) {
    pos.x = x;
    pos.y = y;
    sprite.style.left = x + 'px';
    sprite.style.top = y + 'px';
    sprite.style.transform = 'translate(-50%, -50%)';
  }

  var initSpritePosition = function init() {
    setSpritePosition(arenaRect.width / 2, arenaRect.height / 2);
  };

  function initAudio() {
    if (audioContext) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(audioContext.destination);

    filterNode = audioContext.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = (FILTER_MIN_HZ + FILTER_MAX_HZ) / 2;
    filterNode.Q.value = 0.7;
    filterNode.connect(gainNode);

    if (AUDIO_FILE) {
      audioElement = new Audio(AUDIO_FILE);
      audioElement.loop = true;
      var source = audioContext.createMediaElementSource(audioElement);
      source.connect(filterNode);
      audioReady = true;
    } else {
      oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = MELODY[0];
      oscillator.connect(filterNode);
      oscillator.start(0);
      audioReady = true;
    }
  }

  const resumeAudio = () => {
    if (audioContext?.state === 'suspended') audioContext.resume();
  };

  function tryStartAudio() {
    initAudio();
    if (audioContext?.state === 'suspended') audioContext.resume();
    if (audioElement) audioElement.play().catch(() => {});
  }

  arena.addEventListener('click', tryStartAudio);
  arena.addEventListener('mousemove', tryStartAudio, { once: true });

  window.addEventListener('resize', function onResize() {
    updateArenaRect();
    pos.x = Math.max(PADDING + SPRITE_R, Math.min(arenaRect.width - PADDING - SPRITE_R, pos.x));
    pos.y = Math.max(PADDING + SPRITE_R, Math.min(arenaRect.height - PADDING - SPRITE_R, pos.y));
    setSpritePosition(pos.x, pos.y);
  });

  arena.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX - arenaRect.left;
    mouse.y = e.clientY - arenaRect.top;
  });

  arena.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  function tick(dt) {
    var minX = PADDING + SPRITE_R;
    var minY = PADDING + SPRITE_R;
    var maxX = arenaRect.width - PADDING - SPRITE_R;
    var maxY = arenaRect.height - PADDING - SPRITE_R;

    if (mouse.x != null && mouse.y != null && arenaRect.width && arenaRect.height) {
      var cx = pos.x, cy = pos.y;
      var dx = cx - mouse.x, dy = cy - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;

      var speed = dist < MIN_DISTANCE ? 0 : Math.min(MAX_SPEED, (MAX_SPEED * Math.pow(MIN_DISTANCE, SPEED_CURVE)) / Math.pow(dist, SPEED_CURVE));
      var ux = dx / dist, uy = dy / dist;
      var newX = pos.x + ux * speed * dt;
      var newY = pos.y + uy * speed * dt;

      velocity.x = (newX - pos.x) / dt;
      velocity.y = (newY - pos.y) / dt;
      pos.x = Math.max(minX, Math.min(maxX, newX));
      pos.y = Math.max(minY, Math.min(maxY, newY));
    } else {
      velocity.x *= 0.9;
      velocity.y *= 0.9;
    }

    setSpritePosition(pos.x, pos.y);

    var speedMag = Math.hypot(velocity.x, velocity.y);
    var isMoving = audioReady && speedMag > MOVING_THRESHOLD;

    if (audioReady) {
      resumeAudio();
      gainNode.gain.setTargetAtTime(isMoving ? AUDIO_GAIN : 0, audioContext.currentTime, 0.05);
    }

    if (isMoving) {
      var rangeX = maxX - minX, rangeY = maxY - minY;
      var normX = Math.max(0, Math.min(1, rangeX > 0 ? (pos.x - minX) / rangeX : 0)); /* left=0, right=1 → tone */
      var normY = Math.max(0, Math.min(1, rangeY > 0 ? 1 - (pos.y - minY) / rangeY : 0)); /* bottom=0, top=1 → speed */

      var speedFactor = PLAYBACK_RATE_MIN + normY * (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN);
      filterNode.frequency.setTargetAtTime(
        FILTER_MIN_HZ + normX * (FILTER_MAX_HZ - FILTER_MIN_HZ),
        audioContext.currentTime, 0.04
      );

      if (audioElement) {
        audioElement.playbackRate = Math.max(0.25, Math.min(4, speedFactor));
      } else {
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

  var last = performance.now();
  var loop = function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    tick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
