const $ = id => document.getElementById(id);
let voiceBlob = null, recorder = null, chunks = [], projectData = null;

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
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      voiceBlob = new Blob(chunks, {type: recorder.mimeType || 'audio/webm'});
      $('voicePreview').src = URL.createObjectURL(voiceBlob);
      $('voicePreview').hidden = false;
      $('recordStatus').textContent = `Запись готова · ${(voiceBlob.size/1024).toFixed(0)} КБ`;
      stream.getTracks().forEach(t=>t.stop());
    };
    recorder.start();
    $('record').disabled = true; $('stop').disabled = false;
    $('recordStatus').textContent = 'Идёт запись… говори о ремонте';
  } catch(err) {
    $('recordStatus').textContent = 'Не удалось включить микрофон. Проверь разрешение браузера и HTTPS.';
  }
});
$('stop').addEventListener('click', () => {
  if(recorder && recorder.state !== 'inactive') recorder.stop();
  $('record').disabled = false; $('stop').disabled = true;
});

$('create').addEventListener('click', () => {
  const videos = [...$('videos').files], photos = [...$('photos').files];
  if(!videos.length && !photos.length) {
    $('result').textContent = 'Сначала добавь хотя бы одно видео или фотографию.';
    return;
  }
  projectData = {
    app: 'PRO AUTO CLIMAT AI',
    version: '0.1 MVP',
    createdAt: new Date().toISOString(),
    job: $('service').value.trim(),
    durationSeconds: Number($('duration').value),
    style: $('tone').value,
    contact: $('contact').value.trim(),
    voiceRecordingIncluded: Boolean(voiceBlob),
    voiceRecordingNote: voiceBlob ? 'Запись сделана; аудиофайл нужно приложить отдельно при передаче проекта в ИИ-монтажёр.' : 'Голосовая запись не добавлена.',
    media: {
      videos: videos.map(f=>({name:f.name,sizeBytes:f.size,type:f.type})),
      photos: photos.map(f=>({name:f.name,sizeBytes:f.size,type:f.type}))
    },
    editingBrief: [
      'Создать вертикальный рекламный Instagram Reel 9:16.',
      'Выбрать динамичные и визуально понятные фрагменты ремонта.',
      'Сохранить важные моменты и не выдумывать выполненные работы.',
      'Использовать оригинальную речь пользователя, если она есть.',
      'Добавить короткие русские титры, уместный юмор и контакт в финале.',
      'Не закрывать субтитрами детали ремонта.'
    ]
  };
  $('result').textContent = 'Черновик проекта подготовлен. Это пока не готовый видеоролик.';
  $('download').hidden = false;
});
$('download').addEventListener('click', () => {
  if(!projectData) return;
  const blob = new Blob([JSON.stringify(projectData,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pro-auto-climat-project.json';
  a.click();
  URL.revokeObjectURL(a.href);
});
if('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}