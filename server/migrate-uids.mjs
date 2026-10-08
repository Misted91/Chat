import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chat-fd96b';
const SSO_PROVIDER_ID = 'oidc.authentik';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const mapArg = args.find((a) => a.startsWith('--map='));

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const auth = admin.auth();

async function buildMapping() {
  const oldByEmail = new Map();
  const newByEmail = new Map();
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) {
      const ssoInfo = u.providerData.find((p) => p.providerId === SSO_PROVIDER_ID);
      const isSso = Boolean(ssoInfo);
      const email = ((isSso ? ssoInfo.email : u.email) || u.email || '').toLowerCase();
      if (!email) continue;
      (isSso ? newByEmail : oldByEmail).set(email, u.uid);
    }
    token = page.pageToken;
  } while (token);

  const mapping = new Map();
  const unmatched = [];
  for (const [email, oldUid] of oldByEmail) {
    const newUid = newByEmail.get(email);
    if (newUid && newUid !== oldUid) mapping.set(oldUid, newUid);
    else if (!newUid) unmatched.push(email);
  }
  if (mapArg) {
    const manual = JSON.parse(readFileSync(mapArg.slice(6), 'utf8'));
    for (const [oldUid, newUid] of Object.entries(manual)) mapping.set(oldUid, newUid);
  }
  return { mapping, unmatched };
}

function remap(value, mapping) {
  if (typeof value === 'string') return mapping.has(value) ? mapping.get(value) : value;
  if (Array.isArray(value)) {
    const out = value.map((v) => remap(v, mapping));
    return out.every((v) => typeof v === 'string') ? [...new Set(out)] : out;
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = remap(v, mapping);
    return out;
  }
  return value;
}

const stats = { groups: 0, messages: 0, members: 0, profiles: 0, invites: 0, typing: 0 };
const writer = db.bulkWriter();
writer.onWriteError((err) => {
  console.error('Écriture échouée :', err.documentRef.path, err.message);
  return false;
});

function sameData(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function updateIfChanged(ref, data, mapping, statKey) {
  const next = remap(data, mapping);
  if (sameData(data, next)) return;
  stats[statKey]++;
  if (APPLY) writer.set(ref, next);
}

async function moveDoc(coll, snap, mapping, statKey) {
  const newUid = mapping.get(snap.id);
  if (!newUid) return;
  stats[statKey]++;
  if (!APPLY) return;
  writer.set(coll.doc(newUid), remap(snap.data(), mapping), { merge: true });
  writer.delete(snap.ref);
}

async function migrate(mapping) {
  const groups = await db.collection('groups').get();
  for (const group of groups.docs) {
    updateIfChanged(group.ref, group.data(), mapping, 'groups');

    const messages = await group.ref.collection('messages').get();
    for (const msg of messages.docs) updateIfChanged(msg.ref, msg.data(), mapping, 'messages');

    const members = group.ref.collection('members');
    for (const m of (await members.get()).docs) {
      if (mapping.has(m.id)) await moveDoc(members, m, mapping, 'members');
      else updateIfChanged(m.ref, m.data(), mapping, 'members');
    }

    for (const t of (await group.ref.collection('typing').get()).docs) {
      if (mapping.has(t.id)) {
        stats.typing++;
        if (APPLY) writer.delete(t.ref);
      }
    }

    for (const e of (await group.ref.collection('emojis').get()).docs) {
      updateIfChanged(e.ref, e.data(), mapping, 'messages');
    }
  }

  const profiles = db.collection('profiles');
  for (const p of (await profiles.get()).docs) {
    if (mapping.has(p.id)) await moveDoc(profiles, p, mapping, 'profiles');
  }

  for (const inv of (await db.collection('invites').get()).docs) {
    updateIfChanged(inv.ref, inv.data(), mapping, 'invites');
  }
}

const { mapping, unmatched } = await buildMapping();
console.log(`Correspondances trouvées : ${mapping.size}`);
for (const [o, n] of mapping) console.log(`  ${o} -> ${n}`);
if (unmatched.length) {
  console.log(`Anciens comptes sans compte SSO (ignorés pour l'instant) : ${unmatched.length}`);
  for (const e of unmatched) console.log(`  ${e}`);
}
if (!mapping.size) {
  console.log('Rien à migrer.');
  process.exit(0);
}

await migrate(mapping);
await writer.close();

console.log(APPLY ? 'Migration appliquée.' : 'Simulation (aucune écriture). Relancer avec --apply.');
console.log(stats);
