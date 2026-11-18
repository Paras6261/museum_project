import { WINGS, MONUMENTS, ROMAN_NUMERALS } from './monuments.js';

// ══════════════════════════════════════════════════════════════
// STATE — Minimal Live Camera AR & 3D Viewer · Zero GPS
// ══════════════════════════════════════════════════════════════

const state = {
  activeWorld: 'india',
  activeMonumentId: 'taj-mahal',
  studioOpen: false,
  studioFilter: 'all',        // 'all' | 'india' | 'egypt' | 'rome'
  studioMonumentId: 'taj-mahal',
  studioMode: 'camera-ar',    // 'camera-ar' | '3d'
  interactionMode: 'rotate',  // 'rotate' | 'move'
  lightingTheme: 'golden',    // 'golden' | 'parchment' | 'obsidian'
  autoRotate: true,
  uiHidden: false,
  fullView: false,
  historyOpen: false,
  controlsPopOpen: false,

  // Spatial World-Anchor Fix (stays fixed in space when camera moves!)
  fixedInPlace: false,
  gyroAvailable: false,
  gyroBaseAlpha: null,
  gyroBaseBeta: null,
  anchorShiftX: 0,
  anchorShiftY: 0,
  opticalTimer: null,
  prevGrayFrame: null,

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
const historyCard = el('monument-history-card');
const controlsPopover = el('controls-popover');
const curatorModal = el('curator-modal');
const mobileQrModal = el('mobile-qr-modal');

// Tiny offscreen canvas for Room Lighting Match + Optical Motion Anchor
const flowW = 48;
const flowH = 36;
const flowCanvas = document.createElement('canvas');
flowCanvas.width = flowW;
flowCanvas.height = flowH;
const flowCtx = flowCanvas.getContext('2d', { willReadFrequently: true });

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function getWorldMonuments(worldId) {
  return MONUMENTS.filter((m) => m.world === worldId);
}

function getMonumentById(id) {
  return MONUMENTS.find((m) => m.id === id) || MONUMENTS[0];
}

function showToast(message, durationMs = 2600) {
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
    showToast('Audio guide not supported in this browser.');
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
  }
  const docentStatus = el('docent-status-label');
  if (docentStatus) {
    docentStatus.textContent = state.speaking ? '🎧 DOCENT GUIDE: SPEAKING' : '🎧 DOCENT GUIDE: ACTIVE';
  }
  const histAudioBtn = el('history-audio-btn');
  if (histAudioBtn) {
    histAudioBtn.textContent = state.speaking ? '⏹ Stop' : '🔊 Listen';
  }
}

// ══════════════════════════════════════════════════════════════
// RENDER MUSEUM DASHBOARD
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
  state.activeMonumentId = getWorldMonuments(worldId)[0].id;
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
// NON-OVERLAPPING HISTORY CARD (Opens on Tap Monument or ℹ️)
// ══════════════════════════════════════════════════════════════

function populateHistoryCard(m) {
  el('history-era').textContent = m.era;
  el('history-title').textContent = m.name;
  el('history-loc').textContent = `📍 ${m.location}`;
  el('history-height').textContent = m.spec1Value;
  el('history-built').textContent = m.spec2Value;
  el('history-status').textContent = m.spec3Value;
  el('history-desc').textContent = m.desc;
  el('history-cat').textContent = m.catNum;
  updateDocentUI();
}

function setHistoryOpen(open) {
  state.historyOpen = open;
  studioViewport.classList.toggle('history-open', open);
  historyCard.setAttribute('aria-hidden', open ? 'false' : 'true');
  el('toggle-history-btn').classList.toggle('active', open);
  if (open) {
    setControlsPopOpen(false);
  }
}

function setControlsPopOpen(open) {
  state.controlsPopOpen = open;
  controlsPopover.classList.toggle('open', open);
  el('toggle-controls-pop-btn').classList.toggle('active', open);
}

// ══════════════════════════════════════════════════════════════
// HIDE / SHOW ALL ICONS (👁) & FULL VIEW MODE (⛶)
// ══════════════════════════════════════════════════════════════

function setUiHidden(hidden) {
  state.uiHidden = hidden;
  studioViewport.classList.toggle('ui-hidden', hidden);
  const btn = el('toggle-hide-ui-btn');
  btn.classList.toggle('active', hidden);
  btn.textContent = hidden ? '👁‍🗨' : '👁';
  btn.title = hidden ? 'Show All Icons' : 'Hide All Icons';
  if (hidden) {
    setControlsPopOpen(false);
  }
}

async function toggleFullView() {
  state.fullView = !state.fullView;
  studioViewport.classList.toggle('full-view-mode', state.fullView);
  const btn = el('toggle-fullview-btn');
  btn.classList.toggle('active', state.fullView);
  btn.textContent = state.fullView ? '🗗' : '⛶';
  btn.title = state.fullView ? 'Exit Full View' : 'Full View Mode';

  if (state.fullView) {
    setControlsPopOpen(false);
    if (studioViewport.requestFullscreen && !document.fullscreenElement) {
      try {
        await studioViewport.requestFullscreen();
      } catch (_) {
        // CSS full-view still active
      }
    }
  } else if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch (_) {}
  }
}

// ══════════════════════════════════════════════════════════════
// FIX IN ONE PLACE WHEN CAMERA MOVES (📌)
// - Mobile: 3DoF Gyroscope World-Anchor (Zero GPS!)
// - Desktop Webcam: Lightweight Optical-Flow Motion Anchor
// ══════════════════════════════════════════════════════════════

function handleGyroAnchor(e) {
  if (!state.fixedInPlace || e.alpha == null || e.beta == null) return;
  state.gyroAvailable = true;

  if (state.gyroBaseAlpha === null) {
    state.gyroBaseAlpha = e.alpha;
    state.gyroBaseBeta = e.beta;
  }

  let dYaw = e.alpha - state.gyroBaseAlpha;
  if (dYaw > 180) dYaw -= 360;
  if (dYaw < -180) dYaw += 360;
  const dPitch = e.beta - state.gyroBaseBeta;

  // Counter-shift monument screen position so it stays anchored to the real room spot!
  const pxPerDegX = studioViewport.clientWidth / 62;
  const pxPerDegY = studioViewport.clientHeight / 58;
  const targetX = Math.max(-680, Math.min(680, dYaw * pxPerDegX));
  const targetY = Math.max(-440, Math.min(440, dPitch * pxPerDegY));

  state.anchorShiftX += (targetX - state.anchorShiftX) * 0.35;
  state.anchorShiftY += (targetY - state.anchorShiftY) * 0.35;
  applyStageTransform();

  // Also subtly match 3D viewing perspective as you pan around the fixed monument
  const theta = (30 - dYaw * 0.9).toFixed(1);
  const phi = Math.max(38, Math.min(86, 72 - dPitch * 0.5)).toFixed(1);
  viewer.cameraOrbit = `${theta}deg ${phi}deg 110%`;
}

function captureGrayFrame() {
  if (!state.cameraActive || cameraVideo.readyState < 2) return null;
  try {
    flowCtx.drawImage(cameraVideo, 0, 0, flowW, flowH);
    const data = flowCtx.getImageData(0, 0, flowW, flowH).data;
    const gray = new Uint8Array(flowW * flowH);
    let sum = 0;
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      const g = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      gray[j] = g;
      sum += g;
    }
    return { gray, avgNorm: sum / (gray.length * 255) };
  } catch (_) {
    return null;
  }
}

function startOpticalFlowAnchor() {
  stopOpticalFlowAnchor();
  state.prevGrayFrame = null;
  const maxShift = 4; // search radius in 48x36 downsampled pixels

  state.opticalTimer = setInterval(() => {
    if (!state.fixedInPlace || !state.cameraActive || state.gyroAvailable) return;
    const cur = captureGrayFrame();
    if (!cur) return;

    if (!state.prevGrayFrame) {
      state.prevGrayFrame = cur.gray;
      return;
    }

    const prev = state.prevGrayFrame;
    const curr = cur.gray;
    let bestDx = 0;
    let bestDy = 0;
    let bestErr = Infinity;

    // Fast block-matching SAD across central region to estimate camera pan/tilt
    for (let dy = -maxShift; dy <= maxShift; dy++) {
      for (let dx = -maxShift; dx <= maxShift; dx++) {
        let err = 0;
        for (let y = 6; y < flowH - 6; y += 2) {
          const rowA = y * flowW;
          const rowB = (y + dy) * flowW;
          for (let x = 6; x < flowW - 6; x += 2) {
            err += Math.abs(prev[rowA + x] - curr[rowB + x + dx]);
          }
        }
        if (err < bestErr) {
          bestErr = err;
          bestDx = dx;
          bestDy = dy;
        }
      }
    }

    state.prevGrayFrame = curr;

    // Ignore micro-jitter, smoothly translate monument with the real-world background motion
    if (Math.abs(bestDx) >= 1 || Math.abs(bestDy) >= 1) {
      const scaleX = (studioViewport.clientWidth / flowW) * 0.85 * (state.mirrored ? -1 : 1);
      const scaleY = (studioViewport.clientHeight / flowH) * 0.85;
      state.anchorShiftX = Math.max(-520, Math.min(520, state.anchorShiftX + bestDx * scaleX));
      state.anchorShiftY = Math.max(-340, Math.min(340, state.anchorShiftY + bestDy * scaleY));
      applyStageTransform();
    }
  }, 55);
}

function stopOpticalFlowAnchor() {
  if (state.opticalTimer) {
    clearInterval(state.opticalTimer);
    state.opticalTimer = null;
  }
  state.prevGrayFrame = null;
}

async function toggleFixInPlace() {
  if (state.fixedInPlace) {
    state.fixedInPlace = false;
    state.gyroAvailable = false;
    state.gyroBaseAlpha = null;
    state.gyroBaseBeta = null;
    state.anchorShiftX = 0;
    state.anchorShiftY = 0;
    window.removeEventListener('deviceorientation', handleGyroAnchor);
    stopOpticalFlowAnchor();
    el('toggle-fix-btn').classList.remove('active');
    el('anchor-status-chip').style.display = 'none';
    applyStageTransform();
    showToast('Unfixed');
    return;
  }

  // Request iOS motion permission if applicable (Zero GPS)
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      await DeviceOrientationEvent.requestPermission();
    } catch (_) {}
  }

  state.fixedInPlace = true;
  state.gyroAvailable = false;
  state.gyroBaseAlpha = null;
  state.gyroBaseBeta = null;
  state.anchorShiftX = 0;
  state.anchorShiftY = 0;

  // Pause auto-spin while fixed so the monument stands solidly in place
  if (state.autoRotate) {
    state.autoRotate = false;
    viewer.removeAttribute('auto-rotate');
    el('toggle-rotate-btn').classList.remove('active');
  }

  window.addEventListener('deviceorientation', handleGyroAnchor);
  startOpticalFlowAnchor();

  el('toggle-fix-btn').classList.add('active');
  el('anchor-status-chip').style.display = 'inline-flex';
  showToast('📌 Fixed in place — stays anchored as you move the camera');
}

// ══════════════════════════════════════════════════════════════
// REAL-TIME ROOM LIGHTING ADAPTATION
// ══════════════════════════════════════════════════════════════

function startRoomLightMatching() {
  stopRoomLightMatching();
  state.lightMatchTimer = setInterval(() => {
    if (!state.cameraActive || state.studioMode !== 'camera-ar') return;
    const frame = captureGrayFrame();
    if (!frame) return;
    const exposure = (0.8 + frame.avgNorm * 0.6).toFixed(2);
    viewer.setAttribute('exposure', exposure);
  }, 1200);
}

function stopRoomLightMatching() {
  if (state.lightMatchTimer) {
    clearInterval(state.lightMatchTimer);
    state.lightMatchTimer = null;
  }
}

// ══════════════════════════════════════════════════════════════
// STUDIO OPEN / CLOSE / MODEL PICKER
// ══════════════════════════════════════════════════════════════

function openStudio(monumentId, startInCameraAr = true) {
  state.studioOpen = true;
  state.studioMonumentId = monumentId || state.activeMonumentId;
  state.studioFilter = 'all';
  state.arOffsetX = 0;
  state.arOffsetY = 0;
  state.anchorShiftX = 0;
  state.anchorShiftY = 0;
  state.arScale = 1.0;

  setUiHidden(false);
  setHistoryOpen(false);
  setControlsPopOpen(false);
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
  if (state.fixedInPlace) toggleFixInPlace();
  if (state.fullView) toggleFullView();
  setHistoryOpen(false);
  setControlsPopOpen(false);
  setUiHidden(false);
  state.studioOpen = false;
  studioOverlay.classList.remove('open');
  document.body.style.overflow = '';
  selectMonument(state.studioMonumentId);
}

function renderModelPicker() {
  const filterBar = el('studio-filter-row');
  const filterDefs = [
    { key: 'all', label: 'All' },
    { key: 'india', label: '🇮🇳 India' },
    { key: 'egypt', label: '🇪🇬 Egypt' },
    { key: 'rome', label: '🇮🇹 Rome' },
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
      const active = m.id === state.studioMonumentId;
      return `
        <button class="model-option-card ${active ? 'active' : ''}" data-model-id="${m.id}">
          <img src="${m.bgImage}" alt="${m.name}" class="model-option-thumb" loading="lazy" />
          <div class="model-option-meta">
            <span class="model-option-name">${m.name}</span>
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
  populateHistoryCard(m);

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
    loadingBadge.classList.remove('visible');
  } else {
    loadingBadge.textContent = `⏳ ${m.name}…`;
    loadingBadge.classList.add('visible');
    viewer.setAttribute('src', m.modelPath);

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
  const x = state.arOffsetX + state.anchorShiftX;
  const y = state.arOffsetY + state.anchorShiftY;
  viewerStage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  arReticle.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y + 70}px)) perspective(360px) rotateX(70deg) scale(${Math.max(0.6, Math.min(1.4, s))})`;
  el('scale-val').textContent = `${Math.round(s * 100)}%`;
  el('elev-val').textContent = `${Math.round(state.arOffsetY)}px`;
}

function setInteractionMode(mode) {
  state.interactionMode = mode;
  el('interaction-move-btn').classList.toggle('active', mode === 'move');
  placeLayer.classList.toggle('active', mode === 'move');
  if (state.cameraActive) {
    arReticle.classList.toggle('active', mode === 'move' && !state.uiHidden && !state.fullView);
  }
  if (mode === 'move') {
    showToast('✋ Drag or tap to position');
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

// ══════════════════════════════════════════════════════════════
// LIVE CAMERA ENGINE (VIDEO ONLY — ZERO GPS)
// ══════════════════════════════════════════════════════════════

async function refreshCameraList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    state.cameras = devices.filter((d) => d.kind === 'videoinput');
  } catch (_) {
    state.cameras = [];
  }
}

function setCamDot(isLive) {
  const dot = el('cam-status-dot');
  if (dot) dot.classList.toggle('live', isLive);
}

async function startCameraAR(specificDeviceId = null) {
  cameraPromptCard.classList.remove('visible');
  setCamDot(false);

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    el('camera-prompt-title').textContent = 'HTTPS Required for Mobile Camera';
    el('camera-prompt-desc').innerHTML = 'Open over <strong>HTTPS</strong> (Vercel / 📲 QR) or <strong>localhost</strong>.';
    cameraPromptCard.classList.add('visible');
    return;
  }

  stopCameraAR();

  let stream = null;
  let lastError = null;
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
      if (err && (err.name === 'NotAllowedError' || err.name === 'NotReadableError')) break;
    }
  }

  if (!stream) {
    state.cameraActive = false;
    setCamDot(false);
    const errName = lastError ? lastError.name : '';
    if (errName === 'NotReadableError') {
      el('camera-prompt-title').textContent = 'Camera Busy';
      el('camera-prompt-desc').textContent = 'Close other apps using your camera and retry.';
    } else if (errName === 'NotFoundError') {
      el('camera-prompt-title').textContent = 'No Camera Found';
      el('camera-prompt-desc').textContent = 'Switch to 3D View or open on your phone via 📲 QR.';
    } else {
      el('camera-prompt-title').textContent = 'Camera Permission Needed';
      el('camera-prompt-desc').textContent = 'Allow camera access in your browser to see monuments live.';
    }
    cameraPromptCard.classList.add('visible');
    return;
  }

  try {
    await attachCameraStream(stream);
    await refreshCameraList();
  } catch (_) {
    state.cameraStream = stream;
    state.cameraActive = true;
    cameraVideo.classList.add('active');
    el('camera-prompt-title').textContent = 'Tap to Start Camera';
    el('camera-prompt-desc').textContent = 'Camera ready — tap below to resume live view.';
    cameraPromptCard.classList.add('visible');
  }
}

async function attachCameraStream(stream) {
  state.cameraStream = stream;
  state.cameraActive = true;
  cameraPromptCard.classList.remove('visible');

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
  setCamDot(true);
  arReticle.classList.toggle('active', state.interactionMode === 'move' && !state.uiHidden && !state.fullView);
  startRoomLightMatching();
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
  setCamDot(false);
}

function setStudioMode(mode) {
  state.studioMode = mode;
  el('mode-camera-btn').classList.toggle('active', mode === 'camera-ar');
  el('mode-3d-btn').classList.toggle('active', mode === '3d');
  el('flip-camera-btn').style.display = mode === 'camera-ar' ? 'flex' : 'none';

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
// MOBILE HTTPS QR MODAL
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
    } catch (_) {}
  }

  state.mobileHttpsUrl = targetUrl;
  el('mobile-https-url').textContent = targetUrl;
  el('mobile-qr-img').src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(targetUrl)}`;
  const certStep = el('mobile-cert-step');
  if (certStep) certStep.style.display = isLocal ? 'list-item' : 'none';
  mobileQrModal.classList.add('open');
}

// ══════════════════════════════════════════════════════════════
// GESTURES: TAP 3D MONUMENT -> HISTORY CARD & DRAG-TO-PLACE
// ══════════════════════════════════════════════════════════════

function setupMonumentTapForHistory() {
  let downX = 0;
  let downY = 0;
  let downTime = 0;

  viewer.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downTime = Date.now();
  });

  viewer.addEventListener('pointerup', (e) => {
    const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
    const elapsed = Date.now() - downTime;
    // Distinguish a clean tap/click on the 3D object from an orbit drag!
    if (dist < 6 && elapsed < 360 && !state.uiHidden) {
      setHistoryOpen(!state.historyOpen);
    }
  });
}

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
// PHOTO SNAPSHOT
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
      const dx = (w - sw) / 2 + (state.arOffsetX + state.anchorShiftX) * ratioX;
      const dy = (h - sh) / 2 + (state.arOffsetY + state.anchorShiftY) * ratioY;
      ctx.drawImage(img, dx, dy, sw, sh);
      URL.revokeObjectURL(imgUrl);

      const m = getMonumentById(state.studioMonumentId);
      const link = document.createElement('a');
      link.download = `exhibitx-${m.id}-ar.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`📸 Saved ${m.name} photo`);
    };
    img.src = imgUrl;
  } catch (_) {
    showToast('Wait for model to load, then tap 📸');
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
  el('btn-explore-ar').addEventListener('click', () => openStudio(state.activeMonumentId, true));
  el('nav-open-studio').addEventListener('click', () => openStudio(state.activeMonumentId, true));

  // Curator modal
  el('nav-curator-btn').addEventListener('click', () => curatorModal.classList.add('open'));
  el('curator-close-btn').addEventListener('click', () => curatorModal.classList.remove('open'));
  curatorModal.addEventListener('click', (e) => {
    if (e.target === curatorModal) curatorModal.classList.remove('open');
  });

  // Mobile QR modal
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

  // Audio Docent
  el('spec4-audio-btn').addEventListener('click', () => toggleDocent());
  el('docent-play-btn').addEventListener('click', () => toggleDocent());
  el('history-audio-btn').addEventListener('click', () => toggleDocent());

  // Minimal Studio Controls
  el('studio-back-btn').addEventListener('click', closeStudio);
  el('mode-camera-btn').addEventListener('click', () => setStudioMode('camera-ar'));
  el('mode-3d-btn').addEventListener('click', () => setStudioMode('3d'));
  el('retry-camera-btn').addEventListener('click', () => startCameraAR());
  el('fallback-3d-btn').addEventListener('click', () => setStudioMode('3d'));

  // Always-visible corner toggles: Hide/Show All Icons (👁) & Full View Mode (⛶)
  el('toggle-hide-ui-btn').addEventListener('click', () => setUiHidden(!state.uiHidden));
  el('toggle-fullview-btn').addEventListener('click', toggleFullView);

  // Sync fullView if user exits fullscreen with Esc
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.fullView) {
      state.fullView = false;
      studioViewport.classList.remove('full-view-mode');
      el('toggle-fullview-btn').classList.remove('active');
      el('toggle-fullview-btn').textContent = '⛶';
    }
  });

  // History & Details Card (non-overlapping)
  el('toggle-history-btn').addEventListener('click', () => setHistoryOpen(!state.historyOpen));
  el('hud-info-chip').addEventListener('click', () => setHistoryOpen(!state.historyOpen));
  el('history-close-btn').addEventListener('click', () => setHistoryOpen(false));

  // Fix in Place when moving camera (📌)
  el('toggle-fix-btn').addEventListener('click', toggleFixInPlace);

  // Move / Place Toggle (✋)
  el('interaction-move-btn').addEventListener('click', () => {
    setInteractionMode(state.interactionMode === 'move' ? 'rotate' : 'move');
  });

  // Settings Popover (⚙️)
  el('toggle-controls-pop-btn').addEventListener('click', () => setControlsPopOpen(!state.controlsPopOpen));

  // Native Real Floor AR (WebXR / ARCore / iOS Quick Look)
  el('native-ar-btn').addEventListener('click', () => {
    if (viewer.canActivateAR) {
      viewer.activateAR();
    } else {
      openMobileQrModal();
    }
  });

  // Popover controls
  el('toggle-rotate-btn').addEventListener('click', (e) => {
    state.autoRotate = !state.autoRotate;
    if (state.autoRotate) viewer.setAttribute('auto-rotate', '');
    else viewer.removeAttribute('auto-rotate');
    e.currentTarget.classList.toggle('active', state.autoRotate);
  });

  el('reset-view-btn').addEventListener('click', () => {
    const m = getMonumentById(state.studioMonumentId);
    state.arScale = 1.0;
    state.arOffsetX = 0;
    state.arOffsetY = 0;
    state.anchorShiftX = 0;
    state.anchorShiftY = 0;
    state.gyroBaseAlpha = null;
    state.gyroBaseBeta = null;
    el('ar-scale-slider').value = '100';
    el('ar-elev-slider').value = '0';
    applyStageTransform();
    viewer.cameraOrbit = m.cameraOrbit || '30deg 72deg 112%';
    viewer.fieldOfView = 'auto';
  });

  document.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.lightingTheme = btn.dataset.theme;
      applyViewportTheme();
    });
  });

  el('ar-scale-slider').addEventListener('input', (e) => {
    state.arScale = Number(e.target.value) / 100;
    applyStageTransform();
  });
  el('ar-elev-slider').addEventListener('input', (e) => {
    state.arOffsetY = Number(e.target.value);
    applyStageTransform();
  });

  el('flip-camera-btn').addEventListener('click', () => {
    if (state.cameras.length > 1) {
      state.cameraIndex = (state.cameraIndex + 1) % state.cameras.length;
      startCameraAR(state.cameras[state.cameraIndex].deviceId);
    } else {
      state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
      if (state.studioMode === 'camera-ar') startCameraAR();
    }
  });

  el('mirror-camera-btn').addEventListener('click', (e) => {
    state.mirrored = !state.mirrored;
    cameraVideo.classList.toggle('mirrored', state.mirrored);
    e.currentTarget.classList.toggle('active', state.mirrored);
  });

  el('snapshot-ar-btn').addEventListener('click', captureARSnapshot);

  // Gestures
  setupMonumentTapForHistory();
  setupMovePlaceGestures();

  viewer.addEventListener('load', () => loadingBadge.classList.remove('visible'));
  viewer.addEventListener('model-visibility', (e) => {
    if (e.detail && e.detail.visible) loadingBadge.classList.remove('visible');
  });
  viewer.addEventListener('error', () => {
    loadingBadge.classList.remove('visible');
    showToast('Could not load 3D model.');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (mobileQrModal.classList.contains('open')) mobileQrModal.classList.remove('open');
      else if (state.historyOpen) setHistoryOpen(false);
      else if (state.controlsPopOpen) setControlsPopOpen(false);
      else if (state.studioOpen) closeStudio();
    } else if (!state.studioOpen && introEl.classList.contains('hidden')) {
      const worldList = getWorldMonuments(state.activeWorld);
      const idx = worldList.findIndex((m) => m.id === state.activeMonumentId);
      if (e.key === 'ArrowRight') selectMonument(worldList[(idx + 1) % worldList.length].id);
      else if (e.key === 'ArrowLeft') selectMonument(worldList[(idx - 1 + worldList.length) % worldList.length].id);
    }
  });

  renderMuseum();
  applyViewportTheme();
}

init();
