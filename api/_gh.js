// GitHub messages.json store (repo nothing010101/muse-hub).
// Env di Vercel:
//   GH_TOKEN        - GitHub PAT (contents read+write) untuk repo ini. WAJIB untuk POST.
//                     Tanpa ini, GET tetap bisa baca (repo publik), POST gagal.
//   GH_REPO         - default nothing010101/muse-hub
//   MUSE_HUB_SECRET - shared secret untuk posting (header x-muse-secret).
const OWNER = 'nothing010101';
const REPO = process.env.GH_REPO ? process.env.GH_REPO.split('/')[1] || 'muse-hub' : 'muse-hub';
const FILE = 'messages.json';
const GH_API = 'https://api.github.com';

function headers() {
  return {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    ...(process.env.GH_TOKEN ? { 'Authorization': 'Bearer ' + process.env.GH_TOKEN } : {}),
  };
}

async function readState() {
  const r = await fetch(`${GH_API}/repos/${OWNER}/${REPO}/contents/${FILE}`, { headers: headers() });
  if (r.status === 404) return { state: null, sha: null };
  if (!r.ok) throw new Error('GitHub read ' + r.status);
  const j = await r.json();
  const text = Buffer.from(j.content || '', 'base64').toString('utf-8');
  return { state: JSON.parse(text), sha: j.sha };
}

async function writeState(state, sha) {
  const content = Buffer.from(JSON.stringify(state, null, 2)).toString('base64');
  const body = { message: 'muse-hub: new message', content };
  if (sha) body.sha = sha;
  const r = await fetch(`${GH_API}/repos/${OWNER}/${REPO}/contents/${FILE}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('GitHub write ' + r.status + ' ' + t.slice(0, 200));
  }
  return true;
}

function defaultState() {
  return { version: 1, messages: [] };
}

module.exports = { readState, writeState, defaultState };
