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
  writeBatch,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

function makeCode(len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const Store = {

  watchPublicGroups(callback, onError) {
    const q = query(collection(db, 'groups'), where('visibility', '==', 'public'));
    return onSnapshot(
      q,
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      onError
    );
  },

  async setVisibility(groupId, visibility) {
    return updateDoc(doc(db, 'groups', groupId), { visibility });
  },

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
      visibility: 'private',
      memberUids: [user.uid],
      adminUids: [],
      bannedUids: [],
      joinCode: code,
    });

    await setDoc(doc(db, 'invites', code), { groupId: ref.id, createdBy: user.uid });
    return ref;
  },

  async deleteGroup(groupId, joinCode) {
    const subs = ['messages', 'members', 'typing', 'emojis'];
    for (const sub of subs) {
      const snap = await getDocs(collection(db, 'groups', groupId, sub));
      let batch = writeBatch(db);
      let n = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        if (++n >= 450) { await batch.commit(); batch = writeBatch(db); n = 0; }
      }
      if (n) await batch.commit();
    }
    if (joinCode) await deleteDoc(doc(db, 'invites', joinCode)).catch(() => {});
    return deleteDoc(doc(db, 'groups', groupId));
  },

  async addMessage(groupId, { text = '', image = '', imgW = 0, imgH = 0, audio = '', user, reply = null, mentions = [] }) {
    const data = {
      text: text.trim(),
      image,
      audio,
      author: user.uid,
      authorName: user.displayName || 'Anonyme',
      authorPhoto: user.photoURL || '',
      ts: serverTimestamp(),
      reactions: {},
      pinned: false,
      mentions,
    };
    if (image && imgW && imgH) { data.imgW = imgW; data.imgH = imgH; }
    if (reply) {
      data.replyTo = reply.id;
      data.replyToName = reply.name;
      data.replyToText = reply.text;
    }
    return addDoc(collection(db, 'groups', groupId, 'messages'), data);
  },

  async deleteMessage(groupId, msgId) {
    return deleteDoc(doc(db, 'groups', groupId, 'messages', msgId));
  },

  async editMessage(groupId, msgId, text) {
    return updateDoc(doc(db, 'groups', groupId, 'messages', msgId), {
      text: text.trim(),
      edited: true,
    });
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
    const votes = {};
    const old = msg.pollVotes || {};
    Object.keys(old).forEach((k) => {
      votes[k] = (old[k] || []).filter((u) => u !== uid);
    });
    const key = String(index);
    const already = (old[key] || []).includes(uid);
    if (!already) votes[key] = [...(votes[key] || []), uid];
    return updateDoc(doc(db, 'groups', groupId, 'messages', msg.id), { pollVotes: votes });
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

  async renameGroup(groupId, name) {
    return updateDoc(doc(db, 'groups', groupId), { name: name.trim() });
  },

  async setAdmin(groupId, uid, make) {
    return updateDoc(doc(db, 'groups', groupId), {
      adminUids: make ? arrayUnion(uid) : arrayRemove(uid),
    });
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
    const has = ((message.reactions || {})[emoji] || []).includes(uid);
    return updateDoc(doc(db, 'groups', groupId, 'messages', message.id), {
      ['reactions.' + emoji]: has ? arrayRemove(uid) : arrayUnion(uid),
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
