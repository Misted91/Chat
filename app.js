/*
 * Logique de l'interface.
 * Auth Google + Firestore temps réel.
 * Groupes (public/privé + invitation), messages, réactions, épinglage,
 * panneau admin (paramètres + bannir).
 */
import { Store } from './store.js';
import {
  loginWithGoogle,
  logout,
  watchAuth,
  handleRedirectResult,
} from './firebase.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

// --- État ---
let currentUser = null;
let currentGroupId = null;
let publicGroups = [];
let memberGroups = [];
let extraGroups = new Map(); // groupes récupérés à la volée (rejoints à l'instant)
let groups = []; // fusion, dédupliquée
let currentMessages = [];
let currentMembers = [];
let unsubPublic = null;
let unsubMember = null;
let unsubMessages = null;
let unsubMembers = null;

// --- Références DOM ---
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');

const groupList = document.getElementById('group-list');
const newGroupForm = document.getElementById('new-group-form');
const newGroupInput = document.getElementById('new-group-input');
const joinCodeForm = document.getElementById('join-code-form');
const joinCodeInput = document.getElementById('join-code-input');

const chatTitle = document.getElementById('chat-title');
const deleteBtn = document.getElementById('delete-group');
const adminBtn = document.getElementById('admin-btn');
const pinnedBar = document.getElementById('pinned-bar');
const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const messageInput = document.getElementById('message-input');

const adminOverlay = document.getElementById('admin-overlay');
const adminClose = document.getElementById('admin-close');
const memberList = document.getElementById('member-list');
const visPublicBtn = document.getElementById('vis-public');
const visPrivateBtn = document.getElementById('vis-private');
const visibilityHint = document.getElementById('visibility-hint');
const inviteCodeEl = document.getElementById('invite-code');
const copyInviteBtn = document.getElementById('copy-invite');

// --- Helpers ---
function currentGroup() {
  return (
    groups.find((g) => g.id === currentGroupId) ||
    extraGroups.get(currentGroupId) ||
    null
  );
}
function isAdminOf(group) {
  return group && currentUser && group.createdBy === currentUser.uid;
}
function isBannedFrom(group) {
  return group && currentUser && (group.bannedUids || []).includes(currentUser.uid);
}
function mergeGroups() {
  const map = new Map();
  [...extraGroups.values(), ...publicGroups, ...memberGroups].forEach((g) =>
    map.set(g.id, g)
  );
  groups = [...map.values()]
    .filter((g) => !isBannedFrom(g))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

// --- Authentification ---
function authErrorMessage(err) {
  if (err.code === 'auth/operation-not-allowed')
    return "La connexion Google n'est pas activée dans la console Firebase.";
  if (err.code === 'auth/unauthorized-domain')
    return "Ce domaine n'est pas autorisé dans Firebase.";
  return err.message;
}

handleRedirectResult().catch((err) => {
  console.error(err);
  alert('Connexion impossible : ' + authErrorMessage(err));
});

loginBtn.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    console.error(err);
    alert('Connexion impossible : ' + authErrorMessage(err));
  }
});

logoutBtn.addEventListener('click', () => logout());

watchAuth((user) => {
  currentUser = user;
  if (user) {
    loginOverlay.hidden = true;
    userName.textContent = user.displayName || 'Utilisateur';
    if (user.photoURL) {
      userAvatar.src = user.photoURL;
      userAvatar.hidden = false;
    }
    logoutBtn.hidden = false;
    startGroupsListeners();
  } else {
    loginOverlay.hidden = false;
    logoutBtn.hidden = true;
    userAvatar.hidden = true;
    userName.textContent = '';
    stopGroupsListeners();
    resetChat();
    groupList.innerHTML = '';
  }
});

// --- Groupes (deux abonnements fusionnés) ---
function startGroupsListeners() {
  stopGroupsListeners();
  const onErr = (err) => {
    console.error('Lecture des groupes :', err);
  };
  unsubPublic = Store.watchPublicGroups((list) => {
    publicGroups = list;
    onGroupsChanged();
  }, onErr);
  unsubMember = Store.watchMemberGroups(currentUser.uid, (list) => {
    memberGroups = list;
    onGroupsChanged();
  }, onErr);
}
function stopGroupsListeners() {
  if (unsubPublic) { unsubPublic(); unsubPublic = null; }
  if (unsubMember) { unsubMember(); unsubMember = null; }
  publicGroups = [];
  memberGroups = [];
  extraGroups.clear();
}

function onGroupsChanged() {
  mergeGroups();
  renderGroups();

  const group = currentGroup();
  if (currentGroupId && !group) {
    resetChat();
  } else if (group) {
    if (isBannedFrom(group)) {
      alert('Tu as été banni de ce groupe.');
      resetChat();
      return;
    }
    chatTitle.textContent = group.name;
    adminBtn.hidden = !isAdminOf(group);
    deleteBtn.hidden = !isAdminOf(group);
    if (!adminOverlay.hidden) renderAdminPanel();
  }
}

function renderGroups() {
  groupList.innerHTML = '';
  if (groups.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aucun groupe. Crée-en un ou rejoins avec un code.';
    groupList.appendChild(li);
    return;
  }

  groups.forEach((group) => {
    const li = document.createElement('li');
    li.className = 'group-item' + (group.id === currentGroupId ? ' active' : '');

    const name = document.createElement('span');
    name.textContent = group.name;
    li.appendChild(name);

    if (group.visibility === 'private') {
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.textContent = '🔒';
      li.appendChild(lock);
    }
    if (isAdminOf(group)) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'admin';
      li.appendChild(tag);
    }

    li.addEventListener('click', () => selectGroup(group.id));
    groupList.appendChild(li);
  });
}

// --- Sélection d'un groupe ---
async function selectGroup(id) {
  currentGroupId = id;
  let group = currentGroup();

  // Pas encore dans la liste (ex. on vient de le rejoindre) → on le récupère.
  if (!group) {
    try {
      group = await Store.getGroup(id);
    } catch (err) {
      console.error(err);
    }
    if (group) {
      extraGroups.set(id, group);
      mergeGroups();
      renderGroups();
    }
  }
  if (!group || currentGroupId !== id) return;

  chatTitle.textContent = group.name;
  deleteBtn.hidden = !isAdminOf(group);
  adminBtn.hidden = !isAdminOf(group);
  composer.hidden = false;
  renderGroups();

  if (currentUser) Store.joinGroup(id, currentUser).catch(console.error);

  if (unsubMessages) unsubMessages();
  messagesEl.innerHTML = '';
  unsubMessages = Store.watchMessages(
    id,
    (messages) => {
      currentMessages = messages;
      renderMessages();
      renderPinned();
    },
    (err) => {
      console.error(err);
      resetChat();
    }
  );

  if (unsubMembers) unsubMembers();
  unsubMembers = Store.watchMembers(id, (members) => {
    currentMembers = members;
    if (!adminOverlay.hidden) renderAdminPanel();
  });
}

function resetChat() {
  currentGroupId = null;
  currentMessages = [];
  currentMembers = [];
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  if (unsubMembers) { unsubMembers(); unsubMembers = null; }
  chatTitle.textContent = 'Sélectionne un groupe';
  deleteBtn.hidden = true;
  adminBtn.hidden = true;
  composer.hidden = true;
  messagesEl.innerHTML = '';
  pinnedBar.hidden = true;
  pinnedBar.innerHTML = '';
  adminOverlay.hidden = true;
  renderGroups();
}

// --- Bulle de message ---
function buildBubble(msg) {
  const group = currentGroup();
  const isMe = currentUser && msg.author === currentUser.uid;
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isMe ? ' me' : '') + (msg.pinned ? ' pinned' : '');

  const meta = document.createElement('span');
  meta.className = 'meta';
  const date = msg.ts && msg.ts.toDate ? msg.ts.toDate() : new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${msg.authorName || 'Anonyme'} · ${time}${msg.pinned ? ' · 📌' : ''}`;
  bubble.appendChild(meta);

  const text = document.createElement('span');
  text.className = 'text';
  text.textContent = msg.text;
  bubble.appendChild(text);

  const reactions = msg.reactions || {};
  const reactRow = document.createElement('div');
  reactRow.className = 'reactions';
  Object.keys(reactions).forEach((emoji) => {
    const uids = reactions[emoji] || [];
    if (!uids.length) return;
    const chip = document.createElement('button');
    const mine = currentUser && uids.includes(currentUser.uid);
    chip.className = 'reaction' + (mine ? ' mine' : '');
    chip.textContent = `${emoji} ${uids.length}`;
    chip.addEventListener('click', () =>
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(console.error)
    );
    reactRow.appendChild(chip);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'reaction add';
  addBtn.textContent = '😊 +';
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  picker.hidden = true;
  EMOJIS.forEach((emoji) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.addEventListener('click', () => {
      picker.hidden = true;
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(console.error);
    });
    picker.appendChild(b);
  });
  addBtn.addEventListener('click', () => { picker.hidden = !picker.hidden; });
  reactRow.appendChild(addBtn);
  reactRow.appendChild(picker);

  if (isAdminOf(group)) {
    const pinBtn = document.createElement('button');
    pinBtn.className = 'reaction pin-btn';
    pinBtn.textContent = msg.pinned ? '📌 Désépingler' : '📌 Épingler';
    pinBtn.addEventListener('click', () =>
      Store.setPinned(currentGroupId, msg.id, !msg.pinned).catch(console.error)
    );
    reactRow.appendChild(pinBtn);
  }

  bubble.appendChild(reactRow);
  return bubble;
}

function renderMessages() {
  messagesEl.innerHTML = '';
  currentMessages.forEach((msg) => messagesEl.appendChild(buildBubble(msg)));
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderPinned() {
  const pinned = currentMessages.filter((m) => m.pinned);
  pinnedBar.innerHTML = '';
  if (pinned.length === 0) {
    pinnedBar.hidden = true;
    return;
  }
  pinnedBar.hidden = false;
  const admin = isAdminOf(currentGroup());
  pinned.forEach((msg) => {
    const item = document.createElement('div');
    item.className = 'pinned-item';
    const label = document.createElement('span');
    label.className = 'pinned-text';
    label.textContent = `📌 ${msg.authorName} : ${msg.text}`;
    item.appendChild(label);
    if (admin) {
      const unpin = document.createElement('button');
      unpin.className = 'pinned-unpin';
      unpin.textContent = '✕';
      unpin.title = 'Désépingler';
      unpin.addEventListener('click', () =>
        Store.setPinned(currentGroupId, msg.id, false).catch(console.error)
      );
      item.appendChild(unpin);
    }
    pinnedBar.appendChild(item);
  });
}

// --- Panneau admin (paramètres + membres) ---
adminBtn.addEventListener('click', () => {
  adminOverlay.hidden = false;
  renderAdminPanel();
});
adminClose.addEventListener('click', () => { adminOverlay.hidden = true; });
adminOverlay.addEventListener('click', (e) => {
  if (e.target === adminOverlay) adminOverlay.hidden = true;
});

visPublicBtn.addEventListener('click', () => changeVisibility('public'));
visPrivateBtn.addEventListener('click', () => changeVisibility('private'));
function changeVisibility(v) {
  if (!currentGroupId) return;
  Store.setVisibility(currentGroupId, v).catch((err) => {
    console.error(err);
    alert('Modification impossible : ' + err.message);
  });
}

copyInviteBtn.addEventListener('click', async () => {
  const code = inviteCodeEl.textContent.trim();
  try {
    await navigator.clipboard.writeText(code);
    copyInviteBtn.textContent = 'Copié !';
    setTimeout(() => (copyInviteBtn.textContent = 'Copier'), 1500);
  } catch {
    alert('Code : ' + code);
  }
});

function renderAdminPanel() {
  const group = currentGroup();
  if (!group) return;

  // Visibilité
  const vis = group.visibility || 'public';
  visPublicBtn.classList.toggle('active', vis === 'public');
  visPrivateBtn.classList.toggle('active', vis === 'private');
  visibilityHint.textContent =
    vis === 'public'
      ? 'Tout le monde voit ce groupe et peut le rejoindre.'
      : 'Seuls les membres invités (par code) voient ce groupe.';

  // Code d'invitation
  inviteCodeEl.textContent = group.joinCode || '------';

  // Membres
  renderMembers(group);
}

function renderMembers(group) {
  memberList.innerHTML = '';
  const banned = group.bannedUids || [];

  if (currentMembers.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aucun membre pour le moment.';
    memberList.appendChild(li);
    return;
  }

  currentMembers.forEach((m) => {
    const li = document.createElement('li');
    li.className = 'member';
    const name = document.createElement('span');
    name.textContent = m.name || 'Anonyme';
    li.appendChild(name);

    const right = document.createElement('span');
    right.className = 'member__right';
    if (m.uid === group.createdBy) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'admin';
      right.appendChild(tag);
    } else {
      const isBanned = banned.includes(m.uid);
      const btn = document.createElement('button');
      btn.className = isBanned ? 'btn-ghost' : 'btn-danger';
      btn.textContent = isBanned ? 'Débannir' : 'Bannir';
      btn.addEventListener('click', () =>
        Store.setBanned(currentGroupId, m.uid, !isBanned).catch((err) => {
          console.error(err);
          alert('Action impossible : ' + err.message);
        })
      );
      right.appendChild(btn);
    }
    li.appendChild(right);
    memberList.appendChild(li);
  });
}

// --- Création d'un groupe ---
newGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newGroupInput.value.trim();
  if (!name || !currentUser) return;
  newGroupInput.value = '';
  try {
    const ref = await Store.addGroup(name, currentUser);
    selectGroup(ref.id);
  } catch (err) {
    console.error(err);
    alert('Impossible de créer le groupe : ' + err.message);
  }
});

// --- Rejoindre par code ---
joinCodeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = joinCodeInput.value.trim();
  if (!code || !currentUser) return;
  try {
    const groupId = await Store.joinByCode(code, currentUser);
    joinCodeInput.value = '';
    if (!groupId) {
      alert('Code invalide.');
      return;
    }
    selectGroup(groupId);
  } catch (err) {
    console.error(err);
    alert('Impossible de rejoindre : ' + err.message);
  }
});

// --- Suppression du groupe ---
deleteBtn.addEventListener('click', async () => {
  const group = currentGroup();
  if (!group) return;
  if (!confirm(`Supprimer le groupe « ${group.name} » ?`)) return;
  try {
    await Store.deleteGroup(currentGroupId);
    resetChat();
  } catch (err) {
    console.error(err);
    alert('Suppression impossible : ' + err.message);
  }
});

// --- Envoi d'un message ---
composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentGroupId || !currentUser) return;
  messageInput.value = '';
  try {
    await Store.addMessage(currentGroupId, { text, user: currentUser });
  } catch (err) {
    console.error(err);
    alert('Envoi impossible : ' + err.message);
  }
});
