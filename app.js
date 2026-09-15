/*
 * Logique de l'interface.
 * Auth Google (Firebase) + données temps réel (Firestore).
 */
import { Store } from './store.js';
import { loginWithGoogle, logout, watchAuth } from './firebase.js';

// --- État ---
let currentUser = null;         // objet utilisateur Firebase
let currentGroupId = null;
let groups = [];                // dernier instantané des groupes
let unsubMessages = null;       // désabonnement des messages du groupe courant

// --- Références DOM ---
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');

const groupList = document.getElementById('group-list');
const newGroupForm = document.getElementById('new-group-form');
const newGroupInput = document.getElementById('new-group-input');

const chatTitle = document.getElementById('chat-title');
const deleteBtn = document.getElementById('delete-group');
const messagesEl = document.getElementById('messages');
const composer = document.getElementById('composer');
const messageInput = document.getElementById('message-input');

// --- Authentification ---
loginBtn.addEventListener('click', () => {
  loginWithGoogle().catch((err) => {
    console.error(err);
    alert('Connexion impossible : ' + err.message);
  });
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
    startGroupsListener();
  } else {
    loginOverlay.hidden = false;
    logoutBtn.hidden = true;
    userAvatar.hidden = true;
    userName.textContent = '';
    resetChat();
    groupList.innerHTML = '';
  }
});

// --- Groupes (temps réel) ---
function startGroupsListener() {
  Store.watchGroups((list) => {
    groups = list;
    renderGroups();
    // Si le groupe ouvert a disparu, on ferme la conversation.
    if (currentGroupId && !groups.some((g) => g.id === currentGroupId)) {
      resetChat();
    } else if (currentGroupId) {
      const g = groups.find((g) => g.id === currentGroupId);
      if (g) chatTitle.textContent = g.name;
    }
  });
}

function renderGroups() {
  groupList.innerHTML = '';

  if (groups.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Aucun groupe. Crée-en un ci-dessus.';
    groupList.appendChild(li);
    return;
  }

  groups.forEach((group) => {
    const li = document.createElement('li');
    li.className = 'group-item' + (group.id === currentGroupId ? ' active' : '');
    li.dataset.id = group.id;

    const name = document.createElement('span');
    name.textContent = group.name;

    li.appendChild(name);
    li.addEventListener('click', () => selectGroup(group.id));
    groupList.appendChild(li);
  });
}

// --- Sélection d'un groupe ---
function selectGroup(id) {
  currentGroupId = id;
  const group = groups.find((g) => g.id === id);
  if (!group) return;

  chatTitle.textContent = group.name;
  deleteBtn.hidden = false;
  composer.hidden = false;
  renderGroups();

  // (Re)démarre l'abonnement aux messages.
  if (unsubMessages) unsubMessages();
  messagesEl.innerHTML = '';
  unsubMessages = Store.watchMessages(id, renderMessages);
}

function resetChat() {
  currentGroupId = null;
  if (unsubMessages) { unsubMessages(); unsubMessages = null; }
  chatTitle.textContent = 'Sélectionne un groupe';
  deleteBtn.hidden = true;
  composer.hidden = true;
  messagesEl.innerHTML = '';
  renderGroups();
}

// --- Messages (temps réel) ---
function renderMessages(messages) {
  messagesEl.innerHTML = '';

  messages.forEach((msg) => {
    const bubble = document.createElement('div');
    const isMe = currentUser && msg.author === currentUser.uid;
    bubble.className = 'bubble' + (isMe ? ' me' : '');

    const meta = document.createElement('span');
    meta.className = 'meta';
    const date = msg.ts && msg.ts.toDate ? msg.ts.toDate() : new Date();
    const time = date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    meta.textContent = `${msg.authorName || 'Anonyme'} · ${time}`;

    const text = document.createElement('span');
    text.textContent = msg.text;

    bubble.append(meta, text);
    messagesEl.appendChild(bubble);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
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

// --- Suppression du groupe courant ---
deleteBtn.addEventListener('click', async () => {
  if (!currentGroupId) return;
  const group = groups.find((g) => g.id === currentGroupId);
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
