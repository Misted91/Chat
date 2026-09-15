/*
 * Couche de données — Firestore.
 * -------------------------------------------------------------
 * Modèle de données :
 *   groups (collection)
 *     └─ {groupId} : { name, createdAt, createdBy, createdByName }
 *          └─ messages (sous-collection)
 *               └─ {msgId} : { author, authorName, text, ts }
 *
 * Les méthodes "watch*" ouvrent un abonnement temps réel (onSnapshot)
 * et renvoient une fonction de désabonnement.
 */
import { db } from './firebase.js';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const Store = {
  /** Abonnement temps réel à la liste des groupes. */
  watchGroups(callback) {
    const q = query(collection(db, 'groups'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(groups);
    });
  },

  /** Abonnement temps réel aux messages d'un groupe. */
  watchMessages(groupId, callback) {
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('ts', 'asc')
    );
    return onSnapshot(q, (snap) => {
      const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(messages);
    });
  },

  async addGroup(name, user) {
    return addDoc(collection(db, 'groups'), {
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.displayName || 'Anonyme',
    });
  },

  async deleteGroup(groupId) {
    // Note : supprime le document groupe. Les sous-collections de messages
    // doivent être nettoyées via une Cloud Function pour un vrai ménage.
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text, user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: text.trim(),
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      ts: serverTimestamp(),
    });
  },
};
