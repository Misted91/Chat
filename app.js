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
const micBtn = document.getElementById('mic-btn');
const audioInput = document.getElementById('audio-input');
const audioBar = document.getElementById('audio-bar');
const audioStatus = document.getElementById('audio-status');
const audioPreview = document.getElementById('audio-preview');
const audioStop = document.getElementById('audio-stop');
const audioCancel = document.getElementById('audio-cancel');
const audioSend = document.getElementById('audio-send');

let mediaRecorder = null;
let audioChunks = [];
let recTimer = null;
let recSeconds = 0;
let pendingAudio = null;
const AUDIO_MAX_LEN = 900000;
const REC_MAX_SECONDS = 30;
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
const typingEl = document.getElementById('typing');
const notifBtn = document.getElementById('notif-btn');
const installBtn = document.getElementById('install-btn');

const pollBtn = document.getElementById('poll-btn');
const pollOverlay = document.getElementById('poll-overlay');
const pollClose = document.getElementById('poll-close');
const pollCancel = document.getElementById('poll-cancel');
const pollForm = document.getElementById('poll-form');
const pollQuestion = document.getElementById('poll-question');
const pollOptionsEl = document.getElementById('poll-options');
const pollAddOption = document.getElementById('poll-add-option');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPop = document.getElementById('emoji-pop');
const timeBtn = document.getElementById('time-btn');

let emojiMap = {};
let currentEmojis = [];
let unsubEmojis = null;
let unsubTyping = null;
let typingTimer = null;
let lastTypingWrite = 0;
let knownMessageIds = new Set();
let deferredInstall = null;
let notifOn = localStorage.getItem('notif') === '1';

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

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function formatDiscordTs(sec, fmt) {
  const d = new Date(sec * 1000);
  if (fmt === 'R') {
    return `<span class="msg-time" data-ms="${d.getTime()}" title="${d.toLocaleString('fr-FR')}">${relativeTime(d)}</span>`;
  }
  let out;
  if (fmt === 't') out = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  else if (fmt === 'T') out = d.toLocaleTimeString('fr-FR');
  else if (fmt === 'd') out = d.toLocaleDateString('fr-FR');
  else if (fmt === 'D') out = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  else if (fmt === 'F') out = d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
  else out = d.toLocaleString('fr-FR');
  return `<span class="md-ts">${out}</span>`;
}

function renderMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/```([\s\S]+?)```/g, (m, c) => `<pre class="md-code">${c.trim()}</pre>`);
  s = s.replace(/`([^`\n]+?)`/g, '<code class="md-inline">$1</code>');
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  s = s.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  s = s.replace(/^&gt; ?(.*)$/gm, '<span class="md-quote">$1</span>');
  s = s.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (m, sec, fmt) => formatDiscordTs(Number(sec), fmt || 'f'));
  s = s.replace(/:([a-zA-Z0-9_]+):/g, (m, name) =>
    emojiMap[name] ? `<img class="custom-emoji" src="${emojiMap[name]}" alt=":${name}:" />` : m
  );
  s = s.replace(/\n/g, '<br>');
  return s;
}

function relativeTime(date) {
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 45) return "à l'instant";
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return date.toLocaleDateString('fr-FR');
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
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
    notifBtn.hidden = false;
    startGroupsListeners();
  } else {
    loginOverlay.hidden = false;
    logoutBtn.hidden = true;
    notifBtn.hidden = true;
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
    adminBtn.hidden = false;
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
  adminBtn.hidden = false;
  composer.hidden = false;
  renderGroups();

  if (currentUser) Store.joinGroup(id, currentUser).catch(() => {});

  if (unsubMessages) unsubMessages();
  messagesEl.innerHTML = '';
  knownMessageIds = new Set();
  unsubMessages = Store.watchMessages(
    id,
    (messages) => {
      maybeNotify(messages);
      currentMessages = messages;
      renderMessages();
      renderPinned();
    },
    () => resetChat()
  );

  if (unsubMembers) unsubMembers();
  unsubMembers = Store.watchMembers(id, (members) => {
    currentMembers = members;
    if (!adminOverlay.hidden) renderAdminPanel();
  });

  if (unsubTyping) unsubTyping();
  unsubTyping = Store.watchTyping(id, renderTyping);

  if (unsubEmojis) unsubEmojis();
  unsubEmojis = Store.watchEmojis(id, (list) => {
    currentEmojis = list;
    emojiMap = {};
    list.forEach((e) => (emojiMap[e.name] = e.image));
    if (!emojiPop.hidden) renderEmojiPop();
  });
}

function maybeNotify(messages) {
  const first = knownMessageIds.size === 0;
  messages.forEach((m) => {
    const isNew = !knownMessageIds.has(m.id);
    knownMessageIds.add(m.id);
    if (first || isNew === false) return;
    if (m.system || !currentUser || m.author === currentUser.uid) return;
    if (notifOn && document.hidden && window.Notification && Notification.permission === 'granted') {
      const body = m.text || (m.image ? 'Image' : '');
      new Notification(m.authorName || 'Nouveau message', { body });
    }
  });
}

function renderTyping(list) {
  const now = Date.now();
  const others = list.filter((t) => {
    if (!currentUser || t.id === currentUser.uid) return false;
    const at = t.at && t.at.toMillis ? t.at.toMillis() : 0;
    return now - at < 6000;
  });
  if (others.length === 0) {
    typingEl.hidden = true;
    typingEl.textContent = '';
    return;
  }
  const names = others.map((t) => t.name).join(', ');
  typingEl.hidden = false;
  typingEl.textContent =
    others.length === 1 ? `${names} est en train d'écrire…` : `${names} sont en train d'écrire…`;
}

function resetChat() {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  resetAudioBar();
  if (unsubEmojis) { unsubEmojis(); unsubEmojis = null; }
  emojiMap = {};
  currentEmojis = [];
  emojiPop.hidden = true;
  if (unsubTyping) { unsubTyping(); unsubTyping = null; }
  if (currentGroupId && currentUser) Store.clearTyping(currentGroupId, currentUser.uid).catch(() => {});
  typingEl.hidden = true;
  typingEl.textContent = '';
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

  if (msg.system) {
    const sys = document.createElement('div');
    sys.className = 'system-msg';
    sys.dataset.id = msg.id;
    sys.textContent = msg.text;
    return sys;
  }

  const isMe = currentUser && msg.author === currentUser.uid;

  const row = document.createElement('div');
  row.className = 'msg-row' + (isMe ? ' me' : '');
  row.dataset.id = msg.id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  if (msg.authorPhoto) {
    const im = document.createElement('img');
    im.src = msg.authorPhoto;
    im.alt = '';
    avatar.appendChild(im);
  } else {
    avatar.textContent = initials(msg.authorName);
  }
  row.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'bubble' + (isMe ? ' me' : '') + (msg.pinned ? ' pinned' : '');
  bubble.dataset.id = msg.id;

  const meta = document.createElement('span');
  meta.className = 'meta';
  const date = msg.ts && msg.ts.toDate ? msg.ts.toDate() : new Date();
  const who = document.createElement('span');
  who.textContent = `${msg.authorName || 'Anonyme'} · `;
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.dataset.ms = date.getTime();
  timeEl.title = date.toLocaleString('fr-FR');
  timeEl.textContent = relativeTime(date);
  meta.appendChild(who);
  meta.appendChild(timeEl);
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

  if (msg.type === 'poll') {
    bubble.appendChild(buildPoll(msg));
  }

  if (msg.audio) {
    const audio = document.createElement('audio');
    audio.className = 'bubble-audio';
    audio.controls = true;
    audio.src = msg.audio;
    audio.preload = 'none';
    bubble.appendChild(audio);
  }

  if (msg.text) {
    const text = document.createElement('span');
    text.className = 'text';
    text.innerHTML = renderMarkdown(msg.text);
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

  if (isMe || isAdminOf(group)) {
    const delBtn = document.createElement('button');
    delBtn.className = 'reaction del-btn';
    delBtn.setAttribute('aria-label', 'Supprimer le message');
    delBtn.innerHTML = '<i data-lucide="trash-2" aria-hidden="true"></i>';
    delBtn.addEventListener('click', () => {
      if (!confirm('Supprimer ce message ?')) return;
      Store.deleteMessage(currentGroupId, msg.id).catch((err) =>
        alert('Suppression impossible : ' + err.message)
      );
    });
    reactRow.appendChild(delBtn);
  }

  bubble.appendChild(reactRow);
  row.appendChild(bubble);
  return row;
}

function buildPoll(msg) {
  const wrap = document.createElement('div');
  wrap.className = 'poll';
  const q = document.createElement('div');
  q.className = 'poll-q';
  q.textContent = msg.question || 'Sondage';
  wrap.appendChild(q);

  const votes = msg.pollVotes || {};
  let total = 0;
  Object.keys(votes).forEach((k) => (total += (votes[k] || []).length));

  (msg.pollOptions || []).forEach((opt, i) => {
    const voters = votes[String(i)] || [];
    const pct = total ? Math.round((voters.length / total) * 100) : 0;
    const mine = currentUser && voters.includes(currentUser.uid);

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'poll-opt' + (mine ? ' voted' : '');
    row.addEventListener('click', () =>
      Store.votePoll(currentGroupId, msg, i, currentUser.uid).catch(() => {})
    );

    const bar = document.createElement('span');
    bar.className = 'poll-bar';
    bar.style.width = pct + '%';

    const label = document.createElement('span');
    label.className = 'poll-label';
    label.textContent = opt;

    const count = document.createElement('span');
    count.className = 'poll-count';
    count.textContent = `${pct}% (${voters.length})`;

    row.appendChild(bar);
    row.appendChild(label);
    row.appendChild(count);
    wrap.appendChild(row);
  });

  const tot = document.createElement('div');
  tot.className = 'poll-total';
  tot.textContent = `${total} vote${total > 1 ? 's' : ''}`;
  wrap.appendChild(tot);
  return wrap;
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
  const iAmAdmin = isAdminOf(group);

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

    const idcol = document.createElement('span');
    idcol.className = 'member__id';
    const av = document.createElement('span');
    av.className = 'member__avatar';
    if (m.photo) {
      const im = document.createElement('img');
      im.src = m.photo;
      im.alt = '';
      av.appendChild(im);
    } else {
      av.textContent = initials(m.name);
    }
    const name = document.createElement('span');
    name.textContent = m.name || 'Anonyme';
    idcol.appendChild(av);
    idcol.appendChild(name);
    li.appendChild(idcol);

    const right = document.createElement('span');
    right.className = 'member__right';
    if (m.uid === group.createdBy) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'admin';
      right.appendChild(tag);
    } else if (iAmAdmin) {
      const transfer = document.createElement('button');
      transfer.className = 'icon-btn';
      transfer.title = 'Transférer les droits admin';
      transfer.setAttribute('aria-label', 'Transférer les droits admin');
      transfer.innerHTML = '<i data-lucide="crown" aria-hidden="true"></i>';
      transfer.addEventListener('click', async () => {
        if (!confirm(`Donner les droits admin à ${m.name} ? Tu ne seras plus admin.`)) return;
        try {
          await Store.transferAdmin(currentGroupId, m.uid);
          await Store.addSystemMessage(currentGroupId, `${m.name} est désormais admin`, currentUser);
        } catch (err) {
          alert('Action impossible : ' + err.message);
        }
      });
      right.appendChild(transfer);

      const isBanned = banned.includes(m.uid);
      const btn = document.createElement('button');
      btn.className = isBanned ? 'btn-ghost' : 'btn-danger';
      btn.textContent = isBanned ? 'Débannir' : 'Bannir';
      btn.addEventListener('click', async () => {
        try {
          await Store.setBanned(currentGroupId, m.uid, !isBanned);
          await Store.addSystemMessage(
            currentGroupId,
            `${m.name} a été ${isBanned ? 'débanni' : 'banni'}`,
            currentUser
          );
        } catch (err) {
          alert('Action impossible : ' + err.message);
        }
      });
      right.appendChild(btn);
    }
    li.appendChild(right);
    memberList.appendChild(li);
  });
  refreshIcons();
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
  stopTyping();
  try {
    await Store.addMessage(currentGroupId, { text, user: currentUser });
  } catch (err) {
    alert('Envoi impossible : ' + err.message);
  }
});

function stopTyping() {
  clearTimeout(typingTimer);
  typingTimer = null;
  lastTypingWrite = 0;
  if (currentGroupId && currentUser) Store.clearTyping(currentGroupId, currentUser.uid).catch(() => {});
}

messageInput.addEventListener('input', () => {
  if (!currentGroupId || !currentUser) return;
  const now = Date.now();
  if (now - lastTypingWrite > 3000) {
    lastTypingWrite = now;
    Store.setTyping(currentGroupId, currentUser).catch(() => {});
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(stopTyping, 4000);
});

function updateNotifButton() {
  const icon = notifOn ? 'bell' : 'bell-off';
  notifBtn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
  notifBtn.setAttribute(
    'aria-label',
    notifOn ? 'Désactiver les notifications' : 'Activer les notifications'
  );
  refreshIcons();
}

notifBtn.addEventListener('click', async () => {
  if (!window.Notification) {
    alert('Notifications non supportées par ce navigateur.');
    return;
  }
  if (!notifOn) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      alert('Autorisation refusée.');
      return;
    }
    notifOn = true;
  } else {
    notifOn = false;
  }
  localStorage.setItem('notif', notifOn ? '1' : '0');
  updateNotifButton();
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  installBtn.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function resetAudioBar() {
  audioBar.hidden = true;
  audioPreview.hidden = true;
  audioPreview.src = '';
  audioSend.hidden = true;
  audioCancel.hidden = true;
  audioStop.hidden = true;
  audioStatus.textContent = '';
  pendingAudio = null;
}

async function startRecording() {
  if (!currentGroupId || !currentUser) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) {
    alert('Enregistrement non supporté par ce navigateur.');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Accès au micro refusé.');
    return;
  }
  audioChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : '';
  mediaRecorder = mime
    ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 })
    : new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    await finalizeRecording();
  };
  mediaRecorder.start();
  recSeconds = 0;
  audioBar.hidden = false;
  audioPreview.hidden = true;
  audioSend.hidden = true;
  audioCancel.hidden = true;
  audioStop.hidden = false;
  micBtn.classList.add('recording');
  audioStatus.textContent = 'Enregistrement… 0s';
  recTimer = setInterval(() => {
    recSeconds++;
    audioStatus.textContent = `Enregistrement… ${recSeconds}s`;
    if (recSeconds >= REC_MAX_SECONDS) stopRecording();
  }, 1000);
}

function stopRecording() {
  clearInterval(recTimer);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
}

async function finalizeRecording() {
  clearInterval(recTimer);
  micBtn.classList.remove('recording');
  audioStop.hidden = true;
  const blob = new Blob(audioChunks, { type: (audioChunks[0] && audioChunks[0].type) || 'audio/webm' });
  const dataUrl = await blobToDataURL(blob);
  if (dataUrl.length > AUDIO_MAX_LEN) {
    alert('Enregistrement trop lourd. Essaie un vocal plus court.');
    resetAudioBar();
    return;
  }
  pendingAudio = dataUrl;
  audioPreview.src = dataUrl;
  audioPreview.hidden = false;
  audioStatus.textContent = `Vocal ${recSeconds}s`;
  audioSend.hidden = false;
  audioCancel.hidden = false;
}

micBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording();
  else startRecording();
});
audioStop.addEventListener('click', stopRecording);
audioCancel.addEventListener('click', resetAudioBar);
audioSend.addEventListener('click', async () => {
  if (!pendingAudio || !currentGroupId || !currentUser) return;
  const audio = pendingAudio;
  const text = messageInput.value.trim();
  resetAudioBar();
  try {
    await Store.addMessage(currentGroupId, { text, audio, user: currentUser });
    messageInput.value = '';
  } catch (err) {
    alert("Envoi impossible : " + err.message);
  }
});

audioInput.addEventListener('change', async () => {
  const file = audioInput.files && audioInput.files[0];
  audioInput.value = '';
  if (!file || !currentGroupId || !currentUser) return;
  if (!file.type.startsWith('audio/')) return;
  try {
    const dataUrl = await blobToDataURL(file);
    if (dataUrl.length > AUDIO_MAX_LEN) {
      alert('Fichier audio trop lourd (max ~650 Ko). Choisis un fichier plus court.');
      return;
    }
    await Store.addMessage(currentGroupId, {
      text: messageInput.value.trim(),
      audio: dataUrl,
      user: currentUser,
    });
    messageInput.value = '';
  } catch (err) {
    alert("Envoi impossible : " + err.message);
  }
});

function insertText(t) {
  const el = messageInput;
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + t + el.value.slice(e);
  el.focus();
  const pos = s + t.length;
  el.setSelectionRange(pos, pos);
}

const emojiFile = document.createElement('input');
emojiFile.type = 'file';
emojiFile.accept = 'image/*';
emojiFile.hidden = true;
document.body.appendChild(emojiFile);

emojiFile.addEventListener('change', async () => {
  const f = emojiFile.files && emojiFile.files[0];
  emojiFile.value = '';
  if (!f || !currentGroupId || !currentUser) return;
  let name = prompt('Nom de l’emoji (lettres/chiffres) :');
  if (!name) return;
  name = name.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  if (!name) return;
  try {
    const image = await compressImage(f, 64, 20000);
    await Store.addEmoji(currentGroupId, { name, image, user: currentUser });
  } catch (err) {
    alert('Import impossible : ' + err.message);
  }
});

function renderEmojiPop() {
  emojiPop.innerHTML = '';
  const def = document.createElement('div');
  def.className = 'emoji-grid';
  EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => insertText(e));
    def.appendChild(b);
  });
  emojiPop.appendChild(def);

  if (currentEmojis.length) {
    const cg = document.createElement('div');
    cg.className = 'emoji-grid';
    currentEmojis.forEach((em) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.title = ':' + em.name + ':';
      const im = document.createElement('img');
      im.src = em.image;
      im.alt = em.name;
      b.appendChild(im);
      b.addEventListener('click', () => insertText(`:${em.name}:`));
      cg.appendChild(b);
    });
    emojiPop.appendChild(cg);
  }

  const imp = document.createElement('button');
  imp.type = 'button';
  imp.className = 'emoji-import';
  imp.textContent = '+ Importer un emoji';
  imp.addEventListener('click', () => emojiFile.click());
  emojiPop.appendChild(imp);
}

emojiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  emojiPop.hidden = !emojiPop.hidden;
  if (!emojiPop.hidden) renderEmojiPop();
});
document.addEventListener('click', (e) => {
  if (!emojiPop.hidden && !e.target.closest('.emoji-wrap')) emojiPop.hidden = true;
});

timeBtn.addEventListener('click', () => {
  insertText(`<t:${Math.floor(Date.now() / 1000)}:R>`);
});

function addPollOptionInput() {
  const inputs = pollOptionsEl.querySelectorAll('input');
  if (inputs.length >= 6) return;
  const i = inputs.length + 1;
  const inp = document.createElement('input');
  inp.className = 'poll-input';
  inp.type = 'text';
  inp.id = 'poll-opt-' + i;
  inp.name = 'poll-opt-' + i;
  inp.placeholder = 'Option ' + i;
  inp.maxLength = 60;
  inp.autocomplete = 'off';
  pollOptionsEl.appendChild(inp);
}

function openPoll() {
  pollQuestion.value = '';
  pollOptionsEl.innerHTML = '';
  addPollOptionInput();
  addPollOptionInput();
  pollOverlay.hidden = false;
}
pollBtn.addEventListener('click', openPoll);
pollAddOption.addEventListener('click', addPollOptionInput);
pollClose.addEventListener('click', () => { pollOverlay.hidden = true; });
pollCancel.addEventListener('click', () => { pollOverlay.hidden = true; });
pollOverlay.addEventListener('click', (e) => {
  if (e.target === pollOverlay) pollOverlay.hidden = true;
});

pollForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const question = pollQuestion.value.trim();
  const options = [...pollOptionsEl.querySelectorAll('input')]
    .map((i) => i.value.trim())
    .filter((v) => v);
  if (!question || options.length < 2 || !currentGroupId || !currentUser) {
    alert('Ajoute une question et au moins 2 options.');
    return;
  }
  pollOverlay.hidden = true;
  try {
    await Store.addPoll(currentGroupId, { question, options, user: currentUser });
  } catch (err) {
    alert('Sondage impossible : ' + err.message);
  }
});

refreshIcons();
updateNotifButton();

setInterval(() => {
  document.querySelectorAll('.msg-time[data-ms]').forEach((el) => {
    el.textContent = relativeTime(new Date(Number(el.dataset.ms)));
  });
}, 60000);
