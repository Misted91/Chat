# CLAUDE.md — Guide du projet « Groupes de discussion »

Application de messagerie de groupe en temps réel (Firebase). Front statique
pur (HTML/CSS/JS), sans framework ni build. Hébergée sur Firebase Hosting.

- **Site en ligne** : https://chat-fd96b.firebaseapp.com (= https://chat-fd96b.web.app)
- **Projet Firebase** : `chat-fd96b`
- **Branche de dev** : `claude/keen-meitner-4544zu`

## Lancer / héberger

Auth Google exige un vrai serveur (pas `file://`). En local :

```bash
python3 -m http.server 8000   # http://localhost:8000
```

En prod, l'app est servie par Firebase Hosting. **Toujours ouvrir l'app via
`chat-fd96b.firebaseapp.com`** : c'est le même domaine que `authDomain`, donc
la connexion Google (popup) fonctionne sans blocage cross-domaine.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page (login, sidebar, chat, modales, toasts) |
| `styles.css` | Tout le style (thème sombre, responsive, scrollbars, toggles iOS) |
| `app.js` | Toute la logique UI (module ES) |
| `store.js` | Couche de données Firestore (module ES) — **seul** fichier qui parle à Firestore |
| `firebase.js` | Init Firebase (auth Google + Firestore en long-polling forcé) |
| `firestore.rules` | Règles de sécurité (source de vérité, à publier — voir plus bas) |
| `manifest.json`, `sw.js`, `icon-192/512.png` | PWA (installable, service worker cache-first-réseau) |
| `lucide.min.js` | Lucide **auto-hébergé** (v0.294.0, chargé avec `integrity`/SRI) |
| `README.md` | Doc utilisateur courte |

Chargement : `index.html` charge `lucide.min.js` (classique) puis `app.js`
(module) ; `app.js` importe `store.js` et `firebase.js`.

## Contraintes de code (à respecter)

- **Fichiers séparés** : un HTML, un CSS, un JS (+ `firestore.rules`). Pas de mélange.
- **Aucun commentaire d'explication** dans le code final (JS/CSS/HTML).
- **Aucun emoji natif** dans le code source d'interface : utiliser des icônes
  **Lucide** (`<i data-lucide="nom">`) et appeler `refreshIcons()` (=
  `window.lucide.createIcons()`) après **toute** injection dynamique d'icônes.
  Exception assumée : les **réactions** utilisent des emojis natifs (c'est du
  contenu, `EMOJIS` / `PICKER_EMOJIS` dans `app.js`).
- **Formulaires** : `id` **et** `name` uniques, `<label for>` (souvent `.sr-only`),
  attributs `aria-`.
- **100 % dynamique**, **responsive** (mobile ~400px OK).
- Pas de `eval` / `new Function` / `setTimeout(string)` (CSP).
- Aucune `alert()`/`confirm()` native : utiliser `toast(msg)` et
  `await confirmModal(msg)` (définis dans `app.js`).

## Modèle de données Firestore

```
groups/{groupId} : {
  name, createdAt, createdBy, createdByName,
  visibility: 'public' | 'private',
  memberUids: [uid...],      // accès + requête "mes groupes"
  adminUids:  [uid...],      // co-admins (le propriétaire = createdBy)
  bannedUids: [uid...],
  joinCode: 'ABC…' (16 car.)
}
  messages/{msgId} : {
    text, image, imgW, imgH, audio, author, authorName, authorPhoto,
    ts, reactions:{emoji:[uid...]}, pinned, edited, mentions:[uid...],
    replyTo, replyToName, replyToText,
    system:true, type:'poll', question, pollOptions:[], pollVotes:{idx:[uid...]}
  }
  members/{uid} : { uid, name, photo, joinedAt }
  typing/{uid}  : { name, at }
  emojis/{name} : { name, image, by }   // legacy (import retiré), purgé à la suppression

invites/{code} : { groupId, createdBy }  // pour rejoindre par code
```

- Les images/GIF sont stockées **en data URL directement dans le message**
  (pas de Firebase Storage) → compression WebP côté client (`compressImage`),
  plafonnées ~900 Ko côté client, ≤ 1 Mo dans les règles.
- Réactions modifiées via `arrayUnion`/`arrayRemove` par champ (`reactions.<emoji>`).

## Sécurité (résumé des règles)

- Lecture d'un groupe : membre, admin **ou** groupe public, et pas banni.
- Auto-adhésion : un utilisateur ne peut qu'**ajouter son propre uid** à `memberUids`.
- Message `create` : whitelist de clés + tailles bornées (`text`≤4000,
  `image`/`audio`≤1 Mo).
- Message `update` : uniquement `reactions`, ou `pollVotes`, ou l'auteur qui
  édite (`text`/`edited`), ou un admin.
- Suppression : auteur ou admin (message) ; **propriétaire** (groupe).
- `deleteGroup` purge en cascade messages/membres/typing/emojis + `invites/{code}`.

Limites connues (nécessitent le plan **Blaze**, pas encore fait) : blindage
100 % « self-only » des réactions (Cloud Function), rate-limit App Check sur les
codes, notifications push multi-groupes en arrière-plan (FCM).

## Déploiement

Le déploiement se fait avec le **compte de service** Firebase (clé fournie par
l'utilisateur en session). Depuis un environnement avec `firebase-tools` :

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json
firebase deploy --only hosting --project chat-fd96b
```

**Règles Firestore** : le SA n'a pas les droits `firebase deploy --only
firestore:rules` (403 serviceusage). On les publie via l'API REST
`firebaserules` (script `publish-rules.mjs` utilisé en session) **ou**
manuellement : console Firebase → Firestore → Règles → coller `firestore.rules`.

Après toute modif de `firestore.rules`, **republier**.

## Console Firebase — activations requises (déjà faites)

- Authentication → Google activé ; domaines autorisés incluent
  `chat-fd96b.firebaseapp.com`, `chat-fd96b.web.app`.
- Firestore Database créée (mode production) ; règles publiées.

## Notes / pièges rencontrés

- **Écoute temps réel bloquée** sur certains réseaux → Firestore est initialisé
  avec `experimentalForceLongPolling: true` (`firebase.js`). Ne pas retirer.
- Un **chargement de secours** (`getMemberGroupsOnce`) remplit les groupes si le
  temps réel tarde.
- L'écran de connexion est masqué par défaut (`hidden`) et n'apparaît qu'une
  fois l'auth résolue déconnectée → pas de flash pour les connectés.
- Toujours faire `Ctrl+Maj+R` pour tester (cache navigateur).
