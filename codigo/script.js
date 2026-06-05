const videoInput = document.getElementById('videoInput');
const extractBtn = document.getElementById('extractBtn');
const uploadArea = document.getElementById('uploadArea');
const fileTag = document.getElementById('fileTag');
const progressBox = document.getElementById('progressBox');
const fill = document.getElementById('fill');
const progPct = document.getElementById('progPct');
const progMsg = document.getElementById('progMsg');
const resultBox = document.getElementById('resultBox');
const previewStrip = document.getElementById('previewStrip');

let selectedFile = null;
let zipBlobUrl = null;

videoInput.addEventListener('change', () => { if (videoInput.files[0]) selectFile(videoInput.files[0]); });
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragging'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragging'));
uploadArea.addEventListener('drop', e => {
  e.preventDefault(); uploadArea.classList.remove('dragging');
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});

function selectFile(f) {
  selectedFile = f;
  fileTag.style.display = 'block';
  fileTag.textContent = f.name + ' · ' + (f.size / 1024 / 1024).toFixed(1) + ' MB';
  extractBtn.disabled = false;
  resultBox.style.display = 'none';
  if (zipBlobUrl) { URL.revokeObjectURL(zipBlobUrl); zipBlobUrl = null; }
}

function setProgress(pct, msg) {
  if (pct !== null) {
    fill.style.width = pct + '%';
    progPct.textContent = pct + '%';
  }
  if (msg) progMsg.textContent = msg;
}

async function runExtract() {
  if (!selectedFile) return;
  extractBtn.disabled = true;
  progressBox.style.display = 'block';
  resultBox.style.display = 'none';
  previewStrip.innerHTML = '';
  setProgress(5, 'Carregando FFmpeg...');

  try {
    const { FFmpeg } = FFmpegWASM;
    const { fetchFile, toBlobURL } = FFmpegUtil;
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      const m = message.match(/frame=\s*(\d+)/);
      if (m) setProgress(null, 'Extraindo frame ' + parseInt(m[1]).toLocaleString('pt-BR') + '...');
    });

    ffmpeg.on('progress', ({ progress }) => {
      const p = Math.max(5, Math.min(90, Math.round(progress * 100)));
      fill.style.width = p + '%';
      progPct.textContent = p + '%';
    });

    setProgress(8, 'Baixando FFmpeg WASM (primeira vez pode demorar)...');
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
    });

    setProgress(20, 'Lendo vídeo...');
    const ext = selectedFile.name.split('.').pop() || 'mp4';
    await ffmpeg.writeFile('input.' + ext, await fetchFile(selectedFile));

    setProgress(30, 'Extraindo frames...');
    await ffmpeg.exec(['-i', 'input.' + ext, '-q:v', '3', 'frame_%06d.jpg']);

    setProgress(80, 'Lendo arquivos...');
    const files = await ffmpeg.listDir('/');
    const frameFiles = files.map(f => f.name).filter(n => /^frame_\d+\.jpg$/.test(n)).sort();

    if (!frameFiles.length) throw new Error('Nenhum frame extraído. Verifique se o vídeo é válido.');

    setProgress(82, `Compactando ${frameFiles.length.toLocaleString('pt-BR')} frames...`);

    const zip = new JSZip();
    const previews = [];

    for (let i = 0; i < frameFiles.length; i++) {
      const data = await ffmpeg.readFile(frameFiles[i]);
      zip.file(frameFiles[i], data);
      if (previews.length < 8) previews.push(URL.createObjectURL(new Blob([data], { type: 'image/jpeg' })));
      if (i % 50 === 0) {
        const p = 82 + Math.round((i / frameFiles.length) * 13);
        fill.style.width = p + '%';
        progPct.textContent = p + '%';
      }
    }

    setProgress(97, 'Gerando ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl);
    zipBlobUrl = URL.createObjectURL(zipBlob);

    const dlBtn = document.getElementById('dlBtn');
    dlBtn.href = zipBlobUrl;
    dlBtn.download = 'frames.zip';
    dlBtn.textContent = `↓ Baixar frames.zip (${(zipBlob.size / 1024 / 1024).toFixed(1)} MB)`;

    document.getElementById('statsGrid').innerHTML = `
      <div class="stat"><div class="stat-val">${frameFiles.length.toLocaleString('pt-BR')}</div><div class="stat-lbl">frames</div></div>
      <div class="stat"><div class="stat-val">${(selectedFile.size / 1024 / 1024).toFixed(1)} MB</div><div class="stat-lbl">vídeo original</div></div>
      <div class="stat"><div class="stat-val">${(zipBlob.size / 1024 / 1024).toFixed(1)} MB</div><div class="stat-lbl">zip gerado</div></div>
    `;

    previews.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      previewStrip.appendChild(img);
    });

    progressBox.style.display = 'none';
    resultBox.className = 'result-box ok';
    resultBox.style.display = 'block';
    document.getElementById('resultHeader').textContent = '✓ Extração concluída';
    fill.classList.remove('pulse');

  } catch (e) {
    progressBox.style.display = 'none';
    resultBox.className = 'result-box err';
    resultBox.style.display = 'block';
    document.getElementById('resultHeader').textContent = '✗ ' + (e.message || String(e));
    document.getElementById('statsGrid').innerHTML = '';
    previewStrip.style.display = 'none';
    document.getElementById('dlBtn').style.display = 'none';
  }

  extractBtn.disabled = false;
}
