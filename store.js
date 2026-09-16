/*
 * Couche de données — Firestore.
 * -------------------------------------------------------------
 * Modèle de données :
 *   groups (collection)
 *     └─ {groupId} : { name, createdAt, createdBy, createdByName, bannedUids[] }
 *          ├─ messages (sous-collection)
 *          │    └─ {msgId} : { author, authorName, text, ts, reactions{}, pinned }
 *          └─ members (sous-collection)
 *               └─ {uid} : { uid, name, joinedAt }
 *
 * reactions = { "👍": ["uid1","uid2"], "❤️": ["uid3"] }
 */
import { db } from './firebase.js';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export const Store = {
  /** Abonnement temps réel à la liste des groupes. */
  watchGroups(callback) {
    const q = query(collection(db, 'groups'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  },

  /** Abonnement temps réel aux messages d'un groupe. */
  watchMessages(groupId, callback, onError) {
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('ts', 'asc')
    );
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  },

  /** Abonnement temps réel à la liste des membres d'un groupe. */
  watchMembers(groupId, callback) {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  },

  async addGroup(name, user) {
    return addDoc(collection(db, 'groups'), {
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.displayName || 'Anonyme',
      bannedUids: [],
    });
  },

  async deleteGroup(groupId) {
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text, user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: text.trim(),
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
    });
  },

  /** Marque sa présence dans le groupe (pour la liste des membres). */
  async joinGroup(groupId, user) {
    return setDoc(
      doc(db, 'groups', groupId, 'members', user.uid),
      {
        uid: user.uid,
        name: user.displayName || 'Anonyme',
        joinedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  /** Ajoute ou retire une réaction emoji de l'utilisateur sur un message. */
  async toggleReaction(groupId, message, emoji, uid) {
    const reactions = { ...(message.reactions || {}) };
    const users = new Set(reactions[emoji] || []);
    if (users.has(uid)) users.delete(uid);
    else users.add(uid);
    if (users.size) reactions[emoji] = [...users];
    else delete reactions[emoji];
    return updateDoc(doc(db, 'groups', groupId, 'messages', message.id), {
      reactions,
    });
  },

  /** Épingle / désépingle un message (réservé à l'admin côté interface). */
  async setPinned(groupId, msgId, pinned) {
    return updateDoc(doc(db, 'groups', groupId, 'messages', msgId), { pinned });
  },

  /** Bannit / débannit un utilisateur du groupe. */
  async setBanned(groupId, uid, banned) {
    return updateDoc(doc(db, 'groups', groupId), {
      bannedUids: banned ? arrayUnion(uid) : arrayRemove(uid),
    });
  },
};
