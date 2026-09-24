import { Store } from './store.js';
import {
  loginWithGoogle,
  logout,
  watchAuth,
  handleRedirectResult,
} from './firebase.js';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

const PROFANITY = [
  'connard', 'connasse', 'salope', 'salaud', 'enculé', 'encule', 'enculer',
  'putain', 'pute', 'merde', 'batard', 'bâtard', 'nique', 'niquer', 'ntm',
  'fdp', 'pd', 'pédé', 'pede', 'tapette', 'bougnoule', 'négro', 'negro',
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'faggot', 'retard',
];

function normalizeForFilter(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0@]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't');
}

function findProfanity(text) {
  const norm = normalizeForFilter(text);
  return PROFANITY.find((word) => {
    const w = normalizeForFilter(word);
    const re = new RegExp('(^|[^a-z])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
    return re.test(norm);
  });
}

const FRENCH_HINTS = [
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'est', 'je',
  'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'pas', 'que', 'qui', 'pour',
  'avec', 'mais', 'ça', 'ce', 'cette', 'bonjour', 'salut', 'merci', 'oui',
  'non', 'sur', 'dans', 'plus', 'moi', 'toi', 'être', 'avoir', 'faire',
];
function looksFrench(text) {
  const words = text.toLowerCase().match(/[a-zà-ÿ]+/g);
  if (!words || words.length < 2) return false;
  let hits = 0;
  words.forEach((w) => { if (FRENCH_HINTS.includes(w)) hits++; });
  return hits >= 1 && hits / words.length > 0.12;
}

function formatInviteCode(code) {
  const c = (code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (c.length === 7) return `${c.slice(0, 2)}-${c.slice(2, 5)}-${c.slice(5)}`;
  return c || '------';
}

function inviteLink(code) {
  const c = (code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `${location.origin}${location.pathname}?join=${c}`;
}

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
const MSG_PAGE = 50;
let msgLimit = MSG_PAGE;
let msgHasMore = false;
let loadingMore = false;
let editing = null;
const expandedSys = new Set();

const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');

const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const groupList = document.getElementById('group-list');

const openCreateBtn = document.getElementById('open-create-group');
const openJoinBtn = document.getElementById('open-join-group');
const createOverlay = document.getElementById('create-overlay');
const createClose = document.getElementById('create-close');
const createCancel = document.getElementById('create-cancel');
const createForm = document.getElementById('create-form');
const createName = document.getElementById('create-name');
const createVisibility = document.getElementById('create-visibility');
const joinOverlay = document.getElementById('join-overlay');
const joinClose = document.getElementById('join-close');
const joinCancel = document.getElementById('join-cancel');
const joinForm = document.getElementById('join-form');
const joinInput = document.getElementById('join-input');

const chatTitle = document.getElementById('chat-title');
const chatTitleBtn = document.getElementById('chat-title-btn');
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
const inviteBlock = document.getElementById('invite-block');
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
const replyBarJump = document.getElementById('reply-bar-jump');
const replyMentionBtn = document.getElementById('reply-mention');
const replyCancel = document.getElementById('reply-cancel');
let replyMention = true;
const mentionPop = document.getElementById('mention-pop');
const cmdPop = document.getElementById('cmd-pop');
const SLASH_COMMANDS = [
  { label: '/r', insert: '/r ', icon: 'reply', desc: 'Répondre au dernier message qui te mentionne', perm: 'all' },
  { label: '/group rename', insert: '/group rename ', icon: 'pencil', desc: 'Renommer le groupe (admin)', perm: 'admin' },
  { label: '/group visibility', insert: '/group visibility ', icon: 'globe', desc: 'Public ou privé (admin)', perm: 'admin' },
  { label: '/group mod', insert: '/group mod @', icon: 'shield', desc: 'Nommer / retirer un admin (propriétaire)', perm: 'owner' },
  { label: '/group ban', insert: '/group ban @', icon: 'user-x', desc: 'Bannir un membre (admin)', perm: 'admin' },
  { label: '/group timeout', insert: '/group timeout @', icon: 'mic-off', desc: 'Rendre muet / réactiver (admin)', perm: 'admin' },
  { label: '/group clear', insert: '/group clear ', icon: 'trash-2', desc: 'Supprimer des messages (admin)', perm: 'admin' },
];
function allowedCommands() {
  const group = currentGroup();
  const admin = isAdminOf(group);
  const owner = isOwnerOf(group);
  return SLASH_COMMANDS.filter((c) =>
    c.perm === 'all' || (c.perm === 'admin' && admin) || (c.perm === 'owner' && owner)
  );
}
const groupNotifToggle = document.getElementById('group-notif-toggle');
const moderationBlock = document.getElementById('moderation-block');
const lockToggle = document.getElementById('lock-toggle');
const slowRange = document.getElementById('slow-range');
const slowValue = document.getElementById('slow-value');
const slowApply = document.getElementById('slow-apply');
const slowHint = document.getElementById('slow-hint');
const shareLinkBtn = document.getElementById('share-link');
const floatingMenu = document.getElementById('floating-menu');
const floatingPicker = document.getElementById('floating-picker');

const urlOverlay = document.getElementById('url-overlay');
const urlClose = document.getElementById('url-close');
const urlCancel = document.getElementById('url-cancel');
const urlForm = document.getElementById('url-form');
const urlInput = document.getElementById('url-input');

const timeOverlay = document.getElementById('time-overlay');
const timeClose = document.getElementById('time-close');
const timeCancel = document.getElementById('time-cancel');
const timeForm = document.getElementById('time-form');
const timeDate = document.getElementById('time-date');
const timeTime = document.getElementById('time-time');
const timeFormat = document.getElementById('time-format');
const timePreview = document.getElementById('time-preview');

let replyingTo = null;
let notifGlobal = localStorage.getItem('notifGlobal') || 'none';
let restoreScrollFor = null;
let restored = false;
let lastSentAt = 0;

const pollBtn = document.getElementById('poll-btn');
const pollOverlay = document.getElementById('poll-overlay');
const pollClose = document.getElementById('poll-close');
const pollCancel = document.getElementById('poll-cancel');
const pollForm = document.getElementById('poll-form');
const pollQuestion = document.getElementById('poll-question');
const pollOptionsEl = document.getElementById('poll-options');
const pollAddOption = document.getElementById('poll-add-option');
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
function isMutedIn(group) {
  return group && currentUser && (group.mutedUids || []).includes(currentUser.uid);
}
function canPostIn(group) {
  if (!group || !currentUser) return false;
  if (isMutedIn(group)) return false;
  if (group.locked && !isAdminOf(group)) return false;
  return true;
}
function updateComposerState() {
  const group = currentGroup();
  if (!group) return;
  const muted = isMutedIn(group);
  const locked = group.locked && !isAdminOf(group);
  const blocked = muted || locked;
  messageInput.disabled = blocked;
  plusBtn.disabled = blocked;
  const sendBtn = composer.querySelector('.send-btn');
  if (sendBtn) sendBtn.disabled = blocked;
  composer.classList.toggle('composer--blocked', blocked);
  slowHint.hidden = true;
  if (muted) {
    messageInput.placeholder = 'Tu es muet dans ce groupe.';
    slowHint.hidden = false;
    slowHint.innerHTML = '<i data-lucide="mic-off" aria-hidden="true"></i> Tu ne peux pas écrire : tu as été rendu muet.';
  } else if (locked) {
    messageInput.placeholder = 'Le chat est bloqué par un administrateur.';
    slowHint.hidden = false;
    slowHint.innerHTML = '<i data-lucide="lock" aria-hidden="true"></i> Le chat est bloqué. Seuls les administrateurs peuvent écrire.';
  } else if (group.slowMode > 0 && !isAdminOf(group)) {
    messageInput.placeholder = `Mode lent : 1 message toutes les ${group.slowMode} s.`;
    slowHint.hidden = false;
    slowHint.innerHTML = `<i data-lucide="timer" aria-hidden="true"></i> Mode lent actif : ${group.slowMode} s entre chaque message.`;
  } else {
    messageInput.placeholder = 'Écris un message…  (Entrée pour envoyer, Maj+Entrée pour une ligne)';
  }
  refreshIcons();
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

function infoModal(message) {
  confirmText.textContent = message;
  confirmNo.hidden = true;
  confirmYes.textContent = 'OK';
  confirmOverlay.hidden = false;
  return new Promise((resolve) => {
    confirmResolver = (v) => {
      confirmNo.hidden = false;
      confirmYes.textContent = 'Confirmer';
      resolve(v);
    };
  });
}

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
    codeBlocks.push(c.replace(/^\n+/, '').replace(/\n+$/, ''));
    return `CB${codeBlocks.length - 1}`;
  });
  s = s.replace(/`([^`\n]+?)`/g, (m, c) => {
    inlineCodes.push(c);
    return `IC${inlineCodes.length - 1}`;
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
  s = s.replace(/IC(\d+)/g, (m, i) => `<code class="md-inline">${escapeHtml(inlineCodes[+i])}</code>`);
  s = s.replace(/CB(\d+)/g, (m, i) => `<pre class="md-code">${escapeHtml(codeBlocks[+i])}</pre>`);
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
    handleJoinParam();
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

let joinParamHandled = false;
async function handleJoinParam() {
  if (joinParamHandled) return;
  const params = new URLSearchParams(location.search);
  const code = params.get('join');
  if (!code) return;
  joinParamHandled = true;
  restored = true;
  params.delete('join');
  const rest = params.toString();
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
  await doJoin(code);
}

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
  stopGroupWatchers();
  memberGroups = [];
  publicGroups = [];
  extraGroups.clear();
}

function onGroupsChanged() {
  mergeGroups();
  syncGroupWatchers();
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
    updateComposerState();
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

function loadPinnedGroups() {
  try { return JSON.parse(localStorage.getItem('pinnedGroups') || '[]'); }
  catch { return []; }
}
let pinnedGroups = loadPinnedGroups();
function isGroupPinned(id) { return pinnedGroups.includes(id); }
function toggleGroupPin(id) {
  pinnedGroups = isGroupPinned(id)
    ? pinnedGroups.filter((g) => g !== id)
    : [id, ...pinnedGroups];
  try { localStorage.setItem('pinnedGroups', JSON.stringify(pinnedGroups)); } catch {}
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

  const ordered = [...groups].sort(
    (a, b) => (isGroupPinned(b.id) ? 1 : 0) - (isGroupPinned(a.id) ? 1 : 0)
  );

  ordered.forEach((group) => {
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

    if (isGroupPinned(group.id)) {
      const pin = document.createElement('i');
      pin.className = 'group-pin';
      pin.setAttribute('data-lucide', 'pin');
      pin.setAttribute('aria-hidden', 'true');
      li.appendChild(pin);
    }

    if (isAdminOf(group)) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'admin';
      li.appendChild(tag);
    }

    if (groupUnread.has(group.id) && group.id !== currentGroupId) {
      li.classList.add('has-unread');
      const dot = document.createElement('span');
      dot.className = 'group-unread';
      dot.setAttribute('aria-label', 'Nouveaux messages');
      li.appendChild(dot);
    }

    li.addEventListener('click', () => selectGroup(group.id));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleGroupPin(group.id);
      renderGroups();
      toast(isGroupPinned(group.id) ? 'Groupe épinglé.' : 'Groupe désépinglé.');
    });
    groupList.appendChild(li);
  });
  refreshIcons();
}

async function selectGroup(id) {
  currentGroupId = id;
  groupUnread.delete(id);
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

  chatTitle.textContent = group.name;
  deleteBtn.hidden = !isOwnerOf(group);
  adminBtn.hidden = false;
  composer.hidden = false;
  clearReply();
  messageInput.value = localStorage.getItem('draft:' + id) || '';
  autoGrow();
  updateComposerState();
  renderGroups();

  if (currentUser) Store.joinGroup(id, currentUser).catch(() => {});

  messagesEl.innerHTML = '';
  knownMessageIds = new Set();
  msgLimit = MSG_PAGE;
  msgHasMore = false;
  subscribeMessages(id);

  if (unsubMembers) unsubMembers();
  unsubMembers = Store.watchMembers(id, (members) => {
    currentMembers = members;
    if (!adminOverlay.hidden) renderAdminPanel();
  });

  if (unsubTyping) unsubTyping();
  unsubTyping = Store.watchTyping(id, renderTyping);
}

function groupNotifMode(id) {
  const v = localStorage.getItem('gnotif:' + id);
  if (v === '0') return 'none';
  if (v === 'all' || v === 'mentions' || v === 'none') return v;
  return 'none';
}

function shouldNotifyFor(id, m) {
  if (!currentUser) return false;
  const mode = groupNotifMode(id);
  if (mode === 'none' || notifGlobal === 'none') return false;
  if (mode === 'mentions' || notifGlobal === 'mentions')
    return (m.mentions || []).includes(currentUser.uid);
  return true;
}

const groupWatchers = new Map();
const groupPrimed = new Set();
const groupUnread = new Set();

function syncGroupWatchers() {
  if (!currentUser) return;
  const mine = groups.filter((g) => (g.memberUids || []).includes(currentUser.uid));
  const ids = new Set(mine.map((g) => g.id));
  for (const [id, unsub] of [...groupWatchers]) {
    if (!ids.has(id)) {
      unsub();
      groupWatchers.delete(id);
      groupPrimed.delete(id);
      groupUnread.delete(id);
    }
  }
  mine.forEach((g) => {
    if (groupWatchers.has(g.id)) return;
    const unsub = Store.watchMessages(g.id, 1, (msgs) => onGroupLatest(g.id, msgs), () => {});
    groupWatchers.set(g.id, unsub);
  });
}

function stopGroupWatchers() {
  for (const [, unsub] of groupWatchers) unsub();
  groupWatchers.clear();
  groupPrimed.clear();
  groupUnread.clear();
}

function onGroupLatest(id, msgs) {
  const primed = groupPrimed.has(id);
  groupPrimed.add(id);
  const m = msgs[msgs.length - 1];
  if (!m || !primed) return;
  if (!currentUser || m.author === currentUser.uid || m.system) return;
  if (id === currentGroupId && !document.hidden) return;
  groupUnread.add(id);
  renderGroups();
  if (!shouldNotifyFor(id, m)) return;
  const body = m.text || (m.image ? 'Image' : m.audio ? 'Audio' : '');
  if (document.hidden) {
    if (window.Notification && Notification.permission === 'granted') {
      new Notification(m.authorName || 'Nouveau message', { body });
    }
  } else {
    const g = groups.find((x) => x.id === id);
    toast(`${g ? g.name : 'Groupe'} · ${m.authorName || 'Nouveau message'}`);
  }
}

function clearUnread(id) {
  if (groupUnread.delete(id)) renderGroups();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentGroupId) clearUnread(currentGroupId);
});

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
  closeFloating();
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
    img.alt = 'image';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    if (msg.imgW && msg.imgH) {
      img.width = msg.imgW;
      img.height = msg.imgH;
      img.style.aspectRatio = `${msg.imgW} / ${msg.imgH}`;
      img.loading = 'lazy';
    }
    let retried = false;
    img.addEventListener('error', () => {
      if (!retried && /^https?:\/\//i.test(msg.image)) {
        retried = true;
        const sep = msg.image.includes('?') ? '&' : '?';
        img.src = msg.image + sep + '_r=' + Date.now();
        return;
      }
      img.replaceWith(buildBrokenImage(msg.image));
    });
    img.addEventListener('click', () => openLightbox(msg.image));
    img.src = msg.image;
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

  const menuBtn = document.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'msg-menu-btn';
  menuBtn.setAttribute('aria-label', 'Options du message');
  menuBtn.innerHTML = '<i data-lucide="more-vertical" aria-hidden="true"></i>';

  const items = [];
  const addItem = (icon, label, handler) => items.push({ icon, label, handler });
  addItem('smile-plus', 'Réagir', () => openReactionPicker(msg, menuBtn));
  addItem('reply', 'Répondre', () => setReply(msg));
  if (msg.text) {
    addItem('copy', 'Copier', async () => {
      try { await navigator.clipboard.writeText(msg.text); toast('Texte copié.'); }
      catch { toast('Copie impossible.'); }
    });
    if (!looksFrench(msg.text)) {
      addItem('languages', 'Traduire', () => {
        if (!translation.hidden) { translation.hidden = true; translation.textContent = ''; return; }
        translation.hidden = false;
        translateMessage(msg.text, translation);
      });
    }
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
    openMessageMenu(items, menuBtn);
  });
  bubble.addEventListener('contextmenu', (e) => {
    if (e.target.closest('a')) return;
    e.preventDefault();
    openMessageMenu(items, menuBtn, { x: e.clientX, y: e.clientY });
  });

  bubble.appendChild(menuBtn);
  row.appendChild(bubble);
  return row;
}

function buildBrokenImage(src) {
  const box = document.createElement('div');
  box.className = 'broken-img';
  box.innerHTML = '<i data-lucide="image-off" aria-hidden="true"></i><span>Image indisponible</span>';
  if (/^https?:\/\//i.test(src)) {
    const a = document.createElement('a');
    a.href = src;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Ouvrir le lien';
    box.appendChild(a);
  }
  refreshIcons();
  return box;
}

function positionFloating(el, anchor, point) {
  el.hidden = false;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let left, top;
  if (point) {
    left = point.x;
    top = point.y;
  } else {
    const r = anchor.getBoundingClientRect();
    left = r.right - w;
    top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = r.top - h - 4;
  }
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
  if (left < 8) left = 8;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - 8 - h;
  if (top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function openMessageMenu(items, anchor, point) {
  const open = !point && !floatingMenu.hidden && floatingMenu.dataset.anchor === anchorId(anchor);
  closeFloating();
  if (open) return;
  floatingMenu.dataset.anchor = anchorId(anchor);
  floatingMenu.innerHTML = '';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<i data-lucide="${it.icon}" aria-hidden="true"></i><span>${it.label}</span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); closeFloating(); it.handler(e); });
    floatingMenu.appendChild(b);
  });
  refreshIcons();
  positionFloating(floatingMenu, anchor, point);
}

function openReactionPicker(msg, anchor) {
  closeFloating();
  floatingPicker.innerHTML = '';
  EMOJIS.forEach((emoji) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = emoji;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFloating();
      Store.toggleReaction(currentGroupId, msg, emoji, currentUser.uid).catch(() => {});
    });
    floatingPicker.appendChild(b);
  });
  positionFloating(floatingPicker, anchor);
}

let anchorSeq = 0;
function anchorId(el) {
  if (!el.dataset.anchorId) el.dataset.anchorId = String(++anchorSeq);
  return el.dataset.anchorId;
}

function closeFloating() {
  floatingMenu.hidden = true;
  floatingMenu.dataset.anchor = '';
  floatingPicker.hidden = true;
}
function closeAllMenus() { closeFloating(); }
document.addEventListener('click', closeFloating);
window.addEventListener('resize', closeFloating);
messagesEl.addEventListener('scroll', closeFloating);
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

function startEdit(msg, bubble, opts = {}) {
  const textEl = bubble.querySelector('.text');
  if (!textEl) return;
  const displayedWidth = bubble.getBoundingClientRect().width;
  bubble.classList.add('editing');
  bubble.style.width = displayedWidth + 'px';
  const ta = document.createElement('textarea');
  ta.className = 'edit-area';
  ta.value = opts.draft != null ? opts.draft : msg.text;
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
  const grow = () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };
  const syncState = () => {
    editing = { id: msg.id, draft: ta.value, start: ta.selectionStart, end: ta.selectionEnd };
  };
  editing = { id: msg.id, draft: ta.value, start: ta.value.length, end: ta.value.length };
  ta.addEventListener('input', () => { grow(); syncState(); });
  ta.addEventListener('keyup', syncState);
  ta.addEventListener('click', syncState);
  grow();
  if (opts.silent) {
    const caret = opts.start != null ? opts.start : ta.value.length;
    const caretEnd = opts.end != null ? opts.end : caret;
    ta.setSelectionRange(caret, caretEnd);
    ta.focus({ preventScroll: true });
  } else {
    ta.focus();
    requestAnimationFrame(grow);
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
  const close = () => { editing = null; renderMessages(); };
  cancel.addEventListener('click', close);
  save.addEventListener('click', async () => {
    const v = ta.value.trim();
    if (!v) { toast('Le message ne peut pas être vide.'); return; }
    editing = null;
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

let pendingRestore = null;
function subscribeMessages(id) {
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  unsubMessages = Store.watchMessages(
    id,
    msgLimit,
    (messages, hasMore) => {
      msgHasMore = hasMore;
      loadingMore = false;
      currentMessages = messages;
      renderMessages();
      renderPinned();
    },
    () => resetChat()
  );
}

function loadMoreMessages() {
  if (loadingMore || !msgHasMore || !currentGroupId) return;
  loadingMore = true;
  msgLimit += MSG_PAGE;
  subscribeMessages(currentGroupId);
}

function appendSystemRun(run) {
  if (run.length <= 3) {
    run.forEach((m) => messagesEl.appendChild(buildBubble(m)));
    return;
  }
  const key = run[0].id;
  const expanded = expandedSys.has(key);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'system-toggle';
  toggle.textContent = expanded
    ? 'Voir moins'
    : `Voir ${run.length - 3} message${run.length - 3 > 1 ? 's' : ''} de plus`;
  toggle.addEventListener('click', () => {
    if (expanded) expandedSys.delete(key); else expandedSys.add(key);
    renderMessages();
  });
  messagesEl.appendChild(toggle);
  const shown = expanded ? run : run.slice(-3);
  shown.forEach((m) => messagesEl.appendChild(buildBubble(m)));
}

function renderMessages() {
  const atBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  const prevTop = messagesEl.scrollTop;
  const prevHeight = messagesEl.scrollHeight;
  closeFloating();
  messagesEl.innerHTML = '';
  let i = 0;
  while (i < currentMessages.length) {
    if (currentMessages[i].system) {
      let j = i;
      const run = [];
      while (j < currentMessages.length && currentMessages[j].system) { run.push(currentMessages[j]); j++; }
      appendSystemRun(run);
      i = j;
    } else {
      messagesEl.appendChild(buildBubble(currentMessages[i]));
      i++;
    }
  }
  refreshIcons();
  if (editing) {
    const msg = currentMessages.find((m) => m.id === editing.id);
    const bubble = messagesEl.querySelector(`.bubble[data-id="${editing.id}"]`);
    if (msg && bubble) {
      startEdit(msg, bubble, { draft: editing.draft, start: editing.start, end: editing.end, silent: true });
    } else {
      editing = null;
    }
  }
  if (restoreScrollFor === currentGroupId) {
    const raw = localStorage.getItem('scroll:' + currentGroupId);
    const saved = raw === null ? null : Number(raw);
    if (saved === null || Number.isNaN(saved)) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else {
      messagesEl.scrollTop = saved;
      pendingRestore = { group: currentGroupId, top: saved };
      reanchorOnLoad();
    }
    restoreScrollFor = null;
  } else if (atBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } else {
    messagesEl.scrollTop = prevTop + (messagesEl.scrollHeight - prevHeight);
  }
  updateScrollDown();
}

function reanchorOnLoad() {
  const imgs = messagesEl.querySelectorAll('img');
  imgs.forEach((im) => {
    if (im.complete) return;
    im.addEventListener('load', applyPendingRestore, { once: true });
    im.addEventListener('error', applyPendingRestore, { once: true });
  });
}
function applyPendingRestore() {
  if (pendingRestore && pendingRestore.group === currentGroupId) {
    messagesEl.scrollTop = pendingRestore.top;
    updateScrollDown();
  }
}

function updateScrollDown() {
  const far =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight > 200;
  scrollDown.hidden = !far || !currentGroupId;
}

function cancelRestore() { pendingRestore = null; }
messagesEl.addEventListener('wheel', cancelRestore, { passive: true });
messagesEl.addEventListener('touchstart', cancelRestore, { passive: true });
messagesEl.addEventListener('keydown', cancelRestore);

messagesEl.addEventListener('scroll', () => {
  if (currentGroupId && !pendingRestore) {
    localStorage.setItem('scroll:' + currentGroupId, String(messagesEl.scrollTop));
  }
  if (messagesEl.scrollTop < 120) loadMoreMessages();
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
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', 'pin');
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'reply-bar__info pinned-jump';
    const name = document.createElement('span');
    name.className = 'reply-bar__name';
    name.textContent = msg.authorName || 'Anonyme';
    const text = document.createElement('span');
    text.className = 'reply-bar__text';
    text.textContent = msg.text || (msg.image ? 'Image' : msg.audio ? 'Audio' : '');
    label.appendChild(name);
    label.appendChild(text);
    label.addEventListener('click', () => scrollToMessage(msg.id));
    item.appendChild(icon);
    item.appendChild(label);
    if (admin) {
      const unpin = document.createElement('button');
      unpin.type = 'button';
      unpin.className = 'pinned-unpin icon-btn';
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
  const top =
    el.getBoundingClientRect().top -
    messagesEl.getBoundingClientRect().top +
    messagesEl.scrollTop -
    80;
  messagesEl.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
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
  const group = currentGroup();
  const code = group ? (group.joinCode || '') : '';
  try {
    await navigator.clipboard.writeText(formatInviteCode(code));
    copyInviteBtn.textContent = 'Copié !';
    setTimeout(() => (copyInviteBtn.textContent = 'Copier'), 1500);
  } catch {
    toast('Code : ' + formatInviteCode(code));
  }
});

shareLinkBtn.addEventListener('click', async () => {
  const group = currentGroup();
  if (!group) return;
  const link = inviteLink(group.joinCode);
  try {
    if (navigator.share) {
      await navigator.share({ title: group.name, text: `Rejoins « ${group.name} »`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      toast('Lien d’invitation copié.');
    }
  } catch {
    toast(link);
  }
});

lockToggle.addEventListener('change', () => {
  if (!currentGroupId) return;
  Store.setLocked(currentGroupId, lockToggle.checked).catch((err) => toast('Action impossible : ' + err.message));
});

function slowLabel(s) { return s > 0 ? `${s} s` : 'Désactivé'; }
slowRange.addEventListener('input', () => { slowValue.textContent = slowLabel(Number(slowRange.value)); });
slowApply.addEventListener('click', async () => {
  if (!currentGroupId || !currentUser) return;
  const group = currentGroup();
  const seconds = Number(slowRange.value);
  if (group && (group.slowMode || 0) === seconds) { toast('Mode lent déjà à cette valeur.'); return; }
  try {
    await Store.setSlowMode(currentGroupId, seconds);
    await Store.addSystemMessage(
      currentGroupId,
      seconds > 0 ? `Mode lent réglé sur ${seconds} s` : 'Mode lent désactivé',
      currentUser
    ).catch(() => {});
    toast('Mode lent mis à jour.');
  } catch (err) {
    toast('Action impossible : ' + err.message);
  }
});

groupNotifToggle.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    if (!currentGroupId) return;
    localStorage.setItem('gnotif:' + currentGroupId, b.dataset.v);
    updateGroupNotifToggle(currentGroupId);
  });
});
function updateGroupNotifToggle(id) {
  const mode = groupNotifMode(id);
  groupNotifToggle.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('active', b.dataset.v === mode)
  );
}

function renderAdminPanel() {
  const group = currentGroup();
  if (!group) return;
  inviteCodeEl.textContent = formatInviteCode(group.joinCode);
  const iAmAdmin = isAdminOf(group);
  renameBlock.hidden = !iAmAdmin;
  if (iAmAdmin) renameInput.value = group.name || '';

  const vis = group.visibility === 'public' ? 'public' : 'private';
  inviteBlock.hidden = vis === 'public';

  visibilityBlock.hidden = !iAmAdmin;
  visPublicBtn.classList.toggle('active', vis === 'public');
  visPrivateBtn.classList.toggle('active', vis === 'private');
  visibilityHint.textContent =
    vis === 'public'
      ? 'Visible et rejoignable par tout le monde.'
      : 'Accessible uniquement avec le code d’invitation.';

  moderationBlock.hidden = !iAmAdmin;
  lockToggle.checked = !!group.locked;
  slowRange.value = String(group.slowMode || 0);
  slowValue.textContent = slowLabel(group.slowMode || 0);

  updateGroupNotifToggle(currentGroupId);

  renderMembers(group);
}

async function changeVisibility(v) {
  const group = currentGroup();
  if (!currentGroupId || !group) return;
  if ((group.visibility || 'private') === v) return;
  try {
    await Store.setVisibility(currentGroupId, v);
    await Store.addSystemMessage(
      currentGroupId,
      `${currentUser.displayName || 'Un admin'} a rendu le groupe ${v === 'public' ? 'public' : 'privé'}`,
      currentUser
    );
  } catch (err) {
    toast('Modification impossible : ' + err.message);
  }
}
visPublicBtn.addEventListener('click', () => changeVisibility('public'));
visPrivateBtn.addEventListener('click', () => changeVisibility('private'));

renameSave.addEventListener('click', async () => {
  const name = renameInput.value.trim();
  const group = currentGroup();
  if (!name || !currentGroupId || !group || name === group.name) return;
  try {
    await Store.renameGroup(currentGroupId, name);
    await Store.addSystemMessage(
      currentGroupId,
      `${currentUser.displayName || 'Un admin'} a renommé le groupe en « ${name.slice(0, 40)} »`,
      currentUser
    );
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
      const isMuted = (group.mutedUids || []).includes(m.uid);
      const muteBtn = document.createElement('button');
      muteBtn.className = 'icon-btn';
      muteBtn.title = isMuted ? 'Réactiver (rendre la parole)' : 'Rendre muet';
      muteBtn.setAttribute('aria-label', muteBtn.title);
      muteBtn.innerHTML = `<i data-lucide="${isMuted ? 'mic' : 'mic-off'}" aria-hidden="true"></i>`;
      muteBtn.addEventListener('click', async () => {
        try {
          await Store.setMuted(currentGroupId, m.uid, !isMuted);
          await Store.addSystemMessage(
            currentGroupId,
            `${m.name} a été ${isMuted ? 'réactivé' : 'rendu muet'}`,
            currentUser
          );
        } catch (err) {
          toast('Action impossible : ' + err.message);
        }
      });
      right.appendChild(muteBtn);
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

let createVis = 'private';
function openCreateModal() {
  createName.value = '';
  createVis = 'private';
  createVisibility.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('active', b.dataset.value === 'private')
  );
  createOverlay.hidden = false;
  refreshIcons();
  createName.focus();
}
openCreateBtn.addEventListener('click', openCreateModal);
createClose.addEventListener('click', () => { createOverlay.hidden = true; });
createCancel.addEventListener('click', () => { createOverlay.hidden = true; });
createOverlay.addEventListener('click', (e) => { if (e.target === createOverlay) createOverlay.hidden = true; });
createVisibility.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    createVis = b.dataset.value;
    createVisibility.querySelectorAll('button').forEach((x) =>
      x.classList.toggle('active', x === b)
    );
  });
});
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = createName.value.trim();
  if (!name || !currentUser) return;
  createOverlay.hidden = true;
  try {
    const ref = await Store.addGroup(name, currentUser, createVis);
    selectGroup(ref.id);
  } catch (err) {
    toast('Impossible de créer le groupe : ' + err.message);
  }
});

function openJoinModal() {
  joinInput.value = '';
  joinOverlay.hidden = false;
  joinInput.focus();
}
openJoinBtn.addEventListener('click', openJoinModal);
joinClose.addEventListener('click', () => { joinOverlay.hidden = true; });
joinCancel.addEventListener('click', () => { joinOverlay.hidden = true; });
joinOverlay.addEventListener('click', (e) => { if (e.target === joinOverlay) joinOverlay.hidden = true; });
joinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await doJoin(joinInput.value);
});

async function doJoin(raw) {
  const code = (raw || '').trim();
  if (!code || !currentUser) return;
  try {
    const groupId = await Store.joinByCode(code, currentUser);
    joinOverlay.hidden = true;
    if (!groupId) { toast('Code invalide.'); return; }
    selectGroup(groupId);
  } catch (err) {
    toast('Impossible de rejoindre : ' + err.message);
  }
}

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
  if (!canPostIn(currentGroup())) {
    toast(isMutedIn(currentGroup()) ? 'Tu es muet dans ce groupe.' : 'Le chat est bloqué.');
    return;
  }
  const imgs = pendingImages.slice();
  const text = messageInput.value.trim();
  if (findProfanity(text)) { toast('Message bloqué : langage inapproprié.', 'error'); return; }
  const reply = replyingTo;
  const mentions = [...new Set([...computeMentions(text), ...replyMentions()])];
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
  if (!canPostIn(currentGroup())) {
    toast(isMutedIn(currentGroup()) ? 'Tu es muet dans ce groupe.' : 'Le chat est bloqué.');
    return;
  }
  const clean = url.trim();
  if (!/^https:\/\//i.test(clean)) { toast('URL invalide (https requis).'); return; }
  Store.addMessage(currentGroupId, {
    text: messageInput.value.trim(),
    image: clean,
    user: currentUser,
    reply: replyingTo,
    mentions: [...new Set([...computeMentions(messageInput.value.trim()), ...replyMentions()])],
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
  cmdPop.hidden = true;
  const text = messageInput.value.trim();
  if (!text || !currentGroupId || !currentUser) return;
  const group = currentGroup();

  if (text.startsWith('/')) {
    const handled = await handleCommand(text);
    if (handled) {
      messageInput.value = '';
      localStorage.removeItem('draft:' + currentGroupId);
      autoGrow();
      mentionPop.hidden = true;
      stopTyping();
      return;
    }
  }

  if (!canPostIn(group)) {
    toast(isMutedIn(group) ? 'Tu es muet dans ce groupe.' : 'Le chat est bloqué.');
    return;
  }

  const slow = group && group.slowMode > 0 && !isAdminOf(group) ? group.slowMode : 0;
  if (slow) {
    const wait = Math.ceil((lastSentAt + slow * 1000 - Date.now()) / 1000);
    if (wait > 0) { toast(`Mode lent : attends encore ${wait} s.`); return; }
  }

  const bad = findProfanity(text);
  if (bad) {
    toast('Message bloqué : langage inapproprié détecté.', 'error');
    return;
  }

  const reply = replyingTo;
  const mentions = [...new Set([...computeMentions(text), ...replyMentions()])];
  messageInput.value = '';
  localStorage.removeItem('draft:' + currentGroupId);
  autoGrow();
  mentionPop.hidden = true;
  stopTyping();
  clearReply();
  try {
    await Store.addMessage(currentGroupId, { text, user: currentUser, reply, mentions });
    lastSentAt = Date.now();
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (err) {
    toast('Envoi impossible : ' + err.message);
  }
});

function resolveMention(token) {
  if (!token) return null;
  const q = token.replace(/^@/, '').toLowerCase();
  return currentMembers.find((m) => {
    const n = (m.name || '').toLowerCase();
    return n === q || n.split(' ')[0] === q || n.startsWith(q);
  });
}

async function handleCommand(text) {
  if (/^\/r(?:\s|$)/i.test(text)) {
    if (!currentUser) return true;
    const last = [...currentMessages]
      .reverse()
      .find((msg) => !msg.system && msg.author !== currentUser.uid && (msg.mentions || []).includes(currentUser.uid));
    if (!last) {
      await infoModal("Tu n'as pas encore été mentionné dans ce groupe.");
      return true;
    }
    setReply(last);
    return true;
  }

  const m = text.match(/^\/group\s+(\w+)\s*(.*)$/i);
  if (!m) return false;
  const group = currentGroup();
  if (!group) return false;
  const cmd = m[1].toLowerCase();
  const arg = m[2].trim();
  const admin = isAdminOf(group);
  const owner = isOwnerOf(group);

  const needAdmin = () => {
    if (!admin) { toast("Réservé aux administrateurs."); return false; }
    return true;
  };

  try {
    if (cmd === 'clear') {
      if (!needAdmin()) return true;
      const n = arg.toLowerCase() === 'all' ? 'all' : parseInt(arg, 10);
      if (n !== 'all' && (!n || n < 1)) { toast('Usage : /group clear <nombre|all>'); return true; }
      const ok = await confirmModal(n === 'all' ? 'Supprimer TOUS les messages ?' : `Supprimer les ${n} derniers messages ?`);
      if (!ok) return true;
      const count = await Store.clearMessages(currentGroupId, n);
      toast(`${count} message(s) supprimé(s).`);
      return true;
    }

    if (cmd === 'rename') {
      if (!needAdmin()) return true;
      if (!arg) { toast('Usage : /group rename <nom>'); return true; }
      await Store.renameGroup(currentGroupId, arg.slice(0, 40));
      await Store.addSystemMessage(currentGroupId, `${currentUser.displayName || 'Un admin'} a renommé le groupe en « ${arg.slice(0, 40)} »`, currentUser);
      toast('Groupe renommé.');
      return true;
    }

    if (cmd === 'visibility') {
      if (!needAdmin()) return true;
      const v = arg.toLowerCase();
      if (v !== 'public' && v !== 'private') { toast('Usage : /group visibility <public|private>'); return true; }
      await Store.setVisibility(currentGroupId, v);
      await Store.addSystemMessage(currentGroupId, `${currentUser.displayName || 'Un admin'} a rendu le groupe ${v === 'public' ? 'public' : 'privé'}`, currentUser);
      toast('Visibilité : ' + v + '.');
      return true;
    }

    if (cmd === 'mod' || cmd === 'ban' || cmd === 'timeout') {
      if (!needAdmin()) return true;
      const target = resolveMention(arg);
      if (!target) { toast('Membre introuvable. Usage : /group ' + cmd + ' @nom'); return true; }
      if (target.uid === group.createdBy) { toast('Action impossible sur le propriétaire.'); return true; }
      if (cmd === 'mod') {
        if (!owner) { toast('Seul le propriétaire peut nommer un admin.'); return true; }
        const isMod = (group.adminUids || []).includes(target.uid);
        await Store.setAdmin(currentGroupId, target.uid, !isMod);
        await Store.addSystemMessage(currentGroupId, `${target.name} ${isMod ? "n'est plus" : 'est désormais'} admin`, currentUser);
        toast(isMod ? 'Droits admin retirés.' : target.name + ' est admin.');
      } else if (cmd === 'ban') {
        await Store.setBanned(currentGroupId, target.uid, true);
        await Store.addSystemMessage(currentGroupId, `${target.name} a été banni`, currentUser);
        toast(target.name + ' banni.');
      } else if (cmd === 'timeout') {
        const isMuted = (group.mutedUids || []).includes(target.uid);
        await Store.setMuted(currentGroupId, target.uid, !isMuted);
        await Store.addSystemMessage(currentGroupId, `${target.name} a été ${isMuted ? 'réactivé' : 'rendu muet'}`, currentUser);
        toast(isMuted ? target.name + ' peut réécrire.' : target.name + ' est muet.');
      }
      return true;
    }

    toast('Commande inconnue. /group clear|mod|timeout|ban|rename|visibility');
    return true;
  } catch (err) {
    toast('Commande impossible : ' + err.message);
    return true;
  }
}

plusBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  plusMenu.hidden = !plusMenu.hidden;
});
plusMenu.addEventListener('click', () => { plusMenu.hidden = true; });
document.addEventListener('click', (e) => {
  if (!plusMenu.hidden && !e.target.closest('.plus-wrap')) plusMenu.hidden = true;
});

urlBtn.addEventListener('click', () => {
  urlInput.value = '';
  urlOverlay.hidden = false;
  urlInput.focus();
});
urlClose.addEventListener('click', () => { urlOverlay.hidden = true; });
urlCancel.addEventListener('click', () => { urlOverlay.hidden = true; });
urlOverlay.addEventListener('click', (e) => { if (e.target === urlOverlay) urlOverlay.hidden = true; });
urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  urlOverlay.hidden = true;
  sendMediaUrl(url);
});

function autoGrow() {
  const atBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  messageInput.style.height = 'auto';
  const full = messageInput.scrollHeight;
  messageInput.style.height = Math.min(full, 140) + 'px';
  messageInput.classList.toggle('scrollable', full > 140);
  if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}
messageInput.addEventListener('input', autoGrow);
messageInput.addEventListener('input', () => {
  if (currentGroupId) {
    if (messageInput.value) localStorage.setItem('draft:' + currentGroupId, messageInput.value);
    else localStorage.removeItem('draft:' + currentGroupId);
  }
});
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

function updateReplyMentionBtn() {
  replyMentionBtn.classList.toggle('reply-mention--off', !replyMention);
  replyMentionBtn.setAttribute('aria-pressed', String(replyMention));
  replyMentionBtn.setAttribute(
    'aria-label',
    replyMention ? "Ne pas mentionner l'auteur" : "Mentionner l'auteur"
  );
}
function setReply(msg) {
  const wasBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  replyingTo = {
    id: msg.id,
    uid: msg.author,
    name: msg.authorName || 'Anonyme',
    text: (msg.text || (msg.image ? 'Image' : msg.audio ? 'Audio' : '')).slice(0, 140),
  };
  replyMention = true;
  updateReplyMentionBtn();
  replyBarName.textContent = replyingTo.name;
  replyBarText.textContent = replyingTo.text;
  replyBar.hidden = false;
  refreshIcons();
  if (wasBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  messageInput.focus();
}
function clearReply() {
  const wasBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 60;
  const wasOpen = !replyBar.hidden;
  replyingTo = null;
  replyBar.hidden = true;
  if (wasOpen && wasBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}
function replyMentions() {
  return replyingTo && replyMention && replyingTo.uid && replyingTo.uid !== (currentUser && currentUser.uid)
    ? [replyingTo.uid]
    : [];
}
replyCancel.addEventListener('click', clearReply);
replyMentionBtn.addEventListener('click', () => {
  replyMention = !replyMention;
  updateReplyMentionBtn();
});
replyBarJump.addEventListener('click', () => {
  if (replyingTo) scrollToMessage(replyingTo.id);
});

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

function renderCmdPop(items) {
  cmdPop.innerHTML = '';
  items.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cmd-item';
    b.innerHTML =
      `<i data-lucide="${c.icon}" aria-hidden="true"></i>` +
      `<span class="cmd-item__name">${c.label}</span>` +
      `<span class="cmd-item__desc">${c.desc}</span>`;
    b.addEventListener('click', () => {
      messageInput.value = c.insert;
      cmdPop.hidden = true;
      messageInput.focus();
      messageInput.setSelectionRange(c.insert.length, c.insert.length);
      autoGrow();
    });
    cmdPop.appendChild(b);
  });
  cmdPop.hidden = items.length === 0;
  refreshIcons();
}

messageInput.addEventListener('input', () => {
  const val = messageInput.value;
  const m = val.match(/^\/([a-zA-Z]*)$/);
  if (!m) { cmdPop.hidden = true; return; }
  mentionPop.hidden = true;
  const q = ('/' + m[1]).toLowerCase();
  renderCmdPop(allowedCommands().filter((c) => c.label.toLowerCase().startsWith(q) || ('/group').startsWith(q)));
});
document.addEventListener('click', (e) => {
  if (!cmdPop.hidden && !e.target.closest('#cmd-pop') && e.target !== messageInput) cmdPop.hidden = true;
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

function pad2(n) { return String(n).padStart(2, '0'); }
function timeModalTimestamp() {
  const d = timeDate.value ? new Date(timeDate.value + 'T' + (timeTime.value || '00:00')) : new Date();
  return Math.floor(d.getTime() / 1000);
}
function updateTimePreview() {
  const sec = timeModalTimestamp();
  const tmp = document.createElement('div');
  tmp.innerHTML = formatDiscordTs(sec, timeFormat.value);
  timePreview.textContent = 'Aperçu : ' + (tmp.textContent || '');
}
function openTimeModal() {
  const now = new Date();
  timeDate.value = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  timeTime.value = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  timeFormat.value = 'R';
  updateTimePreview();
  timeOverlay.hidden = false;
}
timeBtn.addEventListener('click', openTimeModal);
timeClose.addEventListener('click', () => { timeOverlay.hidden = true; });
timeCancel.addEventListener('click', () => { timeOverlay.hidden = true; });
timeOverlay.addEventListener('click', (e) => { if (e.target === timeOverlay) timeOverlay.hidden = true; });
[timeDate, timeTime, timeFormat].forEach((el) => el.addEventListener('input', updateTimePreview));
timeForm.addEventListener('submit', (e) => {
  e.preventDefault();
  insertText(`<t:${timeModalTimestamp()}:${timeFormat.value}>`);
  timeOverlay.hidden = true;
  autoGrow();
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
