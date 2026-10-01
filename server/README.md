# chat-upload-server

Petit service Express qui reçoit un fichier depuis l'app et le stocke sur un
bucket **Mega S4** (service de stockage objet S3-compatible de Mega), via des
tokens (clé d'accès + clé secrète) — aucun email/mot de passe du compte Mega
n'est utilisé. Le bucket reste privé : les fichiers sont servis via
`GET /file/:key`, qui proxy l'objet depuis S4 sans jamais exposer les tokens
au client.

## Déploiement sur Coolify

Dépôt déjà sur GitHub → dans Coolify, créer un service à partir de ce dépôt
en pointant le **répertoire de build sur `server/`**, avec le type de build
**Dockerfile** (celui fourni dans ce dossier) :

- **Pourquoi Dockerfile plutôt que Nixpacks/Railpack** : ce service est un
  simple process Node (pas de framework à détecter), le `Dockerfile` fixe la
  version de Node et les étapes d'install — plus reproductible et plus rapide
  à builder que la détection automatique de Nixpacks/Railpack. Pas besoin de
  Docker Compose (un seul conteneur) ni de preset « Static » (ce n'est pas un
  site statique).

Variables d'environnement à définir (voir `.env.example`) :

- `MEGA_S4_ENDPOINT` : endpoint S3 de Mega S4 (ex. `https://s3.g.s4.mega.io`,
  voir la région choisie dans la console Mega S4).
- `MEGA_S4_REGION` : région S4 (ex. `us-east-1` si non précisé par Mega).
- `MEGA_S4_ACCESS_KEY` / `MEGA_S4_SECRET_KEY` : tokens générés dans la
  console Mega S4 (Access Key / Secret Key), scoping dédié à ce bucket.
- `MEGA_S4_BUCKET` : nom du bucket S4 créé pour les uploads.
- `PUBLIC_BASE_URL` : URL publique HTTPS de ce service une fois déployé
  (ex. `https://upload.example.com`), utilisée pour construire les liens
  `/file/:key` renvoyés aux clients.
- `ALLOWED_ORIGINS` : liste des origines autorisées en CORS, séparées par des
  virgules — doit inclure **tous** les domaines depuis lesquels l'app est
  réellement servie (ex. `https://chat-fd96b.web.app,https://chat-fd96b.firebaseapp.com,https://misted91.github.io`).
- `FIREBASE_PROJECT_ID` : `chat-fd96b`
- `MAX_FILE_SIZE_BYTES`, `PORT` : optionnels.

Une fois déployé, renseigner l'URL publique du service dans `UPLOAD_API_URL`
en haut de `app.js` côté front, puis redéployer Firebase Hosting.

## Healthcheck

Le `Dockerfile` déclare un `HEALTHCHECK` Docker (`GET /health`, toutes les
30s) : Coolify l'utilise pour savoir si le conteneur est sain (statut
"healthy"/"unhealthy" visible dans l'UI, et bascule de trafic lors d'un
déploiement). Rien à configurer en plus côté Coolify ; si besoin de définir
un healthcheck HTTP applicatif dans l'UI Coolify (onglet "Healthcheck" du
service), utiliser le chemin `/health` sur le port `3000` (ou `$PORT`).

## Sécurité

- Chaque requête `/upload` doit porter `Authorization: Bearer <idToken>`
  (jeton Firebase de l'utilisateur connecté), vérifié côté serveur avec
  `firebase-admin` (vérification du jeton public, aucune clé de service
  nécessaire).
- Les tokens Mega S4 ne quittent jamais ce service : le client reçoit
  uniquement une URL `/file/:key` servie par ce proxy.
- CORS restreint aux origines listées dans `ALLOWED_ORIGINS`.
- Taille de fichier plafonnée par `MAX_FILE_SIZE_BYTES`.
