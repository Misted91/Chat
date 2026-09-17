import { Store } from './store.js';
import {
  loginWithGoogle,
  logout,
  watchAuth,
  handleRedirectResult,
} from './firebase.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
const PICKER_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🤔', '😴',
  '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🔥', '🎉', '❤️',
  '💔', '✨', '⭐', '✅', '❌', '⚡', '🚀', '🍕', '☕', '🎮',
];

let currentUser = null;
let currentGroupId = null;
let memberGroups = [];
let publicGroups = [];
let extraGroups = new Map();
let groups = [];
let unsubPublic = null;
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
const plusBtn = document.getElementById('plus-btn');
const plusMenu = document.getElementById('plus-menu');
const urlBtn = document.getElementById('url-btn');
const toastWrap = document.getElementById('toast-wrap');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmText = document.getElementById('confirm-text');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');
const previewOverlay = document.getElementById('preview-overlay');
const previewImg = document.getElementById('preview-img');
const previewSize = document.getElementById('preview-size');
const previewSend = document.getElementById('preview-send');
const previewCancel = document.getElementById('preview-cancel');
const previewClose = document.getElementById('preview-close');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');

let pendingImages = [];

const adminOverlay = document.getElementById('admin-overlay');
const adminClose = document.getElementById('admin-close');
const memberList = document.getElementById('member-list');
const inviteCodeEl = document.getElementById('invite-code');
const copyInviteBtn = document.getElementById('copy-invite');
const renameBlock = document.getElementById('rename-block');
const renameInput = document.getElementById('rename-input');
const renameSave = document.getElementById('rename-save');
const visibilityBlock = document.getElementById('visibility-block');
const visPublicBtn = document.getElementById('vis-public');
const visPrivateBtn = document.getElementById('vis-private');
const visibilityHint = document.getElementById('visibility-hint');
const previewThumbs = document.getElementById('preview-thumbs');
const typingEl = document.getElementById('typing');
const notifBtn = document.getElementById('notif-btn');
const notifMenu = document.getElementById('notif-menu');
const installBtn = document.getElementById('install-btn');
const scrollDown = document.getElementById('scroll-down');
const replyBar = document.getElementById('reply-bar');
const replyBarName = document.getElementById('reply-bar-name');
const replyBarText = document.getElementById('reply-bar-text');
const replyCancel = document.getElementById('reply-cancel');
const mentionPop = document.getElementById('mention-pop');
const groupNotifCheck = document.getElementById('group-notif');

let replyingTo = null;
let notifGlobal = localStorage.getItem('notifGlobal') || 'all';
let restoreScrollFor = null;
let restored = false;

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

let unsubTyping = null;
let typingTimer = null;
let lastTypingWrite = 0;
let knownMessageIds = new Set();
let deferredInstall = null;

function currentGroup() {
  return (
    groups.find((g) => g.id === currentGroupId) ||
    extraGroups.get(currentGroupId) ||
    null
  );
}
function isAdminOf(group) {
  if (!group || !currentUser) return false;
  return group.createdBy === currentUser.uid || (group.adminUids || []).includes(currentUser.uid);
}
function isOwnerOf(group) {
  return group && currentUser && group.createdBy === currentUser.uid;
}
function isBannedFrom(group) {
  return group && currentUser && (group.bannedUids || []).includes(currentUser.uid);
}
function mergeGroups() {
  const map = new Map();
  [...extraGroups.values(), ...publicGroups, ...memberGroups].forEach((g) => map.set(g.id, g));
  groups = [...map.values()]
    .filter((g) => !isBannedFrom(g))
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
}

function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' toast--' + kind : '');
  t.textContent = msg;
  toastWrap.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

let confirmResolver = null;
function confirmModal(message) {
  confirmText.textContent = message;
  confirmOverlay.hidden = false;
  return new Promise((resolve) => { confirmResolver = resolve; });
}
confirmYes.addEventListener('click', () => { confirmOverlay.hidden = true; if (confirmResolver) confirmResolver(true); });
confirmNo.addEventListener('click', () => { confirmOverlay.hidden = true; if (confirmResolver) confirmResolver(false); });
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) { confirmOverlay.hidden = true; if (confirmResolver) confirmResolver(false); }
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function formatDiscordTs(sec, fmt) {
  const d = new Date(sec * 1000);
  if (fmt === 'R') {
    return `<span class="md-ts msg-time" data-ms="${d.getTime()}" title="${d.toLocaleString('fr-FR')}">${relativeTime(d)}</span>`;
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

function renderMarkdown(raw) {
  const codeBlocks = [];
  const inlineCodes = [];
  let s = raw;
  s = s.replace(/```(?:[a-zA-Z0-9]+)?\n?([\s\S]*?)```/g, (m, c) => {
    codeBlocks.push(c.replace(/\n$/, ''));
    return ` CB${codeBlocks.length - 1} `;
  });
  s = s.replace(/`([^`\n]+?)`/g, (m, c) => {
    inlineCodes.push(c);
    return ` IC${inlineCodes.length - 1} `;
  });
  s = escapeHtml(s);
  s = s.replace(/^(#{1,6})\s+(.*)$/gm, (m, h, t) => `<span class="md-h md-h${h.length}">${t}</span>`);
  s = s.replace(/^-#\s+(.*)$/gm, '<span class="md-sub">$1</span>');
  s = s.replace(/^&gt;&gt;&gt;\s?([\s\S]*)$/m, '<span class="md-quote">$1</span>');
  s = s.replace(/^&gt; ?(.*)$/gm, '<span class="md-quote">$1</span>');
  s = s.replace(/^(?:\*|-)\s+(.*)$/gm, '<span class="md-li">• $1</span>');
  s = s.replace(/^(\d+)\.\s+(.*)$/gm, '<span class="md-li">$1. $2</span>');
  s = s.replace(/\|\|([^\n]+?)\|\|/g, '<span class="md-spoiler">$1</span>');
  s = s.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  s = s.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
  s = s.replace(/_([^_\n]+?)_/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/(^|[^"'=>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
  s = s.replace(/&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g, (m, sec, fmt) => formatDiscordTs(Number(sec), fmt || 'f'));
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/ IC(\d+) /g, (m, i) => `<code class="md-inline">${escapeHtml(inlineCodes[+i])}</code>`);
  s = s.replace(/ CB(\d+) /g, (m, i) => `<pre class="md-code">${escapeHtml(codeBlocks[+i])}</pre>`);
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
  toast('Connexion impossible : ' + authErrorMessage(err));
});

loginBtn.addEventListener('click', async () => {
  try {
    await loginWithGoogle();
  } catch (err) {
    toast('Connexion impossible : ' + authErrorMessage(err));
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
    restored = false;
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

  unsubPublic = Store.watchPublicGroups(
    (list) => {
      pruneExtra(list);
      publicGroups = list;
      onGroupsChanged();
    },
    () => {}
  );
}
function stopGroupsListeners() {
  if (unsubMember) { unsubMember(); unsubMember = null; }
  if (unsubPublic) { unsubPublic(); unsubPublic = null; }
  memberGroups = [];
  publicGroups = [];
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
      toast('Tu as été banni de ce groupe.');
      resetChat();
      return;
    }
    chatTitle.textContent = group.name;
    adminBtn.hidden = false;
    deleteBtn.hidden = !isOwnerOf(group);
    if (!adminOverlay.hidden) renderAdminPanel();
  }

  if (!currentGroupId) tryRestoreActive();
}

function tryRestoreActive() {
  if (restored) return;
  const id = localStorage.getItem('activeGroup');
  if (id && groups.some((g) => g.id === id)) {
    restored = true;
    selectGroup(id);
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

    const vis = document.createElement('i');
    vis.className = 'group-vis';
    vis.setAttribute('data-lucide', group.visibility === 'public' ? 'globe' : 'lock');
    vis.setAttribute('aria-hidden', 'true');
    li.appendChild(vis);

    const name = document.createElement('span');
    name.className = 'group-name';
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
  refreshIcons();
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

  restored = true;
  restoreScrollFor = id;
  localStorage.setItem('activeGroup', id);
  groupNotifCheck.checked = localStorage.getItem('gnotif:' + id) !== '0';

  chatTitle.textContent = group.name;
  deleteBtn.hidden = !isOwnerOf(group);
  adminBtn.hidden = false;
  composer.hidden = false;
  clearReply();
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
}

function shouldNotify(m) {
  if (notifGlobal === 'none') return false;
  if (localStorage.getItem('gnotif:' + currentGroupId) === '0') return false;
  if (notifGlobal === 'mentions') return (m.mentions || []).includes(currentUser.uid);
  return true;
}

function maybeNotify(messages) {
  const first = knownMessageIds.size === 0;
  messages.forEach((m) => {
    const isNew = !knownMessageIds.has(m.id);
    knownMessageIds.add(m.id);
    if (first || !isNew) return;
    if (m.system || !currentUser || m.author === currentUser.uid) return;
    if (!shouldNotify(m)) return;
    if (document.hidden && window.Notification && Notification.permission === 'granted') {
      const body = m.text || (m.image ? 'Image' : m.audio ? 'Audio' : '');
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
  emojiPop.hidden = true;
  clearReply();
  scrollDown.hidden = true;
  mentionPop.hidden = true;
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
  if (msg.edited) {
    const ed = document.createElement('span');
    ed.className = 'msg-edited';
    ed.textContent = ' (modifié)';
    meta.appendChild(ed);
  }
  if (msg.pinned) {
    const pinIcon = document.createElement('i');
    pinIcon.setAttribute('data-lucide', 'pin');
    pinIcon.setAttribute('aria-hidden', 'true');
    pinIcon.className = 'meta-pin';
    meta.appendChild(pinIcon);
  }
  bubble.appendChild(meta);

  if (msg.replyTo) {
    const quote = document.createElement('button');
    quote.type = 'button';
    quote.className = 'reply-quote';
    const qn = document.createElement('span');
    qn.className = 'reply-quote__name';
    qn.textContent = msg.replyToName || '';
    const qt = document.createElement('span');
    qt.className = 'reply-quote__text';
    qt.textContent = msg.replyToText || '';
    quote.appendChild(qn);
    quote.appendChild(qt);
    quote.addEventListener('click', () => scrollToMessage(msg.replyTo));
    bubble.appendChild(quote);
  }

  if (msg.image) {
    const img = document.createElement('img');
    img.className = 'bubble-img';
    img.src = msg.image;
    img.alt = 'image';
    img.loading = 'lazy';
    if (msg.imgW && msg.imgH) {
      img.width = msg.imgW;
      img.height = msg.imgH;
      img.style.aspectRatio = `${msg.imgW} / ${msg.imgH}`;
    }
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
    text.innerHTML = highlightMentions(renderMarkdown(msg.text));
    bubble.appendChild(text);
  }

  const translation = document.createElement('div');
  translation.className = 'translation';
  translation.hidden = true;
  bubble.appendChild(translation);

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
  bubble.appendChild(reactRow);

  const picker = document.createElement('div');
  picker.className = 'emoji-picker';
  picker.hidden = true;
  EMOJIS.forEach((emoji) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = emoji;
    b.addEventListener('click', () => {
      picker.hidden = true;
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(() => {});
    });
    picker.appendChild(b);
  });
  bubble.appendChild(picker);

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'msg-menu-btn';
  menuBtn.setAttribute('aria-label', 'Options du message');
  menuBtn.innerHTML = '<i data-lucide="more-vertical" aria-hidden="true"></i>';

  const menu = document.createElement('div');
  menu.className = 'msg-menu';
  menu.hidden = true;
  const addItem = (icon, label, handler) => {
    const it = document.createElement('button');
    it.type = 'button';
    it.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    it.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = true; handler(e); });
    menu.appendChild(it);
  };
  addItem('smile-plus', 'Réagir', () => { picker.hidden = false; });
  addItem('reply', 'Répondre', () => setReply(msg));
  if (msg.text) {
    addItem('copy', 'Copier', async () => {
      try { await navigator.clipboard.writeText(msg.text); toast('Texte copié.'); }
      catch { toast('Copie impossible.'); }
    });
    addItem('languages', 'Traduire', () => {
      if (!translation.hidden) { translation.hidden = true; translation.textContent = ''; return; }
      translation.hidden = false;
      translateMessage(msg.text, translation);
    });
  }
  if (isMe && msg.text) {
    addItem('pencil', 'Modifier', () => startEdit(msg, bubble));
  }
  if (isAdminOf(group)) {
    addItem('pin', msg.pinned ? 'Désépingler' : 'Épingler', () => {
      if (!msg.pinned && currentMessages.filter((m) => m.pinned).length >= 5) {
        toast('Maximum 5 messages épinglés par groupe.');
        return;
      }
      Store.setPinned(currentGroupId, msg.id, !msg.pinned).catch(() => {});
    });
  }
  if (isMe || isAdminOf(group)) {
    addItem('trash-2', 'Supprimer', async (e) => {
      if (!e.shiftKey) {
        const ok = await confirmModal('Supprimer ce message ?');
        if (!ok) return;
      }
      Store.deleteMessage(currentGroupId, msg.id).catch((err) =>
        toast('Suppression impossible : ' + err.message)
      );
    });
  }
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closeAllMenus();
    if (willOpen) {
      const r = menuBtn.getBoundingClientRect();
      menu.classList.toggle('up', r.bottom > window.innerHeight - 240);
    }
    menu.hidden = !willOpen;
  });

  bubble.appendChild(menuBtn);
  bubble.appendChild(menu);
  row.appendChild(bubble);
  return row;
}

function closeAllMenus() {
  document.querySelectorAll('.msg-menu').forEach((m) => (m.hidden = true));
  document.querySelectorAll('.emoji-picker').forEach((p) => (p.hidden = true));
}
document.addEventListener('click', closeAllMenus);
messagesEl.addEventListener('click', (e) => {
  const sp = e.target.closest('.md-spoiler');
  if (sp) sp.classList.add('revealed');
});

function highlightMentions(html) {
  currentMembers.forEach((m) => {
    const n = escapeHtml(m.name || '');
    if (!n) return;
    html = html.split('@' + n).join('<span class="mention">@' + n + '</span>');
  });
  return html;
}

function startEdit(msg, bubble) {
  const textEl = bubble.querySelector('.text');
  if (!textEl) return;
  const ta = document.createElement('textarea');
  ta.className = 'edit-area';
  ta.value = msg.text;
  const bar = document.createElement('div');
  bar.className = 'edit-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn-ghost';
  cancel.textContent = 'Annuler';
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'preview-send';
  save.textContent = 'Enregistrer';
  bar.appendChild(cancel);
  bar.appendChild(save);
  textEl.replaceWith(ta);
  ta.after(bar);
  ta.focus();
  cancel.addEventListener('click', () => renderMessages());
  save.addEventListener('click', async () => {
    const v = ta.value.trim();
    if (!v) { toast('Le message ne peut pas être vide.'); return; }
    try {
      await Store.editMessage(currentGroupId, msg.id, v);
    } catch (err) {
      toast('Modification impossible : ' + err.message);
    }
  });
}

async function translateMessage(text, targetEl) {
  targetEl.textContent = 'Traduction…';
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=' +
      encodeURIComponent(text);
    const r = await fetch(url);
    const j = await r.json();
    const out = (j[0] || []).map((p) => p[0]).join('');
    targetEl.textContent = out || '(vide)';
  } catch {
    targetEl.textContent = 'Traduction indisponible.';
  }
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
  const atBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  const prevTop = messagesEl.scrollTop;
  const prevHeight = messagesEl.scrollHeight;
  messagesEl.innerHTML = '';
  currentMessages.forEach((msg) => messagesEl.appendChild(buildBubble(msg)));
  refreshIcons();
  if (restoreScrollFor === currentGroupId) {
    const saved = Number(localStorage.getItem('scroll:' + currentGroupId));
    messagesEl.scrollTop = saved || messagesEl.scrollHeight;
    restoreScrollFor = null;
  } else if (atBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    messagesEl.scrollTop = prevTop + (messagesEl.scrollHeight - prevHeight);
  }
  updateScrollDown();
}

function updateScrollDown() {
  const far =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight > 200;
  scrollDown.hidden = !far || !currentGroupId;
}

messagesEl.addEventListener('scroll', () => {
  if (currentGroupId) localStorage.setItem('scroll:' + currentGroupId, String(messagesEl.scrollTop));
  updateScrollDown();
});
scrollDown.addEventListener('click', () => {
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

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
    toast('Code : ' + code);
  }
});

function renderAdminPanel() {
  const group = currentGroup();
  if (!group) return;
  inviteCodeEl.textContent = group.joinCode || '------';
  const iAmAdmin = isAdminOf(group);
  renameBlock.hidden = !iAmAdmin;
  if (iAmAdmin) renameInput.value = group.name || '';

  visibilityBlock.hidden = !iAmAdmin;
  const vis = group.visibility === 'public' ? 'public' : 'private';
  visPublicBtn.classList.toggle('active', vis === 'public');
  visPrivateBtn.classList.toggle('active', vis === 'private');
  visibilityHint.textContent =
    vis === 'public'
      ? 'Visible et rejoignable par tout le monde.'
      : 'Accessible uniquement avec le code d’invitation.';

  renderMembers(group);
}

function changeVisibility(v) {
  if (!currentGroupId) return;
  Store.setVisibility(currentGroupId, v).catch((err) => toast('Modification impossible : ' + err.message));
}
visPublicBtn.addEventListener('click', () => changeVisibility('public'));
visPrivateBtn.addEventListener('click', () => changeVisibility('private'));

renameSave.addEventListener('click', async () => {
  const name = renameInput.value.trim();
  if (!name || !currentGroupId) return;
  try {
    await Store.renameGroup(currentGroupId, name);
    toast('Groupe renommé.');
  } catch (err) {
    toast('Renommage impossible : ' + err.message);
  }
});

function renderMembers(group) {
  memberList.innerHTML = '';
  const banned = group.bannedUids || [];
  const admins = group.adminUids || [];
  const iAmAdmin = isAdminOf(group);
  const iAmOwner = isOwnerOf(group);

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

    const owner = m.uid === group.createdBy;
    const memberAdmin = admins.includes(m.uid);
    if (owner || memberAdmin) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = owner ? 'propriétaire' : 'admin';
      right.appendChild(tag);
    }

    const isSelf = currentUser && m.uid === currentUser.uid;

    if (iAmAdmin && !owner && !isSelf) {
      const promo = document.createElement('button');
      promo.className = 'icon-btn';
      promo.title = memberAdmin ? 'Retirer les droits admin' : 'Nommer admin';
      promo.setAttribute('aria-label', promo.title);
      promo.innerHTML = `<i data-lucide="${memberAdmin ? 'shield-off' : 'shield'}" aria-hidden="true"></i>`;
      promo.addEventListener('click', async () => {
        try {
          await Store.setAdmin(currentGroupId, m.uid, !memberAdmin);
          await Store.addSystemMessage(
            currentGroupId,
            `${m.name} ${memberAdmin ? "n'est plus" : 'est désormais'} admin`,
            currentUser
          );
        } catch (err) {
          toast('Action impossible : ' + err.message);
        }
      });
      right.appendChild(promo);
    }

    if (iAmOwner && !owner) {
      const transfer = document.createElement('button');
      transfer.className = 'icon-btn';
      transfer.title = 'Transférer la propriété';
      transfer.setAttribute('aria-label', 'Transférer la propriété');
      transfer.innerHTML = '<i data-lucide="crown" aria-hidden="true"></i>';
      transfer.addEventListener('click', async () => {
        const ok = await confirmModal(`Donner la propriété à ${m.name} ? Tu ne seras plus propriétaire.`);
        if (!ok) return;
        try {
          await Store.transferAdmin(currentGroupId, m.uid);
          await Store.addSystemMessage(currentGroupId, `${m.name} est désormais propriétaire`, currentUser);
        } catch (err) {
          toast('Action impossible : ' + err.message);
        }
      });
      right.appendChild(transfer);
    }

    if (iAmAdmin && !owner && !isSelf) {
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
          toast('Action impossible : ' + err.message);
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
    toast('Impossible de créer le groupe : ' + err.message);
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
      toast('Code invalide.');
      return;
    }
    selectGroup(groupId);
  } catch (err) {
    toast('Impossible de rejoindre : ' + err.message);
  }
});

deleteBtn.addEventListener('click', async () => {
  const group = currentGroup();
  if (!group) return;
  const ok = await confirmModal(`Supprimer le groupe « ${group.name} » ?`);
  if (!ok) return;
  try {
    await Store.deleteGroup(currentGroupId, group.joinCode);
    resetChat();
  } catch (err) {
    toast('Suppression impossible : ' + err.message);
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
        w = c2.width;
        h = c2.height;
      }
      resolve({ url: out, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
    img.src = url;
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

function imageDims(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => resolve({ w: 0, h: 0 });
    im.src = src;
  });
}

imageInput.addEventListener('change', async () => {
  const files = [...(imageInput.files || [])];
  imageInput.value = '';
  if (!files.length || !currentGroupId || !currentUser) return;

  plusBtn.classList.add('busy');
  pendingImages = [];
  try {
    for (const f of files) {
      if (/\.hei[cf]$/i.test(f.name) || f.type === 'image/heic' || f.type === 'image/heif') {
        toast('Le format HEIC n’est pas lisible par le navigateur.');
        continue;
      }
      if (f.type === 'image/gif') {
        const durl = await blobToDataURL(f);
        if (durl.length > 900000) { toast('GIF trop lourd (max ~650 Ko).'); continue; }
        const dim = await imageDims(durl);
        pendingImages.push({ url: durl, w: dim.w, h: dim.h });
        continue;
      }
      if (!f.type.startsWith('image/')) continue;
      const image = await compressImage(f);
      if (image.url.length > 900000) { toast('Image trop lourde, ignorée.'); continue; }
      pendingImages.push(image);
    }
    if (!pendingImages.length) return;
    openImagePreview();
  } catch (err) {
    toast("Impossible de préparer l'image : " + err.message);
  } finally {
    plusBtn.classList.remove('busy');
  }
});

function openImagePreview() {
  renderPreviewThumbs();
  previewOverlay.hidden = false;
}

function renderPreviewThumbs() {
  previewThumbs.innerHTML = '';
  pendingImages.forEach((item, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'preview-thumb';
    const im = document.createElement('img');
    im.src = item.url;
    im.alt = '';
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'preview-thumb__rm';
    rm.setAttribute('aria-label', 'Retirer cette image');
    rm.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
    rm.addEventListener('click', () => {
      pendingImages.splice(i, 1);
      if (!pendingImages.length) { closePreview(); return; }
      renderPreviewThumbs();
    });
    wrap.appendChild(im);
    wrap.appendChild(rm);
    previewThumbs.appendChild(wrap);
  });
  const totalKb = Math.round(pendingImages.reduce((a, s) => a + s.url.length * 0.75, 0) / 1024);
  previewSize.textContent = `${pendingImages.length} image(s) · ~${totalKb} Ko`;
  refreshIcons();
}

function closePreview() {
  previewOverlay.hidden = true;
  pendingImages = [];
  previewThumbs.innerHTML = '';
}
previewCancel.addEventListener('click', closePreview);
previewClose.addEventListener('click', closePreview);
previewOverlay.addEventListener('click', (e) => {
  if (e.target === previewOverlay) closePreview();
});

previewSend.addEventListener('click', async () => {
  if (!pendingImages.length || !currentGroupId || !currentUser) return;
  const imgs = pendingImages.slice();
  const text = messageInput.value.trim();
  const reply = replyingTo;
  const mentions = computeMentions(text);
  closePreview();
  try {
    for (let i = 0; i < imgs.length; i++) {
      await Store.addMessage(currentGroupId, {
        text: i === 0 ? text : '',
        image: imgs[i].url,
        imgW: imgs[i].w || 0,
        imgH: imgs[i].h || 0,
        user: currentUser,
        reply: i === 0 ? reply : null,
        mentions: i === 0 ? mentions : [],
      });
    }
    messageInput.value = '';
    clearReply();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    toast("Impossible d'envoyer l'image : " + err.message);
  }
});

function sendMediaUrl(url) {
  if (!currentGroupId || !currentUser) return;
  const clean = url.trim();
  if (!/^https:\/\//i.test(clean)) { toast('URL invalide (https requis).'); return; }
  Store.addMessage(currentGroupId, {
    text: messageInput.value.trim(),
    image: clean,
    user: currentUser,
    reply: replyingTo,
    mentions: computeMentions(messageInput.value.trim()),
  })
    .then(() => { messageInput.value = ''; clearReply(); messagesEl.scrollTop = messagesEl.scrollHeight; })
    .catch((err) => toast('Envoi impossible : ' + err.message));
}

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
  const reply = replyingTo;
  const mentions = computeMentions(text);
  messageInput.value = '';
  autoGrow();
  mentionPop.hidden = true;
  stopTyping();
  clearReply();
  try {
    await Store.addMessage(currentGroupId, { text, user: currentUser, reply, mentions });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    toast('Envoi impossible : ' + err.message);
  }
});

plusBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  plusMenu.hidden = !plusMenu.hidden;
});
plusMenu.addEventListener('click', () => { plusMenu.hidden = true; });
document.addEventListener('click', (e) => {
  if (!plusMenu.hidden && !e.target.closest('.plus-wrap')) plusMenu.hidden = true;
});

urlBtn.addEventListener('click', () => {
  const url = window.prompt('Colle l’URL de l’image ou du GIF (https) :');
  if (url) sendMediaUrl(url);
});

function autoGrow() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 140) + 'px';
}
messageInput.addEventListener('input', autoGrow);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

function setReply(msg) {
  replyingTo = {
    id: msg.id,
    name: msg.authorName || 'Anonyme',
    text: (msg.text || (msg.image ? 'Image' : '')).slice(0, 140),
  };
  replyBarName.textContent = replyingTo.name;
  replyBarText.textContent = replyingTo.text;
  replyBar.hidden = false;
  refreshIcons();
  messageInput.focus();
}
function clearReply() {
  replyingTo = null;
  replyBar.hidden = true;
}
replyCancel.addEventListener('click', clearReply);

function computeMentions(text) {
  const ids = [];
  const lower = text.toLowerCase();
  currentMembers.forEach((m) => {
    const n = (m.name || '').toLowerCase();
    if (!n) return;
    const first = n.split(' ')[0];
    if (lower.includes('@' + n) || lower.includes('@' + first)) ids.push(m.uid);
  });
  return [...new Set(ids)];
}

messageInput.addEventListener('input', () => {
  const val = messageInput.value;
  const pos = messageInput.selectionStart;
  const before = val.slice(0, pos);
  const mt = before.match(/@([^\s@]*)$/);
  if (!mt) { mentionPop.hidden = true; return; }
  const q = mt[1].toLowerCase();
  const matches = currentMembers
    .filter((mem) => (mem.name || '').toLowerCase().includes(q))
    .slice(0, 6);
  if (!matches.length) { mentionPop.hidden = true; return; }
  mentionPop.innerHTML = '';
  matches.forEach((mem) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '@' + mem.name;
    b.addEventListener('click', () => {
      const start = pos - mt[0].length;
      messageInput.value = val.slice(0, start) + '@' + mem.name + ' ' + val.slice(pos);
      messageInput.focus();
      mentionPop.hidden = true;
      const np = start + mem.name.length + 2;
      messageInput.setSelectionRange(np, np);
    });
    mentionPop.appendChild(b);
  });
  mentionPop.hidden = false;
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
  const icon = notifGlobal === 'none' ? 'bell-off' : 'bell';
  notifBtn.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i>`;
  notifMenu.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === notifGlobal);
  });
  refreshIcons();
}

notifBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  notifMenu.hidden = !notifMenu.hidden;
});
document.addEventListener('click', (e) => {
  if (!notifMenu.hidden && !e.target.closest('.notif-wrap')) notifMenu.hidden = true;
});
notifMenu.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', async () => {
    const v = b.dataset.v;
    if (v !== 'none' && window.Notification && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Autorisation refusée par le navigateur.'); return; }
    }
    notifGlobal = v;
    localStorage.setItem('notifGlobal', v);
    notifMenu.hidden = true;
    updateNotifButton();
  });
});

groupNotifCheck.addEventListener('change', () => {
  if (!currentGroupId) return;
  localStorage.setItem('gnotif:' + currentGroupId, groupNotifCheck.checked ? '1' : '0');
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

function insertText(t) {
  const el = messageInput;
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, s) + t + el.value.slice(e);
  el.focus();
  const pos = s + t.length;
  el.setSelectionRange(pos, pos);
}

function renderEmojiPop() {
  emojiPop.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'emoji-grid';
  PICKER_EMOJIS.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.addEventListener('click', () => insertText(e));
    grid.appendChild(b);
  });
  emojiPop.appendChild(grid);
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
  if (inputs.length >= 10) return;
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
  pollAddOption.hidden = pollOptionsEl.querySelectorAll('input').length >= 10;
}

function openPoll() {
  pollQuestion.value = '';
  pollOptionsEl.innerHTML = '';
  pollAddOption.hidden = false;
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
    toast('Ajoute une question et au moins 2 options.');
    return;
  }
  pollOverlay.hidden = true;
  try {
    await Store.addPoll(currentGroupId, { question, options, user: currentUser });
  } catch (err) {
    toast('Sondage impossible : ' + err.message);
  }
});

refreshIcons();
updateNotifButton();

setInterval(() => {
  document.querySelectorAll('.msg-time[data-ms]').forEach((el) => {
    el.textContent = relativeTime(new Date(Number(el.dataset.ms)));
  });
}, 60000);
