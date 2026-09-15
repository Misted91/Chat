# Groupes de discussion

Un petit site pour **créer des groupes de conversation** et échanger des messages
dans chaque groupe. Aucune installation : ouvre simplement `index.html` dans un
navigateur.

## Utilisation

1. Ouvre `index.html` (double-clic, ou via un petit serveur local — voir plus bas).
2. Tape un nom dans le champ « Nom du nouveau groupe… » puis clique sur **+**.
3. Clique sur un groupe pour l'ouvrir, écris un message et **Envoyer**.
4. Le bouton **Supprimer** retire le groupe sélectionné.

Les données sont pour l'instant enregistrées dans le navigateur (localStorage) :
elles restent d'une visite à l'autre, mais uniquement sur ta machine.

### Lancer avec un serveur local (recommandé)

```bash
python3 -m http.server 8000
# puis ouvre http://localhost:8000
```

## Structure du projet

| Fichier      | Rôle                                                        |
|--------------|-------------------------------------------------------------|
| `index.html` | Structure de la page                                        |
| `styles.css` | Mise en forme                                               |
| `app.js`     | Logique de l'interface (groupes, messages)                  |
| `store.js`   | **Couche de données** — à remplacer par Firebase plus tard  |

## Brancher Firebase + connexion Google (étape suivante)

Le code est déjà organisé pour ça : toute la lecture/écriture passe par `store.js`.
Pour ajouter Firebase, il suffira de :

1. Créer un projet sur [console.firebase.google.com](https://console.firebase.google.com).
2. Activer **Authentication → Google** et **Firestore Database**.
3. Ajouter le SDK Firebase dans `index.html` et remplacer l'implémentation
   `localStorage` de `store.js` par des appels Firestore (`collection`, `addDoc`,
   `onSnapshot`…), en gardant les mêmes noms de méthodes (`getGroups`, `addGroup`,
   `addMessage`, `deleteGroup`).
4. Remplacer la variable `currentUser` (dans `app.js`) et la zone `#user-zone`
   (dans `index.html`) par le compte Google connecté via
   `signInWithPopup(auth, new GoogleAuthProvider())`.

Comme `app.js` ne dépend que de l'API de `store.js`, l'interface n'aura pas
besoin d'être réécrite.
