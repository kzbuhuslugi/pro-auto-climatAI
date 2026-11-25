import express from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 10000;
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB for the first test version
const upload = multer({
  dest: path.join(os.tmpdir(), 'pro-auto-climat-uploads'),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('video/')) cb(null, true);
    else cb(new Error('Нужен видеофайл (например, MP4).'));
  }
});

app.get('/', (_req, res) => res.json({
  app: 'PRO AUTO CLIMAT AI Server',
  status: 'online',
  version: '0.1.0',
  endpoints: ['/health', '/api/analyze']
}));
app.get('/health', (_req, res) => res.json({ ok: true, geminiConfigured: Boolean(process.env.GEMINI_API_KEY) }));

app.post('/api/analyze', upload.single('video'), async (req, res) => {
  let localPath;
  let uploaded;
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'На сервере не задан GEMINI_API_KEY. Добавьте его в Environment Variables Render.' });
    }
    if (!req.file) return res.status(400).json({ error: 'Видео не получено. Отправьте файл в поле video.' });
    localPath = req.file.path;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    uploaded = await ai.files.upload({
      file: localPath,
      config: { mimeType: req.file.mimetype || 'video/mp4', displayName: req.file.originalname || 'repair-video' }
    });

    // Wait for Gemini to finish processing the uploaded video.
    let state = uploaded.state;
    for (let attempt = 0; state === 'PROCESSING' && attempt < 60; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      uploaded = await ai.files.get({ name: uploaded.name });
      state = uploaded.state;
    }
    if (state !== 'ACTIVE') {
      throw new Error(`Gemini не подготовил видео для анализа. Состояние: ${state || 'неизвестно'}. Попробуйте короткий MP4.`);
    }

    const prompt = `Ты — видеоредактор рекламных Reels для автосервиса PRO AUTO CLIMAT. Проанализируй видео ремонта автомобиля и верни только JSON без Markdown. Найди визуально интересные моменты, подходящие для короткого динамичного рекламного ролика. Не выдумывай события, которых нет в видео. Верни объект со структурой: {"summary":"краткое описание увиденного","moments":[{"start_seconds":0,"end_seconds":5,"description":"что видно","reason":"почему этот фрагмент интересен","priority":1}],"suggested_hook":"короткий заголовок на русском","voiceover_idea":"идея короткой русской озвучки","editing_notes":["совет по монтажу"],"warnings":["если есть проблемы с качеством или содержанием"]}. Укажи до 8 лучших моментов, время в секундах, priority от 1 до 5. Если точное время определить нельзя, укажи приблизительное и отметь это в description.`;

    const result = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType || req.file.mimetype || 'video/mp4' } },
          { text: prompt }
        ]
      }],
      config: { responseMimeType: 'application/json' }
    });

    const raw = result.text || '';
    let analysis;
    try { analysis = JSON.parse(raw); }
    catch { analysis = { rawText: raw, note: 'Gemini ответил не в формате JSON.' }; }
    res.json({ ok: true, fileName: req.file.originalname, analysis });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({ error: error.message || 'Ошибка анализа видео.' });
  } finally {
    if (localPath) await fs.unlink(localPath).catch(() => {});
    // Gemini Files are temporary and are automatically removed by Google after their retention period.
  }
});

app.use((err, _req, res, _next) => {
  const status = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({ error: err.message || 'Ошибка загрузки файла.' });
});

app.listen(PORT, () => console.log(`PRO AUTO CLIMAT AI server listening on ${PORT}`));
