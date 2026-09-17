import { Store } from './store.js';
import {
  loginWithGoogle,
  logout,
  watchAuth,
  handleRedirectResult,
} from './firebase.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

let currentUser = null;
let currentGroupId = null;
let memberGroups = [];
let extraGroups = new Map();
let groups = [];
let currentMessages = [];
let currentMembers = [];
let unsubMember = null;
let unsubMessages = null;
let unsubMembers = null;

const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
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
const imageInput = document.getElementById('image-input');
const attachBtn = document.getElementById('attach-btn');
const previewOverlay = document.getElementById('preview-overlay');
const previewImg = document.getElementById('preview-img');
const previewSize = document.getElementById('preview-size');
const previewSend = document.getElementById('preview-send');
const previewCancel = document.getElementById('preview-cancel');
const previewClose = document.getElementById('preview-close');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

let pendingImage = null;

const adminOverlay = document.getElementById('admin-overlay');
const adminClose = document.getElementById('admin-close');
const memberList = document.getElementById('member-list');
const inviteCodeEl = document.getElementById('invite-code');
const copyInviteBtn = document.getElementById('copy-invite');

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
  [...extraGroups.values(), ...memberGroups].forEach((g) => map.set(g.id, g));
  groups = [...map.values()]
    .filter((g) => !isBannedFrom(g))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

function authErrorMessage(err) {
  if (err.code === 'auth/operation-not-allowed')
    return "La connexion Google n'est pas activée dans la console Firebase.";
  if (err.code === 'auth/unauthorized-domain')
    return "Ce domaine n'est pas autorisé dans Firebase.";
  return err.message;
}

handleRedirectResult().catch((err) => {
  alert('Connexion impossible : ' + authErrorMessage(err));
});

loginBtn.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    alert('Connexion impossible : ' + authErrorMessage(err));
  }
});

logoutBtn.addEventListener('click', () => logout());

sidebarToggle.addEventListener('click', () => {
  document.body.classList.toggle('sidebar-hidden');
});

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

function pruneExtra(list) {
  list.forEach((g) => extraGroups.delete(g.id));
}

function startGroupsListeners() {
  stopGroupsListeners();
  Store.getMemberGroupsOnce(currentUser.uid)
    .then((list) => {
      if (!memberGroups.length) {
        pruneExtra(list);
        memberGroups = list;
        onGroupsChanged();
      }
    })
    .catch(() => {});

  unsubMember = Store.watchMemberGroups(
    currentUser.uid,
    (list) => {
      pruneExtra(list);
      memberGroups = list;
      onGroupsChanged();
    },
    () => {}
  );
}
function stopGroupsListeners() {
  if (unsubMember) { unsubMember(); unsubMember = null; }
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

async function selectGroup(id) {
  currentGroupId = id;
  let group = currentGroup();

  if (!group) {
    try {
      group = await Store.getGroup(id);
    } catch (err) {
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

  if (currentUser) Store.joinGroup(id, currentUser).catch(() => {});

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

function buildBubble(msg) {
  const group = currentGroup();
  const isMe = currentUser && msg.author === currentUser.uid;
  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isMe ? ' me' : '') + (msg.pinned ? ' pinned' : '');
  bubble.dataset.id = msg.id;

  const meta = document.createElement('span');
  meta.className = 'meta';
  const date = msg.ts && msg.ts.toDate ? msg.ts.toDate() : new Date();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  meta.textContent = `${msg.authorName || 'Anonyme'} · ${time}`;
  if (msg.pinned) {
    const pinIcon = document.createElement('i');
    pinIcon.setAttribute('data-lucide', 'pin');
    pinIcon.setAttribute('aria-hidden', 'true');
    pinIcon.className = 'meta-pin';
    meta.appendChild(pinIcon);
  }
  bubble.appendChild(meta);

  if (msg.image) {
    const img = document.createElement('img');
    img.className = 'bubble-img';
    img.src = msg.image;
    img.alt = 'image';
    img.loading = 'lazy';
    img.addEventListener('click', () => openLightbox(msg.image));
    bubble.appendChild(img);
  }

  if (msg.text) {
    const text = document.createElement('span');
    text.className = 'text';
    text.textContent = msg.text;
    bubble.appendChild(text);
  }

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
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(() => {})
    );
    reactRow.appendChild(chip);
  });

  const addBtn = document.createElement('button');
  addBtn.className = 'reaction add';
  addBtn.setAttribute('aria-label', 'Ajouter une réaction');
  addBtn.innerHTML = '<i data-lucide="smile-plus" aria-hidden="true"></i>';
  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  picker.hidden = true;
  EMOJIS.forEach((emoji) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.addEventListener('click', () => {
      picker.hidden = true;
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(() => {});
    });
    picker.appendChild(b);
  });
  addBtn.addEventListener('click', () => { picker.hidden = !picker.hidden; });
  reactRow.appendChild(addBtn);
  reactRow.appendChild(picker);

  if (isAdminOf(group)) {
    const pinBtn = document.createElement('button');
    pinBtn.className = 'reaction pin-btn';
    pinBtn.innerHTML =
      '<i data-lucide="pin" aria-hidden="true"></i>' +
      (msg.pinned ? '<span>Désépingler</span>' : '<span>Épingler</span>');
    pinBtn.addEventListener('click', () =>
      Store.setPinned(currentGroupId, msg.id, !msg.pinned).catch(() => {})
    );
    reactRow.appendChild(pinBtn);
  }

  bubble.appendChild(reactRow);
  return bubble;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderMessages() {
  messagesEl.innerHTML = '';
  currentMessages.forEach((msg) => messagesEl.appendChild(buildBubble(msg)));
  refreshIcons();
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
    const label = document.createElement('button');
    label.className = 'pinned-text';
    label.innerHTML =
      '<i data-lucide="pin" aria-hidden="true"></i>' +
      `<span></span>`;
    label.querySelector('span').textContent = `${msg.authorName} : ${msg.text || 'image'}`;
    label.addEventListener('click', () => scrollToMessage(msg.id));
    item.appendChild(label);
    if (admin) {
      const unpin = document.createElement('button');
      unpin.className = 'pinned-unpin';
      unpin.setAttribute('aria-label', 'Désépingler');
      unpin.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
      unpin.title = 'Désépingler';
      unpin.addEventListener('click', () =>
        Store.setPinned(currentGroupId, msg.id, false).catch(() => {})
      );
      item.appendChild(unpin);
    }
    pinnedBar.appendChild(item);
  });
  refreshIcons();
}

function scrollToMessage(id) {
  const el = messagesEl.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1500);
}

adminBtn.addEventListener('click', () => {
  adminOverlay.hidden = false;
  renderAdminPanel();
});
adminClose.addEventListener('click', () => { adminOverlay.hidden = true; });
adminOverlay.addEventListener('click', (e) => {
  if (e.target === adminOverlay) adminOverlay.hidden = true;
});

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

  inviteCodeEl.textContent = group.joinCode || '------';

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
          alert('Action impossible : ' + err.message);
        })
      );
      right.appendChild(btn);
    }
    li.appendChild(right);
    memberList.appendChild(li);
  });
}

newGroupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newGroupInput.value.trim();
  if (!name || !currentUser) return;
  newGroupInput.value = '';
  try {
    const ref = await Store.addGroup(name, currentUser);
    selectGroup(ref.id);
  } catch (err) {
    alert('Impossible de créer le groupe : ' + err.message);
  }
});

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
    alert('Impossible de rejoindre : ' + err.message);
  }
});

deleteBtn.addEventListener('click', async () => {
  const group = currentGroup();
  if (!group) return;
  if (!confirm(`Supprimer le groupe « ${group.name} » ?`)) return;
  try {
    await Store.deleteGroup(currentGroupId);
    resetChat();
  } catch (err) {
    alert('Suppression impossible : ' + err.message);
  }
});

function encode(canvas, q) {
  const webp = canvas.toDataURL('image/webp', q);

  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', q);
}

function compressImage(file, maxDim = 1024, maxLen = 260000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      let q = 0.8;
      let out = encode(canvas, q);
      while (out.length > maxLen && q > 0.35) {
        q -= 0.1;
        out = encode(canvas, q);
      }
      if (out.length > maxLen) {
        const c2 = document.createElement('canvas');
        c2.width = Math.round(w * 0.7);
        c2.height = Math.round(h * 0.7);
        c2.getContext('2d').drawImage(img, 0, 0, c2.width, c2.height);
        out = encode(c2, 0.6);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
  });
}

imageInput.addEventListener('change', async () => {
  const file = imageInput.files && imageInput.files[0];
  imageInput.value = '';
  if (!file || !currentGroupId || !currentUser) return;
  if (!file.type.startsWith('image/')) return;

  attachBtn.classList.add('busy');
  try {
    const image = await compressImage(file);
    if (image.length > 900000) {
      alert('Image trop lourde même après compression, essaie une image plus petite.');
      return;
    }
    pendingImage = image;
    previewImg.src = image;
    const kb = Math.round((image.length * 0.75) / 1024);
    const type = image.startsWith('data:image/webp') ? 'WebP' : 'JPEG';
    previewSize.textContent = `~${kb} Ko · ${type}`;
    previewOverlay.hidden = false;
  } catch (err) {
    alert("Impossible de préparer l'image : " + err.message);
  } finally {
    attachBtn.classList.remove('busy');
  }
});

function closePreview() {
  previewOverlay.hidden = true;
  pendingImage = null;
  previewImg.src = '';
}
previewCancel.addEventListener('click', closePreview);
previewClose.addEventListener('click', closePreview);
previewOverlay.addEventListener('click', (e) => {
  if (e.target === previewOverlay) closePreview();
});

previewSend.addEventListener('click', async () => {
  if (!pendingImage || !currentGroupId || !currentUser) return;
  const image = pendingImage;
  const text = messageInput.value.trim();
  closePreview();
  try {
    await Store.addMessage(currentGroupId, { text, image, user: currentUser });
    messageInput.value = '';
  } catch (err) {
    alert("Impossible d'envoyer l'image : " + err.message);
  }
});

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}
lightbox.addEventListener('click', () => {
  lightbox.hidden = true;
  lightboxImg.src = '';
});

composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentGroupId || !currentUser) return;
  messageInput.value = '';
  try {
    await Store.addMessage(currentGroupId, { text, user: currentUser });
  } catch (err) {
    alert('Envoi impossible : ' + err.message);
  }
});

refreshIcons();
