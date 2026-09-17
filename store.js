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

function makeCode(len = 8) {
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
    // Supprime aussi l'invitation associée pour ne pas laisser un code
    // orphelin qui pointerait vers un groupe supprimé.
    const snap = await getDoc(doc(db, 'groups', groupId));
    const code = snap.exists() ? snap.data().joinCode : null;
    if (code) {
      await deleteDoc(doc(db, 'invites', code)).catch(() => {});
    }
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text = '', image = '', audio = '', user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text: text.trim(),
      image,
      audio,
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

  async addSystemMessage(groupId, text, user) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      text,
      system: true,
      image: '',
      author: user.uid,
      authorName: '',
      authorPhoto: '',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
    });
  },

  async addPoll(groupId, { question, options, user }) {
    return addDoc(collection(db, 'groups', groupId, 'messages'), {
      type: 'poll',
      question: question.trim(),
      pollOptions: options,
      pollVotes: {},
      text: '',
      image: '',
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      authorPhoto: user.photoURL || '',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
    });
  },

  async votePoll(groupId, msg, index, uid) {
    // Update ciblé via FieldValue : on n'écrase plus toute la map pollVotes,
    // impossible d'altérer ou d'effacer les votes des autres.
    const old = msg.pollVotes || {};
    const update: Record<string, any> = {};
    Object.keys(old).forEach((k) => {
      update['pollVotes.' + k] = arrayRemove(uid);
    });
    const key = String(index);
    const already = (old[key] || []).includes(uid);
    if (!already) update['pollVotes.' + key] = arrayUnion(uid);
    else delete update['pollVotes.' + key];
    return updateDoc(doc(db, 'groups', groupId, 'messages', msg.id), update);
  },

  async addEmoji(groupId, { name, image, user }) {
    return setDoc(doc(db, 'groups', groupId, 'emojis', name), {
      name,
      image,
      by: user.uid,
    });
  },

  watchEmojis(groupId, callback) {
    return onSnapshot(collection(db, 'groups', groupId, 'emojis'), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  },

  async setTyping(groupId, user) {
    return setDoc(doc(db, 'groups', groupId, 'typing', user.uid), {
      name: user.displayName || 'Anonyme',
      at: serverTimestamp(),
    });
  },

  async clearTyping(groupId, uid) {
    return deleteDoc(doc(db, 'groups', groupId, 'typing', uid));
  },

  watchTyping(groupId, callback) {
    return onSnapshot(collection(db, 'groups', groupId, 'typing'), (snap) =>
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
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
    await this.addSystemMessage(
      groupId,
      `${user.displayName || 'Quelqu’un'} a rejoint le groupe`,
      user
    ).catch(() => {});
    return groupId;
  },

  async toggleReaction(groupId, message, emoji, uid) {
    // Update ciblé via FieldValue : on n'écrase plus toute la map reactions,
    // impossible d'altérer ou d'effacer les réactions des autres.
    const mine = ((message.reactions || {})[emoji] || []).includes(uid);
    const field = 'reactions.' + emoji;
    return updateDoc(doc(db, 'groups', groupId, 'messages', message.id), {
      [field]: mine ? arrayRemove(uid) : arrayUnion(uid),
    });
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
