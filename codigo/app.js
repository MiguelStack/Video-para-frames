const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const videoEl       = document.getElementById('video-el');
const btnExtract    = document.getElementById('btn-extract');
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const framesGrid    = document.getElementById('frames-grid');
const framesSection = document.getElementById('frames-section');
const progressWrap  = document.getElementById('progress-wrap');
const progressBar   = document.getElementById('progress-bar');
const progressPct   = document.getElementById('progress-pct');
const progressLabel = document.getElementById('progress-label');

let extractedFrames     = [];
let currentLightboxIndex = -1;

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith('video/')) loadVideo(file);
});

fileInput.addEventListener('change', e => {
  if (e.target.files[0]) loadVideo(e.target.files[0]);
});

function loadVideo(file) {
  videoEl.src = URL.createObjectURL(file);
  document.getElementById('video-preview-wrap').style.display = 'block';
  document.getElementById('meta-name').textContent = file.name;

  videoEl.addEventListener('loadedmetadata', () => {
    document.getElementById('meta-duration').textContent = formatTime(videoEl.duration);
    document.getElementById('meta-res').textContent = `${videoEl.videoWidth}×${videoEl.videoHeight}`;
    document.getElementById('meta-fps').textContent = '~30';
    btnExtract.disabled = false;
  }, { once: true });
}

btnExtract.addEventListener('click', () => {
  const unit = document.getElementById('interval-unit').value;
  if (unit === 'frame') extractByPlaying();
  else extractBySeek();
});

async function extractBySeek() {
  const interval = parseFloat(document.getElementById('interval').value) || 1;
  const format   = document.getElementById('format').value;
  const ext      = formatExt(format);

  resetUI();
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;

  const duration   = videoEl.duration;
  const timestamps = [];
  for (let t = 0; t <= duration; t += interval) timestamps.push(+t.toFixed(4));

  for (let i = 0; i < timestamps.length; i++) {
    const dataUrl = await seekAndCapture(timestamps[i], format);
    const frame   = { dataUrl, time: timestamps[i], index: i + 1, ext };
    extractedFrames.push(frame);
    updateProgress(i + 1, timestamps.length, `Frame ${i + 1} de ${timestamps.length}`);
    renderFrameCard(frame, extractedFrames.length - 1);
    await tick();
  }

  finishExtraction();
}

function seekAndCapture(time, format) {
  return new Promise(resolve => {
    function onSeeked() {
      videoEl.removeEventListener('seeked', onSeeked);
      clearTimeout(fallback);
      // Double rAF ensures the browser has painted the decoded frame
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL(format, 0.92));
      }));
    }

    const fallback = setTimeout(() => {
      videoEl.removeEventListener('seeked', onSeeked);
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(format, 0.92));
    }, 5000);

    videoEl.addEventListener('seeked', onSeeked);
    videoEl.currentTime = time;
  });
}

function extractByPlaying() {
  const everyN  = Math.max(1, Math.round(parseFloat(document.getElementById('interval').value) || 1));
  const format  = document.getElementById('format').value;
  const ext     = formatExt(format);

  resetUI();
  canvas.width  = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;

  const duration     = videoEl.duration;
  let captureCount   = 0;
  let stopped        = false;

  videoEl.pause();
  videoEl.currentTime = 0;
  videoEl.muted       = true;
  videoEl.playbackRate = 1;

  function finish() {
    if (stopped) return;
    stopped = true;
    videoEl.pause();
    finishExtraction();
  }

  videoEl.addEventListener('ended', finish, { once: true });

  function captureFrame(t) {
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    captureCount++;
    const frame = { dataUrl: canvas.toDataURL(format, 0.92), time: t, index: captureCount, ext };
    extractedFrames.push(frame);
    renderFrameCard(frame, extractedFrames.length - 1);
    const pct = Math.min(99, Math.round((t / duration) * 100));
    updateProgress(pct, 100, `Frame ${captureCount} capturado (${formatTime(t)})`);
  }

  if ('requestVideoFrameCallback' in videoEl) {
    let frameIdx = 0;
    function rvfcLoop(_, meta) {
      if (stopped) return;
      frameIdx++;
      if (frameIdx % everyN === 0) captureFrame(meta.mediaTime);
      if (!videoEl.ended) videoEl.requestVideoFrameCallback(rvfcLoop);
      else finish();
    }
    videoEl.requestVideoFrameCallback(rvfcLoop);
  } else {
    
    let frameIdx = 0;
    function rafLoop() {
      if (stopped) return;
      if (videoEl.ended || videoEl.currentTime >= duration) { finish(); return; }
      frameIdx++;
      if (frameIdx % everyN === 0) captureFrame(videoEl.currentTime);
      requestAnimationFrame(rafLoop);
    }
    requestAnimationFrame(rafLoop);
  }

  videoEl.play().catch(() => {});
}


function resetUI() {
  extractedFrames = [];
  framesGrid.innerHTML = '';
  framesSection.style.display = 'none';
  progressWrap.style.display  = 'block';
  btnExtract.disabled = true;
}

function updateProgress(current, total, label) {
  const pct = Math.min(Math.round((current / total) * 100), 99);
  progressBar.style.width  = pct + '%';
  progressPct.textContent  = pct + '%';
  progressLabel.textContent = label;
}

function finishExtraction() {
  progressBar.style.width = '100%';
  progressPct.textContent = '100%';
  setTimeout(() => {
    progressWrap.style.display  = 'none';
    framesSection.style.display = 'block';
    document.getElementById('frame-count-label').textContent = `— ${extractedFrames.length} frames`;
    btnExtract.disabled = false;
  }, 400);
}

function renderFrameCard(frame, arrayIndex) {
  const card = document.createElement('div');
  card.className = 'frame-card';
  card.style.animationDelay = `${Math.min(arrayIndex * 15, 200)}ms`;
  card.innerHTML = `
    <img src="${frame.dataUrl}" alt="Frame ${frame.index}" loading="lazy" />
    <div class="frame-footer">
      <span class="frame-num">#${String(frame.index).padStart(4, '0')}</span>
      <span class="frame-time">${formatTime(frame.time)}</span>
      <button class="btn-dl-frame">↓</button>
    </div>
  `;
  card.querySelector('img').addEventListener('click', () => openLightbox(arrayIndex));
  card.querySelector('.btn-dl-frame').addEventListener('click', e => {
    e.stopPropagation();
    downloadFrame(frame);
  });
  framesGrid.appendChild(card);
}

function downloadFrame(frame) {
  const a = document.createElement('a');
  a.href     = frame.dataUrl;
  a.download = `frame_${String(frame.index).padStart(4, '0')}.${frame.ext}`;
  a.click();
}

function formatTime(s) {
  const m   = Math.floor(s / 60);
  const sec = (s % 60).toFixed(2);
  return `${m}:${sec.padStart(5, '0')}`;
}

function formatExt(format) {
  if (format === 'image/jpeg') return 'jpg';
  if (format === 'image/png')  return 'png';
  return 'webp';
}

function tick() { return new Promise(r => setTimeout(r, 0)); }


document.getElementById('btn-dl-all').addEventListener('click', async () => {
  if (!extractedFrames.length) return;
  const zip    = new JSZip();
  const folder = zip.folder('frames');
  extractedFrames.forEach(f => {
    const base64 = f.dataUrl.split(',')[1];
    folder.file(`frame_${String(f.index).padStart(4, '0')}.${f.ext}`, base64, { base64: true });
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'frames.zip';
  a.click();
});


document.getElementById('btn-clear').addEventListener('click', () => {
  extractedFrames = [];
  framesGrid.innerHTML = '';
  framesSection.style.display = 'none';
});


framesGrid.style.setProperty('--cols', '2');

document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    framesGrid.style.setProperty('--cols', btn.dataset.cols);
  });
});


function openLightbox(index) {
  currentLightboxIndex = index;
  const frame = extractedFrames[index];
  document.getElementById('lightbox-img').src    = frame.dataUrl;
  document.getElementById('lb-frame').textContent = `Frame #${String(frame.index).padStart(4, '0')}`;
  document.getElementById('lb-time').textContent  = formatTime(frame.time);
  document.getElementById('lb-res').textContent   = `${canvas.width}×${canvas.height}`;
  document.getElementById('lightbox').classList.add('open');
}

document.getElementById('lightbox-close').addEventListener('click', () => {
  document.getElementById('lightbox').classList.remove('open');
});

document.getElementById('lightbox').addEventListener('click', e => {
  if (e.target === document.getElementById('lightbox'))
    document.getElementById('lightbox').classList.remove('open');
});

document.getElementById('lightbox-dl').addEventListener('click', () => {
  if (currentLightboxIndex >= 0) downloadFrame(extractedFrames[currentLightboxIndex]);
});

document.addEventListener('keydown', e => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape')      lb.classList.remove('open');
  if (e.key === 'ArrowRight' && currentLightboxIndex < extractedFrames.length - 1)
    openLightbox(currentLightboxIndex + 1);
  if (e.key === 'ArrowLeft' && currentLightboxIndex > 0)
    openLightbox(currentLightboxIndex - 1);
});
