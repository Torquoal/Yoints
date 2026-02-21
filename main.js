(function () {
  'use strict';

  /**
   * Audio manipulation (Web Audio API):
   * - Context: AudioContext + createGain() for volume; gain.gain.setTargetAtTime() mutes when sprite is still.
   * - File playback: Audio element + createMediaElementSource() into the graph; element.playbackRate is set each frame for speed.
   * - Tone (dark or bright): createBiquadFilter(), type 'lowpass'; filter.frequency.setTargetAtTime() from FILTER_MIN_HZ to FILTER_MAX_HZ by position.
   * - Unlock: tryStartAudio() calls context.resume() and element.play() on click/mousemove (browser autoplay policy).
   */

  const arena = document.getElementById('arena');
  const sprite = document.getElementById('sprite');

  const AUDIO_FILE = 'f1theme.mp3';
  const PADDING = 40;
  const SPRITE_R = 60; // half of sprite CSS size (120px)
  const MAX_SPEED = 24000;
  const MIN_DISTANCE = 8;
  const SPEED_CURVE = 1; // > 1 = harder to catch when mouse is close
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
  let audioElement = null;

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
    if (audioContext || !AUDIO_FILE) return;
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioContext.createGain();
    gainNode.gain.value = 0;
    gainNode.connect(audioContext.destination);

    filterNode = audioContext.createBiquadFilter(); // does the dark and bright low pass filters
    filterNode.type = 'lowpass';
    filterNode.frequency.value = (FILTER_MIN_HZ + FILTER_MAX_HZ) / 2;
    filterNode.Q.value = 0.7;
    filterNode.connect(gainNode);

    audioElement = new Audio(AUDIO_FILE);
    audioElement.loop = true;
    var source = audioContext.createMediaElementSource(audioElement);
    source.connect(filterNode);
    audioReady = true;
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

  function frameTick(dt) {
    var leftBound = PADDING + SPRITE_R;
    var topBound = PADDING + SPRITE_R;
    var rightBound = arenaRect.width - PADDING - SPRITE_R;
    var bottomBound = arenaRect.height - PADDING - SPRITE_R;

    if (mouse.x != null && mouse.y != null && arenaRect.width && arenaRect.height) {
      var spriteCenterX = pos.x;
      var spriteCenterY = pos.y;
      var fromMouseToSpriteX = spriteCenterX - mouse.x;
      var fromMouseToSpriteY = spriteCenterY - mouse.y;
      var distanceToMouse = Math.sqrt(fromMouseToSpriteX * fromMouseToSpriteX + fromMouseToSpriteY * fromMouseToSpriteY) || 0.001;

      var escapeSpeed = distanceToMouse < MIN_DISTANCE ? 0 : Math.min(MAX_SPEED, (MAX_SPEED * Math.pow(MIN_DISTANCE, SPEED_CURVE)) / Math.pow(distanceToMouse, SPEED_CURVE));
      var directionAwayFromMouseX = fromMouseToSpriteX / distanceToMouse;
      var directionAwayFromMouseY = fromMouseToSpriteY / distanceToMouse;
      var nextPosX = pos.x + directionAwayFromMouseX * escapeSpeed * dt;
      var nextPosY = pos.y + directionAwayFromMouseY * escapeSpeed * dt;

      velocity.x = (nextPosX - pos.x) / dt;
      velocity.y = (nextPosY - pos.y) / dt;
      pos.x = Math.max(leftBound, Math.min(rightBound, nextPosX));
      pos.y = Math.max(topBound, Math.min(bottomBound, nextPosY));
    } else {
      velocity.x *= 0.9;
      velocity.y *= 0.9;
    }

    setSpritePosition(pos.x, pos.y);

    var velocityMagnitude = Math.hypot(velocity.x, velocity.y);
    var isMoving = audioReady && velocityMagnitude > MOVING_THRESHOLD;

    if (audioReady) {
      resumeAudio();
      gainNode.gain.setTargetAtTime(isMoving ? AUDIO_GAIN : 0, audioContext.currentTime, 0.05);
    }

    if (isMoving) {
      var arenaWidth = rightBound - leftBound;
      var arenaHeight = bottomBound - topBound;
      var horizontalZeroToOne = Math.max(0, Math.min(1, arenaWidth > 0 ? (pos.x - leftBound) / arenaWidth : 0)); /* left=0, right=1 → tone */
      var verticalZeroToOne = Math.max(0, Math.min(1, arenaHeight > 0 ? 1 - (pos.y - topBound) / arenaHeight : 0)); /* bottom=0, top=1 → speed */

      var playbackSpeedMultiplier = PLAYBACK_RATE_MIN + verticalZeroToOne * (PLAYBACK_RATE_MAX - PLAYBACK_RATE_MIN);
      filterNode.frequency.setTargetAtTime(
        FILTER_MIN_HZ + horizontalZeroToOne * (FILTER_MAX_HZ - FILTER_MIN_HZ),
        audioContext.currentTime, 0.04
      );

      audioElement.playbackRate = Math.max(0.25, Math.min(4, playbackSpeedMultiplier));
    }
  }

  updateArenaRect();
  initSpritePosition();

  var last = performance.now();
  var loop = function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    frameTick(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
