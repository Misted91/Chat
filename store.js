/*
 * Couche de données (Store).
 * -------------------------------------------------------------
 * Pour l'instant tout est stocké dans le localStorage du navigateur.
 * Cette classe expose une API simple (getGroups, addGroup, addMessage…)
 * qu'il suffira de réimplémenter avec Firebase/Firestore plus tard,
 * SANS toucher à app.js.
 *
 * Voir README.md, section « Brancher Firebase ».
 */
const Store = (() => {
  const KEY = 'chat-groups-v1';

  function _read() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function _write(groups) {
    localStorage.setItem(KEY, JSON.stringify(groups));
  }

  function _uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    /** @returns {Array<{id,name,messages:Array}>} */
    getGroups() {
      return _read();
    },

    getGroup(id) {
      return _read().find((g) => g.id === id) || null;
    },

    addGroup(name) {
      const groups = _read();
      const group = { id: _uid(), name: name.trim(), messages: [] };
      groups.push(group);
      _write(groups);
      return group;
    },

    deleteGroup(id) {
      _write(_read().filter((g) => g.id !== id));
    },

    addMessage(groupId, { author, text }) {
      const groups = _read();
      const group = groups.find((g) => g.id === groupId);
      if (!group) return null;
      const message = {
        id: _uid(),
        author,
        text: text.trim(),
        ts: Date.now(),
      };
      group.messages.push(message);
      _write(groups);
      return message;
    },
  };
})();
