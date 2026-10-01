import express from 'express';
import cors from 'cors';
import multer from 'multer';
import admin from 'firebase-admin';
import crypto from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

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
} else {
  console.log(
    `Mega S4 configuré : endpoint=${MEGA_S4_ENDPOINT} region=${MEGA_S4_REGION} bucket=${MEGA_S4_BUCKET} forcePathStyle=${process.env.MEGA_S4_FORCE_PATH_STYLE === 'true'} publicBaseUrl=${PUBLIC_BASE_URL}`
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

function sanitizeSegment(value, maxLen) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^\.+/, '');
  return cleaned.slice(0, maxLen) || 'x';
}

function buildFileKey(groupId, uid, hash, fileName) {
  const group = sanitizeSegment(groupId, 80);
  const user = sanitizeSegment(uid, 80);
  const name = sanitizeSegment(fileName || 'fichier', 150);
  return `${group}/${user}/${hash}/${name}`;
}

async function verifyAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    console.warn(`[auth] ${req.method} ${req.path} refusé : pas de jeton.`);
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    console.warn(`[auth] ${req.method} ${req.path} jeton invalide : ${err.message}`);
    res.status(401).json({ error: 'Jeton invalide.' });
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/upload', verifyAuth, upload.single('file'), async (req, res) => {
  if (!MEGA_CONFIGURED) {
    console.warn('[upload] refusé : Mega S4 non configuré.');
    return res.status(503).json({ error: "Service d'upload non configuré." });
  }
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });
  const groupId = req.body.groupId;
  if (!groupId) return res.status(400).json({ error: 'groupId manquant.' });

  const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex').slice(0, 24);
  const fileName = req.file.originalname || 'fichier';
  const key = buildFileKey(groupId, req.user.uid, hash, fileName);
  const startedAt = Date.now();
  console.log(
    `[upload] démarrage uid=${req.user.uid} group=${groupId} key=${key} size=${req.file.size} type=${req.file.mimetype}`
  );
  try {
    let reused = false;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: MEGA_S4_BUCKET, Key: key }));
      reused = true;
    } catch {
      await s3.send(
        new PutObjectCommand({
          Bucket: MEGA_S4_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );
    }
    console.log(
      `[upload] ${reused ? 'réutilisé (déjà présent)' : 'succès'} key=${key} en ${Date.now() - startedAt}ms`
    );
    res.json({
      url: `${PUBLIC_BASE_URL}/file/${encodeURIComponent(groupId)}/${encodeURIComponent(req.user.uid)}/${hash}/${encodeURIComponent(fileName)}`,
      name: fileName,
      size: req.file.size,
      type: req.file.mimetype,
    });
  } catch (err) {
    console.error(
      `[upload] échec key=${key} en ${Date.now() - startedAt}ms : ${err.name} ${err.Code || err.code || ''} ${err.message}`
    );
    res.status(502).json({ error: "Échec de l'upload vers Mega." });
  }
});

app.get('/file/:groupId/:userId/:hash/:fileName', async (req, res) => {
  if (!MEGA_CONFIGURED) {
    console.warn('[file] refusé : Mega S4 non configuré.');
    return res.status(503).json({ error: "Service d'upload non configuré." });
  }
  if (!/^[a-f0-9]{1,24}$/i.test(req.params.hash)) {
    return res.status(400).json({ error: 'Clé invalide.' });
  }
  const key = buildFileKey(req.params.groupId, req.params.userId, req.params.hash, req.params.fileName);
  const startedAt = Date.now();
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: MEGA_S4_BUCKET, Key: key }));
    console.log(`[file] servi key=${key} en ${Date.now() - startedAt}ms`);
    res.set('Content-Type', obj.ContentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    obj.Body.pipe(res);
  } catch (err) {
    console.error(
      `[file] introuvable key=${key} en ${Date.now() - startedAt}ms : ${err.name} ${err.Code || err.code || ''} ${err.message}`
    );
    res.status(404).json({ error: 'Fichier introuvable.' });
  }
});

app.delete('/file/:groupId/:userId/:hash/:fileName', verifyAuth, async (req, res) => {
  if (!MEGA_CONFIGURED) {
    console.warn('[file-delete] refusé : Mega S4 non configuré.');
    return res.status(503).json({ error: "Service d'upload non configuré." });
  }
  if (!/^[a-f0-9]{1,24}$/i.test(req.params.hash)) {
    return res.status(400).json({ error: 'Clé invalide.' });
  }
  const key = buildFileKey(req.params.groupId, req.params.userId, req.params.hash, req.params.fileName);
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: MEGA_S4_BUCKET, Key: key }));
    console.log(`[file-delete] supprimé uid=${req.user.uid} key=${key}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[file-delete] échec key=${key} : ${err.name} ${err.Code || err.code || ''} ${err.message}`);
    res.status(502).json({ error: 'Suppression impossible.' });
  }
});

app.delete('/group/:groupId', verifyAuth, async (req, res) => {
  if (!MEGA_CONFIGURED) {
    console.warn('[group-delete] refusé : Mega S4 non configuré.');
    return res.status(503).json({ error: "Service d'upload non configuré." });
  }
  const prefix = `${sanitizeSegment(req.params.groupId, 80)}/`;
  let deleted = 0;
  try {
    let continuationToken;
    do {
      const list = await s3.send(
        new ListObjectsV2Command({
          Bucket: MEGA_S4_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      const objects = (list.Contents || []).map((o) => ({ Key: o.Key }));
      if (objects.length) {
        await s3.send(
          new DeleteObjectsCommand({ Bucket: MEGA_S4_BUCKET, Delete: { Objects: objects } })
        );
        deleted += objects.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
    console.log(`[group-delete] uid=${req.user.uid} group=${req.params.groupId} fichiers supprimés=${deleted}`);
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error(
      `[group-delete] échec group=${req.params.groupId} (${deleted} supprimés avant échec) : ${err.name} ${err.Code || err.code || ''} ${err.message}`
    );
    res.status(502).json({ error: 'Suppression impossible.' });
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
