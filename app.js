/*
 * Logique de l'interface.
 * Utilise la couche Store (store.js) pour lire/écrire les données.
 */
(() => {
  // --- État courant ---
  let currentGroupId = null;

  // Nom d'utilisateur : provisoire tant qu'il n'y a pas d'auth Google.
  // Sera remplacé par le compte Firebase connecté.
  const currentUser = 'Invité';

  // --- Références DOM ---
  const groupList = document.getElementById('group-list');
  const newGroupForm = document.getElementById('new-group-form');
  const newGroupInput = document.getElementById('new-group-input');

  const chatTitle = document.getElementById('chat-title');
  const deleteBtn = document.getElementById('delete-group');
  const messagesEl = document.getElementById('messages');
  const composer = document.getElementById('composer');
  const messageInput = document.getElementById('message-input');

  document.getElementById('user-name').textContent = currentUser;

  // --- Rendu de la liste des groupes ---
  function renderGroups() {
    const groups = Store.getGroups();
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

      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = group.messages.length + ' msg';

      li.append(name, count);
      li.addEventListener('click', () => selectGroup(group.id));
      groupList.appendChild(li);
    });
  }

  // --- Sélection d'un groupe ---
  function selectGroup(id) {
    currentGroupId = id;
    const group = Store.getGroup(id);
    if (!group) return;

    chatTitle.textContent = group.name;
    deleteBtn.hidden = false;
    composer.hidden = false;
    renderGroups();
    renderMessages();
  }

  // --- Rendu des messages du groupe courant ---
  function renderMessages() {
    messagesEl.innerHTML = '';
    if (!currentGroupId) return;

    const group = Store.getGroup(currentGroupId);
    if (!group) return;

    group.messages.forEach((msg) => {
      const bubble = document.createElement('div');
      bubble.className = 'bubble' + (msg.author === currentUser ? ' me' : '');

      const meta = document.createElement('span');
      meta.className = 'meta';
      const time = new Date(msg.ts).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      });
      meta.textContent = `${msg.author} · ${time}`;

      const text = document.createElement('span');
      text.textContent = msg.text;

      bubble.append(meta, text);
      messagesEl.appendChild(bubble);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // --- Création d'un groupe ---
  newGroupForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = newGroupInput.value.trim();
    if (!name) return;
    const group = Store.addGroup(name);
    newGroupInput.value = '';
    selectGroup(group.id);
  });

  // --- Suppression du groupe courant ---
  deleteBtn.addEventListener('click', () => {
    if (!currentGroupId) return;
    const group = Store.getGroup(currentGroupId);
    if (!group) return;
    if (!confirm(`Supprimer le groupe « ${group.name} » ?`)) return;

    Store.deleteGroup(currentGroupId);
    currentGroupId = null;
    chatTitle.textContent = 'Sélectionne un groupe';
    deleteBtn.hidden = true;
    composer.hidden = true;
    messagesEl.innerHTML = '';
    renderGroups();
  });

  // --- Envoi d'un message ---
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !currentGroupId) return;
    Store.addMessage(currentGroupId, { author: currentUser, text });
    messageInput.value = '';
    renderMessages();
    renderGroups(); // met à jour le compteur
  });

  // --- Démarrage ---
  renderGroups();
})();
