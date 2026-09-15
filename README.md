# Groupes de discussion

Un site pour **créer des groupes de conversation** et discuter en temps réel,
avec **connexion Google** et données stockées dans **Firebase (Firestore)**.

## Utilisation

1. Connecte-toi avec Google.
2. Crée un groupe (champ + bouton **+** à gauche).
3. Ouvre un groupe, écris un message, **Envoyer** — les messages arrivent en
   temps réel pour tous les membres connectés.
4. Le créateur d'un groupe peut le **supprimer**.

## À activer une seule fois dans la console Firebase

Console : <https://console.firebase.google.com> → projet **chat-fd96b**

1. **Authentication → Sign-in method → Google** : activer.
2. **Firestore Database → Créer une base** (mode production).
3. **Firestore Database → Règles** : coller le contenu de `firestore.rules`.
4. **Authentication → Settings → Domaines autorisés** : `localhost` est déjà
   autorisé. Ajoute le domaine si tu héberges le site ailleurs (ex. GitHub Pages,
   Firebase Hosting).

## Lancer en local

Firebase Auth (popup Google) exige un vrai serveur, pas un simple `file://` :

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Structure du projet

| Fichier            | Rôle                                                    |
|--------------------|---------------------------------------------------------|
| `index.html`       | Structure de la page + écran de connexion               |
| `styles.css`       | Mise en forme                                           |
| `app.js`           | Logique de l'interface (auth, groupes, messages)        |
| `firebase.js`      | Initialisation Firebase + helpers d'authentification    |
| `store.js`         | Couche de données Firestore (temps réel)                |
| `firestore.rules`  | Règles de sécurité à coller dans la console             |

## Modèle de données (Firestore)

```
groups (collection)
  └─ {groupId} : { name, createdAt, createdBy, createdByName }
       └─ messages (sous-collection)
            └─ {msgId} : { author, authorName, text, ts }
```

> Remarque : la clé `apiKey` dans `firebase.js` est **publique par nature**
> (elle identifie le projet côté navigateur) ; la vraie sécurité vient des
> règles Firestore.
