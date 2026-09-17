/*
 * Couche de données — Firestore.
 * -------------------------------------------------------------
 * Modèle de données :
 *   groups (collection)
 *     └─ {groupId} : {
 *          name, createdAt, createdBy, createdByName,
 *          visibility: 'public' | 'private',
 *          memberUids: [uid...],   // qui a accès (public: tout le monde s'ajoute en ouvrant)
 *          bannedUids: [uid...],
 *          joinCode: 'ABC123'
 *        }
 *          ├─ messages/{msgId} : { author, authorName, text, ts, reactions{}, pinned }
 *          └─ members/{uid}    : { uid, name, joinedAt }
 *
 *   invites (collection)
 *     └─ {code} : { groupId, createdBy }   // permet de rejoindre un groupe privé par code
 */
import { db } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

function makeCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const Store = {
  /** Groupes dont l'utilisateur est membre (créés ou rejoints par code). */
  watchMemberGroups(uid, callback, onError) {
    const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  },

  /** Récupère un groupe une seule fois (pour l'ouvrir dès qu'on l'a rejoint). */
  async getGroup(groupId) {
    const snap = await getDoc(doc(db, 'groups', groupId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  /** Chargement unique des groupes (secours si le temps réel est bloqué). */
  async getMemberGroupsOnce(uid) {
    const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  watchMessages(groupId, callback, onError) {
    return onSnapshot(
      collection(db, 'groups', groupId, 'messages'),
      (snap) => {
        const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        msgs.sort((a, b) => (a.ts?.toMillis?.() || 0) - (b.ts?.toMillis?.() || 0));
        callback(msgs);
      },
      onError
    );
  },

  watchMembers(groupId, callback) {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  },

  async addGroup(name, user) {
    const code = makeCode();
    const ref = await addDoc(collection(db, 'groups'), {
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      createdByName: user.displayName || 'Anonyme',
      memberUids: [user.uid],
      bannedUids: [],
      joinCode: code,
    });
    // Enregistre le code d'invitation.
    await setDoc(doc(db, 'invites', code), { groupId: ref.id, createdBy: user.uid });
    return ref;
  },

  async deleteGroup(groupId) {
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text = '', image = '', user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: text.trim(),
      image, // image compressée en data URL (vide si aucune)
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
    });
  },

  /** Marque sa présence dans le groupe (membre + fiche). */
  async joinGroup(groupId, user) {
    await updateDoc(doc(db, 'groups', groupId), {
      memberUids: arrayUnion(user.uid),
    });
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

  /** Rejoint un groupe via un code d'invitation. Renvoie le groupId. */
  async joinByCode(code, user) {
    const inviteSnap = await getDoc(doc(db, 'invites', code.trim().toUpperCase()));
    if (!inviteSnap.exists()) return null;
    const { groupId } = inviteSnap.data();
    await this.joinGroup(groupId, user);
    return groupId;
  },

  async toggleReaction(groupId, message, emoji, uid) {
    const reactions = { ...(message.reactions || {}) };
    const users = new Set(reactions[emoji] || []);
    if (users.has(uid)) users.delete(uid);
    else users.add(uid);
    if (users.size) reactions[emoji] = [...users];
    else delete reactions[emoji];
    return updateDoc(doc(db, 'groups', groupId, 'messages', message.id), { reactions });
  },

  async setPinned(groupId, msgId, pinned) {
    return updateDoc(doc(db, 'groups', groupId, 'messages', msgId), { pinned });
  },

  async setBanned(groupId, uid, banned) {
    return updateDoc(doc(db, 'groups', groupId), {
      bannedUids: banned ? arrayUnion(uid) : arrayRemove(uid),
      // Un banni est aussi retiré des membres.
      memberUids: banned ? arrayRemove(uid) : arrayUnion(uid),
    });
  },
};
