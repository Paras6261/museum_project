import { WINGS, MONUMENTS, ROMAN_NUMERALS } from './monuments.js';

// ══════════════════════════════════════════════════════════════
// STATE — Real-Life Live Camera AR First · Strictly ZERO GPS!
// ══════════════════════════════════════════════════════════════

const state = {
  activeWorld: 'india',
  activeMonumentId: 'taj-mahal',
  studioOpen: false,
  studioFilter: 'all',        // 'all' | 'india' | 'egypt' | 'rome'
  studioMonumentId: 'taj-mahal',
  studioMode: 'camera-ar',    // 'camera-ar' (default!) | '3d'
  interactionMode: 'rotate',  // 'rotate' | 'move' (tap/drag anywhere on camera!)
  lightingTheme: 'golden',    // 'golden' | 'parchment' | 'obsidian'
  autoRotate: true,
  cleanView: false,
  gyroEnabled: false,
  gyroBaseAlpha: null,
  gyroBaseBeta: null,
  arScale: 1.0,
  arOffsetX: 0,
  arOffsetY: 0,
  facingMode: 'environment',
  cameras: [],
  cameraIndex: 0,
  mirrored: false,
  cameraStream: null,
  cameraActive: false,
  lightMatchTimer: null,
  drawerCollapsed: false,
  speaking: false,
  mobileHttpsUrl: '',
};

// ══════════════════════════════════════════════════════════════
// DOM REFERENCES
// ══════════════════════════════════════════════════════════════

const el = (id) => document.getElementById(id);

const introEl = el('intro');
const museumPageEl = el('museum-page');
const studioOverlay = el('ar-studio-overlay');
const viewer = el('exhibit-viewer');
const viewerStage = el('model-viewer-stage');
const placeLayer = el('ar-place-layer');
const cameraVideo = el('ar-camera-video');
const arReticle = el('ar-floor-reticle');
const studioViewport = el('studio-viewport');
const loadingBadge = el('viewer-loading-badge');
const cameraToast = el('camera-status-toast');
const cameraPromptCard = el('camera-prompt-card');
const hudBottom = el('ar-hud-bottom');
const curatorModal = el('curator-modal');
const mobileQrModal = el('mobile-qr-modal');

// Tiny offscreen canvas for Real-Time Room Lighting Adaptation
const lightCanvas = document.createElement('canvas');
lightCanvas.width = 16;
lightCanvas.height = 16;
const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getWorldMonuments(worldId) {
  return MONUMENTS.filter((m) => m.world === worldId);
}

function getMonumentById(id) {
  return MONUMENTS.find((m) => m.id === id) || MONUMENTS[0];
}

function showToast(message, durationMs = 4200) {
  cameraToast.textContent = message;
  cameraToast.classList.add('visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    cameraToast.classList.remove('visible');
  }, durationMs);
}

// ══════════════════════════════════════════════════════════════
// DOCENT AUDIO GUIDE (WEB SPEECH API)
// ══════════════════════════════════════════════════════════════

function stopDocent() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  state.speaking = false;
  updateDocentUI();
}

function toggleDocent(monument) {
  if (!('speechSynthesis' in window)) {
    showToast('Speech narration is not supported in this browser.');
    return;
  }
  if (state.speaking) {
    stopDocent();
    return;
  }
  const m = monument || getMonumentById(state.studioOpen ? state.studioMonumentId : state.activeMonumentId);
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(m.docentScript);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  utter.onend = () => {
    state.speaking = false;
    updateDocentUI();
  };
  utter.onerror = () => {
    state.speaking = false;
    updateDocentUI();
  };
  state.speaking = true;
  updateDocentUI();
  window.speechSynthesis.speak(utter);
}

function updateDocentUI() {
  const sampleBtn = el('spec4-audio-btn');
  if (sampleBtn) {
    sampleBtn.textContent = state.speaking ? 'STOP ⏹' : 'SAMPLE 🔊';
    sampleBtn.classList.toggle('playing', state.speaking);
  }
  const footerPlayBtn = el('docent-play-btn');
  if (footerPlayBtn) {
    footerPlayBtn.textContent = state.speaking ? '⏸' : '▶';
    footerPlayBtn.title = state.speaking ? 'Pause Docent Narration' : 'Play Docent Narration';
  }
  const docentStatus = el('docent-status-label');
  if (docentStatus) {
    docentStatus.textContent = state.speaking ? '🎧 DOCENT GUIDE: SPEAKING' : '🎧 DOCENT GUIDE: ACTIVE';
  }
  const studioAudioBtn = el('studio-audio-btn');
  if (studioAudioBtn) {
    studioAudioBtn.classList.toggle('active', state.speaking);
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER MUSEUM DASHBOARD (EXACT EXHIBITX LAYOUT)
// ══════════════════════════════════════════════════════════════

function renderMuseum() {
  const m = getMonumentById(state.activeMonumentId);
  const wing = WINGS[m.world];
  const worldList = getWorldMonuments(m.world);
  const idx = worldList.findIndex((item) => item.id === m.id);
  const prevIdx = (idx - 1 + worldList.length) % worldList.length;
  const nextIdx = (idx + 1) % worldList.length;

  const heroImg = el('hero-underlay-img');
  if (heroImg.getAttribute('src') !== m.bgImage) {
    heroImg.style.opacity = '0.25';
    heroImg.src = m.bgImage;
    heroImg.alt = m.name;
    heroImg.onload = () => {
      heroImg.style.opacity = '0.85';
    };
  }

  const navLinks = el('nav-wing-links');
  navLinks.innerHTML = Object.values(WINGS)
    .map(
      (w) => `
      <button class="nav-tab ${w.id === m.world ? 'active' : ''}" data-wing="${w.id}">
        <span class="nav-tab-flag">${w.flagEmoji}</span>
        ${w.id.toUpperCase()}
      </button>
    `
    )
    .join('');

  navLinks.querySelectorAll('.nav-tab').forEach((btn) => {
    btn.addEventListener('click', () => selectWorld(btn.dataset.wing));
  });

  el('gallery-title').textContent = wing.worldLabel;
  el('gallery-subtitle').textContent = m.subtitle;

  el('card-flag-badge').innerHTML = `
    <span class="flag-badge-flag">${wing.flagEmoji}</span>
    ${wing.worldLabel.toUpperCase()} ARCHIVE • EXHIBIT ${ROMAN_NUMERALS[idx]}/${ROMAN_NUMERALS[worldList.length - 1]}
  `;
  el('card-source-badge').textContent = m.modelSource;

  const diamondsEl = el('sequence-diamonds');
  diamondsEl.innerHTML = worldList
    .map(
      (item, i) => `
      <span class="seq-item ${i === idx ? 'active' : ''}" data-id="${item.id}" title="${item.name}">◆</span>
    `
    )
    .join('');
  diamondsEl.querySelectorAll('.seq-item').forEach((d) => {
    d.addEventListener('click', () => selectMonument(d.dataset.id));
  });

  el('arrow-prev-roman').textContent = ROMAN_NUMERALS[prevIdx];
  el('arrow-next-roman').textContent = ROMAN_NUMERALS[nextIdx];
  el('btn-prev-exhibit').onclick = () => selectMonument(worldList[prevIdx].id);
  el('btn-next-exhibit').onclick = () => selectMonument(worldList[nextIdx].id);

  el('monument-era').textContent = `🗺 ${m.era}`;
  el('monument-name').textContent = m.name;
  el('monument-location').textContent = `📍 ${m.location}`;
  el('monument-desc').textContent = m.desc;
  el('scan-fidelity').textContent = `✅ ${m.scanFidelity}`;
  el('scan-cat').textContent = m.catNum;

  el('spec1-label').textContent = m.spec1Label;
  el('spec1-value').textContent = m.spec1Value;
  el('spec1-chip').textContent = m.spec1Chip;

  el('spec2-label').textContent = m.spec2Label;
  el('spec2-value').textContent = m.spec2Value;
  el('spec2-chip').textContent = m.spec2Chip;

  el('spec3-label').textContent = m.spec3Label;
  el('spec3-value').textContent = m.spec3Value;
  el('spec3-chip').textContent = m.spec3Chip;

  el('spec4-label').textContent = m.spec4Label;
  el('spec4-value').textContent = m.spec4Value;

  const tabsEl = el('monument-tabs');
  tabsEl.innerHTML = worldList
    .map(
      (item) => `
      <button class="tab-btn ${item.id === m.id ? 'active' : ''}" data-id="${item.id}">
        ${item.id === m.id ? '• ' : ''}${item.tabLabel}
      </button>
    `
    )
    .join('');
  tabsEl.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => selectMonument(btn.dataset.id));
  });

  const wingsGrid = el('wings-grid');
  wingsGrid.innerHTML = Object.values(WINGS)
    .map((w) => {
      const count = getWorldMonuments(w.id).length;
      const isActive = w.id === m.world;
      return `
        <div class="wing-card ${isActive ? 'active' : ''}" data-wing="${w.id}">
          <div>
            <div class="wing-tag-row">
              <span class="wing-tag">${isActive ? `ACTIVE GALLERY • ${w.wingTag}` : w.wingTag}</span>
              <span class="wing-icon">${w.icon}</span>
            </div>
            <h3 class="wing-name">${w.name}</h3>
            <p class="wing-desc">${w.desc}</p>
          </div>
          <div class="wing-bottom">
            <span>${count} MASTERPIECES ${isActive ? 'ACTIVE' : 'CURATED'}</span>
            <span>→</span>
          </div>
        </div>
      `;
    })
    .join('');
  wingsGrid.querySelectorAll('.wing-card').forEach((card) => {
    card.addEventListener('click', () => selectWorld(card.dataset.wing));
  });

  const footerLinks = el('footer-gallery-links');
  footerLinks.innerHTML = Object.values(WINGS)
    .map(
      (w) => `
      <button class="footer-link ${w.id === m.world ? 'active' : ''}" data-wing="${w.id}">
        ${w.footerLabel}
      </button>
    `
    )
    .join('');
  footerLinks.querySelectorAll('.footer-link').forEach((btn) => {
    btn.addEventListener('click', () => selectWorld(btn.dataset.wing));
  });

  el('docent-prev-btn').onclick = () => selectMonument(worldList[prevIdx].id);
  el('docent-next-btn').onclick = () => selectMonument(worldList[nextIdx].id);

  updateDocentUI();
}

function selectWorld(worldId) {
  stopDocent();
  state.activeWorld = worldId;
  const list = getWorldMonuments(worldId);
  state.activeMonumentId = list[0].id;
  renderMuseum();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectMonument(monumentId) {
  stopDocent();
  const m = getMonumentById(monumentId);
  state.activeWorld = m.world;
  state.activeMonumentId = m.id;
  renderMuseum();
}

// ══════════════════════════════════════════════════════════════
// REAL-TIME ROOM LIGHTING ADAPTATION (MATCHES REAL CAMERA LIGHT)
// ══════════════════════════════════════════════════════════════

function startRoomLightMatching() {
  stopRoomLightMatching();
  state.lightMatchTimer = setInterval(() => {
    if (!state.cameraActive || cameraVideo.readyState < 2 || state.studioMode !== 'camera-ar') return;
    try {
      lightCtx.drawImage(cameraVideo, 0, 0, 16, 16);
      const data = lightCtx.getImageData(0, 0, 16, 16).data;
      let sumLum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumLum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      const avgNorm = sumLum / (256 * 255); // 0..1
      // Map real room brightness smoothly to natural PBR exposure (0.78 to 1.42)
      const exposure = (0.78 + avgNorm * 0.64).toFixed(2);
      viewer.setAttribute('exposure', exposure);
    } catch (_) {
      // Ignore frame read timing issues
    }
  }, 1100);
}

function stopRoomLightMatching() {
  if (state.lightMatchTimer) {
    clearInterval(state.lightMatchTimer);
    state.lightMatchTimer = null;
  }
}

// ══════════════════════════════════════════════════════════════
// MOBILE GYROSCOPE 3DOF SPATIAL ANCHORING (ZERO GPS!)
// ══════════════════════════════════════════════════════════════

function handleDeviceOrientation(e) {
  if (!state.gyroEnabled || state.studioMode !== 'camera-ar') return;
  if (e.alpha == null || e.beta == null) return;

  if (state.gyroBaseAlpha === null) {
    state.gyroBaseAlpha = e.alpha;
    state.gyroBaseBeta = e.beta;
  }

  // Compute smooth relative yaw & pitch delta as user moves phone around the monument
  let dYaw = e.alpha - state.gyroBaseAlpha;
  if (dYaw > 180) dYaw -= 360;
  if (dYaw < -180) dYaw += 360;
  const dPitch = Math.max(-28, Math.min(28, (e.beta - state.gyroBaseBeta) * 0.7));

  const theta = (30 - dYaw * 1.15).toFixed(1);
  const phi = Math.max(35, Math.min(88, 72 - dPitch)).toFixed(1);
  viewer.cameraOrbit = `${theta}deg ${phi}deg 110%`;
}

async function toggleGyroAR() {
  if (state.gyroEnabled) {
    state.gyroEnabled = false;
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    el('toggle-gyro-btn').classList.remove('active');
    showToast('Gyroscope AR Lock disabled.', 2200);
    return;
  }

  if (typeof DeviceOrientationEvent === 'undefined') {
    showToast('Gyroscope sensors are available on smartphones & tablets.', 3500);
    return;
  }

  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') {
        showToast('Motion sensor permission denied.', 3200);
        return;
      }
    }
    state.gyroEnabled = true;
    state.gyroBaseAlpha = null;
    state.gyroBaseBeta = null;
    // Pause auto-rotate so user's phone movement controls the 3D perspective directly
    if (state.autoRotate) {
      state.autoRotate = false;
      viewer.removeAttribute('auto-rotate');
      el('toggle-rotate-btn').classList.remove('active');
    }
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    el('toggle-gyro-btn').classList.add('active');
    showToast('🧭 Gyroscope AR Active (No GPS) — Move & tilt your phone to inspect around the monument!', 4200);
  } catch (err) {
    showToast('Gyroscope requires a mobile device over HTTPS.', 3500);
  }
}

// ══════════════════════════════════════════════════════════════
// FULL-SCREEN LIVE CAMERA AR & 3D STUDIO (ZERO LOCATION TRACKING)
// ══════════════════════════════════════════════════════════════

function openStudio(monumentId, startInCameraAr = true) {
  state.studioOpen = true;
  state.studioMonumentId = monumentId || state.activeMonumentId;
  state.studioFilter = 'all';
  state.arOffsetX = 0;
  state.arOffsetY = 0;
  state.arScale = 1.0;
  state.cleanView = false;
  studioViewport.classList.remove('clean-ar-view');
  el('toggle-clean-btn').classList.remove('active');
  el('ar-scale-slider').value = '100';
  el('ar-elev-slider').value = '0';

  studioOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  renderModelPicker();
  loadStudioModel(state.studioMonumentId);
  setInteractionMode('rotate');
  setStudioMode(startInCameraAr ? 'camera-ar' : '3d');
}

function closeStudio() {
  stopCameraAR();
  stopDocent();
  if (state.gyroEnabled) toggleGyroAR();
  state.studioOpen = false;
  studioOverlay.classList.remove('open');
  document.body.style.overflow = '';
  selectMonument(state.studioMonumentId);
}

function renderModelPicker() {
  const filterCounts = {
    all: MONUMENTS.length,
    india: getWorldMonuments('india').length,
    egypt: getWorldMonuments('egypt').length,
    rome: getWorldMonuments('rome').length,
  };

  const filterBar = el('studio-filter-row');
  const filterDefs = [
    { key: 'all', label: `ALL (${filterCounts.all})` },
    { key: 'india', label: `🇮🇳 INDIA (${filterCounts.india})` },
    { key: 'egypt', label: `🇪🇬 EGYPT (${filterCounts.egypt})` },
    { key: 'rome', label: `🇮🇹 ROME (${filterCounts.rome})` },
  ];
  filterBar.innerHTML = filterDefs
    .map(
      (f) => `
      <button class="filter-pill ${state.studioFilter === f.key ? 'active' : ''}" data-filter="${f.key}">
        ${f.label}
      </button>
    `
    )
    .join('');

  filterBar.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.studioFilter = btn.dataset.filter;
      renderModelPicker();
    });
  });

  const filtered =
    state.studioFilter === 'all'
      ? MONUMENTS
      : MONUMENTS.filter((m) => m.world === state.studioFilter);

  const listEl = el('studio-model-list');
  listEl.innerHTML = filtered
    .map((m) => {
      const wing = WINGS[m.world];
      const active = m.id === state.studioMonumentId;
      return `
        <button class="model-option-card ${active ? 'active' : ''}" data-model-id="${m.id}">
          <img src="${m.bgImage}" alt="${m.name}" class="model-option-thumb" loading="lazy" />
          <div class="model-option-meta">
            <span class="model-option-name">${wing.flagEmoji} ${m.name}</span>
            <span class="model-option-loc">${m.location}</span>
            <span class="model-option-tag">${m.modelSource}</span>
          </div>
        </button>
      `;
    })
    .join('');

  listEl.querySelectorAll('.model-option-card').forEach((card) => {
    card.addEventListener('click', () => {
      loadStudioModel(card.dataset.modelId);
    });
  });
}

function loadStudioModel(monumentId) {
  const m = getMonumentById(monumentId);
  const wing = WINGS[m.world];
  state.studioMonumentId = m.id;
  stopDocent();

  el('studio-active-name').textContent = `${wing.flagEmoji} ${m.name}`;
  el('stage-info-era').textContent = `${m.era} • ${m.spec1Value}`;

  document.querySelectorAll('.model-option-card').forEach((c) => {
    const isAct = c.dataset.modelId === m.id;
    c.classList.toggle('active', isAct);
    if (isAct) {
      c.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  });

  viewer.setAttribute('alt', `3D Monument Model of ${m.name}`);
  viewer.setAttribute('camera-orbit', m.cameraOrbit || '30deg 72deg 112%');

  const currentSrc = viewer.getAttribute('src') || '';
  if (currentSrc === m.modelPath && viewer.loaded) {
    // Already loaded — never get stuck on loading badge!
    loadingBadge.classList.remove('visible');
  } else {
    loadingBadge.textContent = `⏳ Loading ${m.name}…`;
    loadingBadge.classList.add('visible');
    viewer.setAttribute('src', m.modelPath);

    // Safety watcher in case <model-viewer> finishes from cache without re-emitting 'load'
    clearTimeout(loadStudioModel._timer);
    const pollLoaded = (tries = 0) => {
      if (viewer.loaded || tries > 40) {
        loadingBadge.classList.remove('visible');
        return;
      }
      loadStudioModel._timer = setTimeout(() => pollLoaded(tries + 1), 250);
    };
    loadStudioModel._timer = setTimeout(() => pollLoaded(0), 300);
  }

  applyStageTransform();
}

function applyStageTransform() {
  const s = state.arScale;
  const x = state.arOffsetX;
  const y = state.arOffsetY;
  viewerStage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  arReticle.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y + 70}px)) perspective(360px) rotateX(70deg) scale(${Math.max(0.6, Math.min(1.4, s))})`;
  el('scale-val').textContent = `${Math.round(s * 100)}%`;
  el('elev-val').textContent = `${Math.round(y)}px`;
}

function setInteractionMode(mode) {
  state.interactionMode = mode;
  el('interaction-rotate-btn').classList.toggle('active', mode === 'rotate');
  el('interaction-move-btn').classList.toggle('active', mode === 'move');
  placeLayer.classList.toggle('active', mode === 'move');

  // Show the ground reticle clearly while placing; soften/hide once locked in Rotate mode
  if (state.cameraActive) {
    arReticle.classList.toggle('active', mode === 'move' && !state.cleanView);
  }

  if (mode === 'move') {
    showToast('✋ Place Mode: Tap or drag anywhere on your real desk/floor to place the monument!', 3800);
  }
}

function applyViewportTheme() {
  studioViewport.classList.remove('theme-parchment', 'theme-golden', 'theme-obsidian', 'theme-camera');
  if (state.studioMode === 'camera-ar') {
    studioViewport.classList.add('theme-camera');
    el('lighting-controls').style.display = 'none';
    viewer.setAttribute('exposure', '1.12');
    viewer.setAttribute('shadow-intensity', '1.45');
  } else {
    studioViewport.classList.add(`theme-${state.lightingTheme}`);
    el('lighting-controls').style.display = 'flex';
    viewer.setAttribute('exposure', state.lightingTheme === 'golden' ? '1.22' : '1.08');
    viewer.setAttribute('shadow-intensity', '1.25');
  }

  document.querySelectorAll('[data-theme]').forEach((b) => {
    b.classList.toggle('active', b.dataset.theme === state.lightingTheme);
  });
}

async function refreshCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.cameras = devices.filter((d) => d.kind === 'videoinput');
  } catch (_) {
    state.cameras = [];
  }
}

function setCameraBadge(text, isLive = false) {
  const badge = el('cam-live-badge');
  if (!badge) return;
  badge.textContent = text;
  badge.style.background = isLive ? 'rgba(20, 74, 30, 0.92)' : 'rgba(56, 44, 18, 0.85)';
  badge.style.borderColor = isLive ? 'rgba(132, 238, 148, 0.7)' : 'rgba(230, 200, 117, 0.55)';
  badge.style.color = isLive ? '#D4FFD8' : '#F6E6B8';
}

async function startCameraAR(specificDeviceId = null) {
  cameraPromptCard.classList.remove('visible');
  setCameraBadge('🟡 STARTING CAM…', false);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCameraBadge('⚠ CAM UNAVAILABLE', false);
    el('camera-prompt-title').textContent = 'Camera Requires HTTPS on Mobile (or Localhost on PC)';
    el('camera-prompt-desc').innerHTML =
      'Tap <strong>📲 Phone QR</strong> above to open the secure <strong>HTTPS</strong> link on your phone camera, or open <strong>http://localhost:8080</strong> in Chrome/Edge on your computer.';
    cameraPromptCard.classList.add('visible');
    return;
  }

  // Always release any existing webcam lock FIRST (critical on Windows!)
  stopCameraAR();

  let stream = null;
  let lastError = null;

  // Step 1: Acquire camera stream cleanly (video only, zero GPS/audio)
  const attempts = specificDeviceId
    ? [{ video: { deviceId: { exact: specificDeviceId } }, audio: false }]
    : [
        { video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { facingMode: state.facingMode }, audio: false },
        { video: true, audio: false },
      ];

  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (stream) break;
    } catch (err) {
      lastError = err;
      if (err && (err.name === 'NotAllowedError' || err.name === 'NotReadableError')) {
        break;
      }
    }
  }

  if (!stream) {
    state.cameraActive = false;
    setCameraBadge('🔴 CAM OFF', false);
    const errName = lastError ? lastError.name : 'UnknownError';
    const errMsg = lastError ? lastError.message : '';

    if (errName === 'NotReadableError' || errName === 'TrackStartError') {
      el('camera-prompt-title').textContent = 'Camera Is In Use By Another App';
      el('camera-prompt-desc').innerHTML =
        'Your webcam is currently locked by another app or browser tab (e.g., Zoom, Meet, Camera app). Close that app and click <strong>Start Live Camera</strong>.';
    } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
      el('camera-prompt-title').textContent = 'No Camera Detected on This Device';
      el('camera-prompt-desc').innerHTML =
        'No webcam was found. You can still use <strong>🧊 3D Studio</strong> here, or tap <strong>📲 Phone QR</strong> to open Live Camera AR on your smartphone!';
    } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
      el('camera-prompt-title').textContent = 'Camera Permission Blocked';
      el('camera-prompt-desc').innerHTML =
        `Browser blocked camera access (${errName}). Click the <strong>camera/lock icon</strong> in your browser address bar, allow Camera, then click <strong>Start Live Camera</strong>. If using an IDE embedded preview, open <strong>http://localhost:8080</strong> directly in Chrome or Edge.`;
    } else {
      el('camera-prompt-title').textContent = 'Could Not Start Camera';
      el('camera-prompt-desc').innerHTML =
        `Error: <code>${errName}${errMsg ? ' — ' + errMsg : ''}</code>. Click <strong>Start Live Camera</strong> to retry, or open <strong>http://localhost:8080</strong> in Chrome/Edge.`;
    }
    cameraPromptCard.classList.add('visible');
    return;
  }

  // Step 2: Attach stream to visible <video> element and start decoding frames
  try {
    await attachCameraStream(stream);
    await refreshCameraList();
  } catch (playErr) {
    state.cameraStream = stream;
    state.cameraActive = true;
    cameraVideo.classList.add('active');
    setCameraBadge('🟡 TAP TO RESUME', false);
    el('camera-prompt-title').textContent = 'Tap to Resume Live Camera Feed';
    el('camera-prompt-desc').innerHTML =
      'Camera permission is granted! Tap <strong>Start Live Camera</strong> below to begin streaming your live view.';
    cameraPromptCard.classList.add('visible');
  }
}

async function attachCameraStream(stream) {
  state.cameraStream = stream;
  state.cameraActive = true;
  cameraPromptCard.classList.remove('visible');

  // Make <video> visible BEFORE play() so Chromium/Safari immediately render frames
  cameraVideo.setAttribute('playsinline', '');
  cameraVideo.setAttribute('webkit-playsinline', '');
  cameraVideo.playsInline = true;
  cameraVideo.muted = true;
  cameraVideo.autoplay = true;
  cameraVideo.classList.add('active');
  cameraVideo.srcObject = stream;

  const track = stream.getVideoTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  state.mirrored = settings.facingMode === 'user';
  cameraVideo.classList.toggle('mirrored', state.mirrored);
  el('mirror-camera-btn').classList.toggle('active', state.mirrored);

  // Wait for video metadata if not yet ready
  if (cameraVideo.readyState < 1) {
    await new Promise((resolve) => {
      const onMeta = () => {
        cameraVideo.removeEventListener('loadedmetadata', onMeta);
        resolve();
      };
      cameraVideo.addEventListener('loadedmetadata', onMeta, { once: true });
      setTimeout(resolve, 2500);
    });
  }

  await cameraVideo.play();

  const w = cameraVideo.videoWidth || settings.width || 0;
  const h = cameraVideo.videoHeight || settings.height || 0;
  const label = (track && track.label ? track.label.split('(')[0].trim() : 'Live Camera').slice(0, 22);
  setCameraBadge(`🟢 LIVE: ${label}${w ? ` (${w}×${h})` : ''}`, true);

  arReticle.classList.toggle('active', state.interactionMode === 'move' && !state.cleanView);
  startRoomLightMatching();
  showToast(`📷 Live Camera Active (${w}×${h}) — No GPS! Use ✋ Place or pick any monument below.`, 4200);
}

function stopCameraAR() {
  stopRoomLightMatching();
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((t) => t.stop());
    state.cameraStream = null;
  }
  state.cameraActive = false;
  cameraVideo.pause();
  cameraVideo.srcObject = null;
  cameraVideo.classList.remove('active');
  arReticle.classList.remove('active');
  setCameraBadge('⚪ CAM OFF', false);
}

function setStudioMode(mode) {
  state.studioMode = mode;
  el('mode-camera-btn').classList.toggle('active', mode === 'camera-ar');
  el('mode-3d-btn').classList.toggle('active', mode === '3d');

  el('flip-camera-btn').style.display = mode === 'camera-ar' ? 'flex' : 'none';
  el('mirror-camera-btn').style.display = mode === 'camera-ar' ? 'flex' : 'none';
  el('toggle-gyro-btn').style.display = mode === 'camera-ar' ? 'flex' : 'none';

  if (mode === 'camera-ar') {
    applyViewportTheme();
    startCameraAR();
  } else {
    stopCameraAR();
    cameraPromptCard.classList.remove('visible');
    applyViewportTheme();
  }
}

// ══════════════════════════════════════════════════════════════
// MOBILE CAMERA HTTPS QR CODE MODAL
// ══════════════════════════════════════════════════════════════

async function openMobileQrModal() {
  const isLocal =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(window.location.hostname);

  let targetUrl = window.location.origin;
  if (isLocal) {
    targetUrl = `https://${window.location.hostname}:8443`;
    try {
      const resp = await fetch('/api/server-info');
      if (resp.ok) {
        const info = await resp.json();
        if (info.httpsUrl) targetUrl = info.httpsUrl;
      }
    } catch (_) {
      // Fallback to current host
    }
  }

  state.mobileHttpsUrl = targetUrl;
  el('mobile-https-url').textContent = targetUrl;
  el('mobile-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(targetUrl)}`;
  const certStep = el('mobile-cert-step');
  if (certStep) certStep.style.display = isLocal ? 'list-item' : 'none';
  mobileQrModal.classList.add('open');
}

// ══════════════════════════════════════════════════════════════
// TAP & DRAG TO PLACE MONUMENT ANYWHERE IN CAMERA VIEW
// ══════════════════════════════════════════════════════════════

function setupMovePlaceGestures() {
  let dragging = false;
  let startPtrX = 0;
  let startPtrY = 0;
  let startOffX = 0;
  let startOffY = 0;
  let moved = false;

  placeLayer.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    startPtrX = e.clientX;
    startPtrY = e.clientY;
    startOffX = state.arOffsetX;
    startOffY = state.arOffsetY;
    placeLayer.classList.add('dragging');
    placeLayer.setPointerCapture(e.pointerId);
  });

  placeLayer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startPtrX;
    const dy = e.clientY - startPtrY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    state.arOffsetX = Math.max(-420, Math.min(420, startOffX + dx));
    state.arOffsetY = Math.max(-260, Math.min(260, startOffY + dy));
    el('ar-elev-slider').value = String(Math.max(-180, Math.min(180, Math.round(state.arOffsetY))));
    applyStageTransform();
  });

  placeLayer.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    placeLayer.classList.remove('dragging');
    if (!moved) {
      const rect = studioViewport.getBoundingClientRect();
      state.arOffsetX = Math.max(-400, Math.min(400, e.clientX - (rect.left + rect.width / 2)));
      state.arOffsetY = Math.max(-220, Math.min(220, e.clientY - (rect.top + rect.height / 2)));
      el('ar-elev-slider').value = String(Math.max(-180, Math.min(180, Math.round(state.arOffsetY))));
      applyStageTransform();
    }
  });
}

// ══════════════════════════════════════════════════════════════
// CAPTURE LIVE CAMERA AR + 3D MONUMENT PHOTO SNAPSHOT
// ══════════════════════════════════════════════════════════════

async function captureARSnapshot() {
  try {
    const rect = studioViewport.getBoundingClientRect();
    const w = Math.max(1080, Math.round(rect.width * 1.5));
    const h = Math.max(680, Math.round(rect.height * 1.5));
    const ratioX = w / rect.width;
    const ratioY = h / rect.height;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    if (state.studioMode === 'camera-ar' && state.cameraActive && cameraVideo.readyState >= 2) {
      const vw = cameraVideo.videoWidth;
      const vh = cameraVideo.videoHeight;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.save();
      if (state.mirrored) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(cameraVideo, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#3B2B17');
      grad.addColorStop(1, '#0E0A06');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    const blob = await viewer.toBlob({ idealAspect: false });
    const imgUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const sw = w * state.arScale;
      const sh = h * state.arScale;
      const dx = (w - sw) / 2 + state.arOffsetX * ratioX;
      const dy = (h - sh) / 2 + state.arOffsetY * ratioY;
      ctx.drawImage(img, dx, dy, sw, sh);
      URL.revokeObjectURL(imgUrl);

      const m = getMonumentById(state.studioMonumentId);
      ctx.fillStyle = 'rgba(14, 11, 6, 0.78)';
      ctx.fillRect(28, h - 84, 420, 56);
      ctx.strokeStyle = '#C5A059';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(28, h - 84, 420, 56);
      ctx.fillStyle = '#E6C875';
      ctx.font = 'bold 17px Cinzel, serif';
      ctx.fillText(`EXHIBITX LIVE AR • ${m.name.toUpperCase()}`, 44, h - 57);
      ctx.fillStyle = '#F2E8D0';
      ctx.font = 'italic 13.5px Georgia, serif';
      ctx.fillText(`${m.location} (${m.era})`, 44, h - 38);

      const link = document.createElement('a');
      link.download = `exhibitx-${m.id}-camera-ar.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`📸 Saved Real-Life AR Photo of ${m.name}!`, 3200);
    };
    img.src = imgUrl;
  } catch (e) {
    showToast('Wait a moment for the 3D monument to finish loading, then tap Photo again.', 3500);
  }
}

// ══════════════════════════════════════════════════════════════
// WIRE UP EVENTS & INITIALIZE
// ══════════════════════════════════════════════════════════════

function init() {
  el('btn-begin-journey').addEventListener('click', () => {
    introEl.classList.add('exit');
    document.body.classList.remove('intro-active');
    setTimeout(() => {
      introEl.classList.add('hidden');
      museumPageEl.style.display = 'flex';
    }, 900);
  });

  el('nav-brand').addEventListener('click', () => selectWorld('india'));

  // Main golden CTA & Navbar pill -> Open DIRECTLY in Real-Life Live Camera AR!
  el('btn-explore-ar').addEventListener('click', () => openStudio(state.activeMonumentId, true));
  el('nav-open-studio').addEventListener('click', () => openStudio(state.activeMonumentId, true));

  // Curator info modal
  el('nav-curator-btn').addEventListener('click', () => curatorModal.classList.add('open'));
  el('curator-close-btn').addEventListener('click', () => curatorModal.classList.remove('open'));
  curatorModal.addEventListener('click', (e) => {
    if (e.target === curatorModal) curatorModal.classList.remove('open');
  });

  // Mobile Camera QR modal
  el('open-mobile-qr-btn').addEventListener('click', openMobileQrModal);
  el('mobile-qr-close-btn').addEventListener('click', () => mobileQrModal.classList.remove('open'));
  mobileQrModal.addEventListener('click', (e) => {
    if (e.target === mobileQrModal) mobileQrModal.classList.remove('open');
  });
  el('copy-https-url-btn').addEventListener('click', () => {
    if (navigator.clipboard && state.mobileHttpsUrl) {
      navigator.clipboard.writeText(state.mobileHttpsUrl);
      el('copy-https-url-btn').textContent = 'Copied ✓';
      setTimeout(() => (el('copy-https-url-btn').textContent = 'Copy'), 2200);
    }
  });

  // Audio Docent Triggers
  el('spec4-audio-btn').addEventListener('click', () => toggleDocent());
  el('docent-play-btn').addEventListener('click', () => toggleDocent());
  el('studio-audio-btn').addEventListener('click', () => toggleDocent());

  // Studio Navigation & Modes
  el('studio-back-btn').addEventListener('click', closeStudio);
  el('mode-camera-btn').addEventListener('click', () => setStudioMode('camera-ar'));
  el('mode-3d-btn').addEventListener('click', () => setStudioMode('3d'));
  el('retry-camera-btn').addEventListener('click', () => startCameraAR());
  el('fallback-3d-btn').addEventListener('click', () => setStudioMode('3d'));

  // Rotate vs Place in Camera
  el('interaction-rotate-btn').addEventListener('click', () => setInteractionMode('rotate'));
  el('interaction-move-btn').addEventListener('click', () => setInteractionMode('move'));

  // Gyroscope 3DoF Spatial Lock
  el('toggle-gyro-btn').addEventListener('click', toggleGyroAR);

  // Clean Unobstructed Real-Life AR View Toggle
  el('toggle-clean-btn').addEventListener('click', (e) => {
    state.cleanView = !state.cleanView;
    studioViewport.classList.toggle('clean-ar-view', state.cleanView);
    e.currentTarget.classList.toggle('active', state.cleanView);
    if (state.cleanView) {
      showToast('👁 Clean Real-Life AR View — Tap 👁 again to bring back the monument switcher.', 2800);
    }
  });

  // Native Phone Floor-Tracked AR (WebXR / ARCore Scene Viewer / iOS Quick Look — Zero GPS)
  el('native-ar-btn').addEventListener('click', () => {
    if (viewer.canActivateAR) {
      viewer.activateAR();
    } else {
      showToast(
        'Real Floor AR (ARCore / ARKit) works directly on Android & iOS phones — tap 📲 Phone QR to open on your phone!',
        5000
      );
      openMobileQrModal();
    }
  });

  // Auto-Rotate Toggle
  el('toggle-rotate-btn').addEventListener('click', (e) => {
    state.autoRotate = !state.autoRotate;
    if (state.autoRotate) {
      viewer.setAttribute('auto-rotate', '');
    } else {
      viewer.removeAttribute('auto-rotate');
    }
    e.currentTarget.classList.toggle('active', state.autoRotate);
  });

  // Reset Camera & Placement
  el('reset-view-btn').addEventListener('click', () => {
    const m = getMonumentById(state.studioMonumentId);
    state.arScale = 1.0;
    state.arOffsetX = 0;
    state.arOffsetY = 0;
    state.gyroBaseAlpha = null;
    state.gyroBaseBeta = null;
    el('ar-scale-slider').value = '100';
    el('ar-elev-slider').value = '0';
    applyStageTransform();
    viewer.cameraOrbit = m.cameraOrbit || '30deg 72deg 112%';
    viewer.fieldOfView = 'auto';
  });

  // Lighting Theme Buttons (for 3D Studio mode)
  document.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lightingTheme = btn.dataset.theme;
      applyViewportTheme();
    });
  });

  // Scale & Elevation Sliders
  el('ar-scale-slider').addEventListener('input', (e) => {
    state.arScale = Number(e.target.value) / 100;
    applyStageTransform();
  });
  el('ar-elev-slider').addEventListener('input', (e) => {
    state.arOffsetY = Number(e.target.value);
    applyStageTransform();
  });

  // Multi-Camera Switcher (Cycles through all detected webcams / phone rear & front lenses)
  el('flip-camera-btn').addEventListener('click', () => {
    if (state.cameras.length > 1) {
      state.cameraIndex = (state.cameraIndex + 1) % state.cameras.length;
      const nextCam = state.cameras[state.cameraIndex];
      startCameraAR(nextCam.deviceId);
      showToast(`Switched camera: ${nextCam.label || `Camera ${state.cameraIndex + 1}`}`, 2500);
    } else {
      state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
      if (state.studioMode === 'camera-ar') {
        startCameraAR();
      }
    }
  });

  // Mirror Camera Toggle
  el('mirror-camera-btn').addEventListener('click', (e) => {
    state.mirrored = !state.mirrored;
    cameraVideo.classList.toggle('mirrored', state.mirrored);
    e.currentTarget.classList.toggle('active', state.mirrored);
  });

  // Collapse/Expand Bottom Carousel
  el('toggle-drawer-btn').addEventListener('click', (e) => {
    state.drawerCollapsed = !state.drawerCollapsed;
    hudBottom.classList.toggle('collapsed', state.drawerCollapsed);
    e.currentTarget.textContent = state.drawerCollapsed ? '▴ Choose Model' : '▾ Hide List';
  });

  // AR Photo Snapshot Button
  el('snapshot-ar-btn').addEventListener('click', captureARSnapshot);

  // Move/Place Touch & Mouse Gestures
  setupMovePlaceGestures();

  viewer.addEventListener('load', () => {
    loadingBadge.classList.remove('visible');
  });
  viewer.addEventListener('model-visibility', (e) => {
    if (e.detail && e.detail.visible) {
      loadingBadge.classList.remove('visible');
    }
  });
  viewer.addEventListener('error', (e) => {
    loadingBadge.classList.remove('visible');
    showToast('Unable to load this 3D model. Check that the local server is running.', 5000);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileQrModal.classList.contains('open')) {
      mobileQrModal.classList.remove('open');
    } else if (e.key === 'Escape' && state.studioOpen) {
      closeStudio();
    } else if (!state.studioOpen && introEl.classList.contains('hidden')) {
      const worldList = getWorldMonuments(state.activeWorld);
      const idx = worldList.findIndex((m) => m.id === state.activeMonumentId);
      if (e.key === 'ArrowRight') {
        selectMonument(worldList[(idx + 1) % worldList.length].id);
      } else if (e.key === 'ArrowLeft') {
        selectMonument(worldList[(idx - 1 + worldList.length) % worldList.length].id);
      }
    }
  });

  renderMuseum();
  applyViewportTheme();
}

init();
