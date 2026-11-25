const $ = id => document.getElementById(id);
const API_BASE = 'https://pro-auto-climat-ai-server.onrender.com';
let voiceBlob = null, recorder = null, chunks = [], projectData = null, lastAnalysis = null;

function showFiles(inputId, countId, listId, noun) {
  const input = $(inputId);
  input.addEventListener('change', () => {
    const files = [...input.files];
    $(countId).textContent = files.length ? `Выбрано: ${files.length} ${noun}` : `${noun} не выбраны`;
    $(listId).innerHTML = files.map(f => `<div class="item">${escapeHtml(f.name)} <span class="hint">(${(f.size/1024/1024).toFixed(1)} МБ)</span></div>`).join('');
  });
}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
showFiles('videos','videoCount','videoList','видеофайлов');
showFiles('photos','photoCount','photoList','фотографий');

$('record').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    chunks = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      voiceBlob = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'});
      $('voicePreview').src = URL.createObjectURL(voiceBlob);
      $('voicePreview').hidden = false;
      $('recordStatus').textContent = `Запись готова · ${(voiceBlob.size/1024).toFixed(0)} КБ`;
      stream.getTracks().forEach(t=>t.stop());
    };
    recorder.start(); $('record').disabled = true; $('stop').disabled = false;
    $('recordStatus').textContent = 'Идёт запись… говори о ремонте';
  } catch(err) { $('recordStatus').textContent = 'Не удалось включить микрофон. Проверь разрешение браузера и HTTPS.'; }
});
$('stop').addEventListener('click', () => {
  if(recorder && recorder.state !== 'inactive') recorder.stop();
  $('record').disabled = false; $('stop').disabled = true;
});

$('analyze').addEventListener('click', async () => {
  const videos = [...$('videos').files];
  if (!videos.length) { $('analysisStatus').textContent = 'Сначала выбери одно видео.'; return; }
  if (videos.length > 1) { $('analysisStatus').textContent = 'Для первого теста выбери только одно видео.'; return; }
  const video = videos[0];
  if (video.size > 200 * 1024 * 1024) { $('analysisStatus').textContent = 'Файл больше 200 МБ. Для первого теста выбери видео меньшего размера.'; return; }
  $('analyze').disabled = true; $('analysisResult').hidden = true;
  $('analysisStatus').textContent = 'Отправляем видео на сервер. Не закрывай страницу…';
  try {
    const form = new FormData();
    form.append('video', video, video.name);
    const service = $('service').value.trim();
    if (service) form.append('job', service);
    $('analysisStatus').textContent = 'Gemini обрабатывает видео. Это может занять несколько минут…';
    const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `Ошибка сервера: ${response.status}`);
    lastAnalysis = data.analysis;
    renderAnalysis(lastAnalysis);
    $('analysisStatus').textContent = 'Анализ завершён. Проверь таймкоды и описание.';
  } catch (err) {
    $('analysisStatus').textContent = `Не удалось выполнить анализ: ${err.message}`;
  } finally { $('analyze').disabled = false; }
});

function renderAnalysis(a) {
  const box = $('analysisResult');
  box.hidden = false;
  if (!a || typeof a !== 'object') { box.textContent = JSON.stringify(a, null, 2); return; }
  let html = '';
  if (a.summary) html += `<strong>Что увидел ИИ</strong>\n${escapeHtml(String(a.summary))}\n\n`;
  if (a.suggested_hook) html += `<strong>Заголовок</strong>\n${escapeHtml(String(a.suggested_hook))}\n\n`;
  if (a.voiceover_idea) html += `<strong>Идея озвучки</strong>\n${escapeHtml(String(a.voiceover_idea))}\n\n`;
  if (Array.isArray(a.moments)) {
    html += '<strong>Лучшие фрагменты</strong>\n';
    for (const m of a.moments) {
      const start = Number(m.start_seconds);
      const end = Number(m.end_seconds);
      html += `<div class="moment"><b>${Number.isFinite(start)?formatTime(start):'?'} – ${Number.isFinite(end)?formatTime(end):'?'}</b> · Приоритет ${escapeHtml(String(m.priority ?? '—'))}\n${escapeHtml(String(m.description || ''))}\n<span class="hint">${escapeHtml(String(m.reason || ''))}</span></div>`;
    }
  }
  if (Array.isArray(a.editing_notes) && a.editing_notes.length) html += `\n<strong>Советы по монтажу</strong>\n${a.editing_notes.map(x=>'• '+escapeHtml(String(x))).join('\n')}`;
  if (Array.isArray(a.warnings) && a.warnings.length) html += `\n\n<strong>Замечания</strong>\n${a.warnings.map(x=>'• '+escapeHtml(String(x))).join('\n')}`;
  if (!html) html = escapeHtml(JSON.stringify(a, null, 2));
  box.innerHTML = html;
}
function formatTime(sec) { const s=Math.max(0,Math.floor(sec)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

$('create').addEventListener('click', () => {
  const videos = [...$('videos').files], photos = [...$('photos').files];
  if(!videos.length && !photos.length) { $('result').textContent = 'Сначала добавь хотя бы одно видео или фотографию.'; return; }
  projectData = {
    app: 'PRO AUTO CLIMAT AI', version: '0.2 MVP', createdAt: new Date().toISOString(),
    job: $('service').value.trim(), durationSeconds: Number($('duration').value),
    style: $('tone').value, contact: $('contact').value.trim(),
    voiceRecordingIncluded: Boolean(voiceBlob),
    voiceRecordingNote: voiceBlob ? 'Запись сделана; аудиофайл пока не включён в JSON.' : 'Голосовая запись не добавлена.',
    media: { videos: videos.map(f=>({name:f.name,sizeBytes:f.size,type:f.type})), photos: photos.map(f=>({name:f.name,sizeBytes:f.size,type:f.type})) },
    analysis: lastAnalysis,
    editingBrief: ['Создать вертикальный рекламный Instagram Reel 9:16.','Использовать только реально присутствующие в видео события.','Собрать лучшие моменты по результатам анализа Gemini.','Добавить русские титры, уместный юмор и контакт в финале.']
  };
  $('result').textContent = 'Черновик проекта подготовлен. Это JSON-план, не готовый видеоролик.';
  $('download').hidden = false;
});
$('download').addEventListener('click', () => {
  if(!projectData) return;
  const blob = new Blob([JSON.stringify(projectData,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'pro-auto-climat-project.json'; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
if('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
