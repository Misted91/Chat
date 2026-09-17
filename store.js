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

  watchMemberGroups(uid, callback, onError) {
    const q = query(collection(db, 'groups'), where('memberUids', 'array-contains', uid));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  },

  async getGroup(groupId) {
    const snap = await getDoc(doc(db, 'groups', groupId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

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

    await setDoc(doc(db, 'invites', code), { groupId: ref.id, createdBy: user.uid });
    return ref;
  },

  async deleteGroup(groupId) {
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text = '', image = '', user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: text.trim(),
      image,
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      authorPhoto: user.photoURL || '',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
    });
  },

  async deleteMessage(groupId, msgId) {
    return deleteDoc(doc(db, 'groups', groupId, 'messages', msgId));
  },

  async transferAdmin(groupId, uid) {
    return updateDoc(doc(db, 'groups', groupId), { createdBy: uid });
  },

  async joinGroup(groupId, user) {
    await updateDoc(doc(db, 'groups', groupId), {
      memberUids: arrayUnion(user.uid),
    });
    return setDoc(
      doc(db, 'groups', groupId, 'members', user.uid),
      {
        uid: user.uid,
        name: user.displayName || 'Anonyme',
        photo: user.photoURL || '',
        joinedAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

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

      memberUids: banned ? arrayRemove(uid) : arrayUnion(uid),
    });
  },
};
