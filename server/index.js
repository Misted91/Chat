import express from 'express';
import cors from 'cors';
import multer from 'multer';
import admin from 'firebase-admin';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const PORT = process.env.PORT || 3000;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chat-fd96b';
const MEGA_S4_ENDPOINT = process.env.MEGA_S4_ENDPOINT;
const MEGA_S4_REGION = process.env.MEGA_S4_REGION || 'us-east-1';
const MEGA_S4_ACCESS_KEY = process.env.MEGA_S4_ACCESS_KEY;
const MEGA_S4_SECRET_KEY = process.env.MEGA_S4_SECRET_KEY;
const MEGA_S4_BUCKET = process.env.MEGA_S4_BUCKET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_BYTES || 15 * 1024 * 1024);

const MEGA_CONFIGURED = Boolean(
  MEGA_S4_ENDPOINT && MEGA_S4_ACCESS_KEY && MEGA_S4_SECRET_KEY && MEGA_S4_BUCKET && PUBLIC_BASE_URL
);
if (!MEGA_CONFIGURED) {
  console.warn(
    'Mega S4 non configuré (MEGA_S4_ENDPOINT/MEGA_S4_ACCESS_KEY/MEGA_S4_SECRET_KEY/MEGA_S4_BUCKET/PUBLIC_BASE_URL manquants) : /upload et /file répondront 503.'
  );
}

admin.initializeApp({ projectId: FIREBASE_PROJECT_ID });

const s3 = MEGA_CONFIGURED
  ? new S3Client({
      endpoint: MEGA_S4_ENDPOINT,
      region: MEGA_S4_REGION,
      credentials: {
        accessKeyId: MEGA_S4_ACCESS_KEY,
        secretAccessKey: MEGA_S4_SECRET_KEY,
      },
      forcePathStyle: process.env.MEGA_S4_FORCE_PATH_STYLE === 'true',
    })
  : null;

const app = express();
app.use(
  cors({
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false,
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

async function verifyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise.' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Jeton invalide.' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/upload', verifyAuth, upload.single('file'), async (req, res) => {
  if (!MEGA_CONFIGURED) return res.status(503).json({ error: "Service d'upload non configuré." });
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${(req.file.originalname || 'fichier').replace(/[\\/]/g, '_')}`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: MEGA_S4_BUCKET,
        Key: safeName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
    res.json({
      url: `${PUBLIC_BASE_URL}/file/${encodeURIComponent(safeName)}`,
      name: safeName,
      size: req.file.size,
      type: req.file.mimetype,
    });
  } catch (err) {
    console.error('Upload Mega S4 échoué :', err);
    res.status(502).json({ error: "Échec de l'upload vers Mega." });
  }
});

app.get('/file/:key', async (req, res) => {
  if (!MEGA_CONFIGURED) return res.status(503).json({ error: "Service d'upload non configuré." });
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: MEGA_S4_BUCKET, Key: req.params.key })
    );
    res.set('Content-Type', obj.ContentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    obj.Body.pipe(res);
  } catch (err) {
    res.status(404).json({ error: 'Fichier introuvable.' });
  }
});

app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop volumineux.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});

app.listen(PORT, () => {
  console.log(`Serveur d'upload Mega S4 démarré sur le port ${PORT}`);
});
