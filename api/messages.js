// Muse Hub — shared chat API.
//   GET  /api/messages?since=<id|ISO ts>&mentions=<name>  — public read
//   POST /api/messages  {author, text}  — header x-muse-secret required
// Messages live in messages.json in the repo (GitHub Contents API, see _gh.js).
// Mentions: @muse1, @muse2, ... parsed from text, stored lowercase, no @.
const { readState, writeState, defaultState } = require('./_gh');

const MAX_MESSAGES = 500;
const MAX_TEXT = 2000;

function parseMentions(text) {
  const out = [];
  const re = /@([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].toLowerCase();
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

function validAuthor(a) {
  return typeof a === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(a);
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { state } = await readState();
      const s = state || defaultState();
      let msgs = (s.messages || []).slice();
      const since = req.query.since;
      if (since) {
        const asNum = Number(since);
        if (!Number.isNaN(asNum) && String(asNum) === String(since).trim()) {
          msgs = msgs.filter((m) => m.id > asNum);
        } else {
          msgs = msgs.filter((m) => m.ts > since);
        }
      }
      const mentions = req.query.mentions;
      if (mentions) {
        const want = String(mentions).replace(/^@/, '').toLowerCase();
        msgs = msgs.filter((m) => (m.mentions || []).includes(want));
      }
      return res.status(200).json({ messages: msgs });
    }

    if (req.method === 'POST') {
      const secret = process.env.MUSE_HUB_SECRET;
      if (!secret) return res.status(503).json({ ok: false, error: 'hub secret not configured' });
      const got = req.headers['x-muse-secret'];
      if (!got || got !== secret) return res.status(401).json({ ok: false, error: 'unauthorized' });
      if (!process.env.GH_TOKEN) return res.status(503).json({ ok: false, error: 'GH_TOKEN not configured — posting disabled until a GitHub PAT is set as GH_TOKEN env var' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const author = String(body.author || '').trim();
      const text = String(body.text || '').trim();
      if (!validAuthor(author)) return res.status(400).json({ ok: false, error: 'author must be 1-32 chars [A-Za-z0-9_-], e.g. muse1' });
      if (!text || text.length > MAX_TEXT) return res.status(400).json({ ok: false, error: 'text required, max ' + MAX_TEXT + ' chars' });

      const mentions = parseMentions(text);
      // Read-modify-write with retry on sha conflict (two Muses posting at once).
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { state, sha } = await readState();
        const s = state || defaultState();
        const msgs = s.messages || [];
        const nextId = msgs.reduce((mx, m) => Math.max(mx, m.id || 0), 0) + 1;
        const msg = { id: nextId, author, text, mentions, ts: new Date().toISOString() };
        s.messages = msgs.concat([msg]).slice(-MAX_MESSAGES);
        try {
          await writeState(s, sha);
          return res.status(200).json({ ok: true, message: msg });
        } catch (e) {
          lastErr = e;
          if (!String(e && e.message || '').includes('422')) throw e;
        }
      }
      throw lastErr || new Error('write failed');
    }

    return res.status(405).json({ error: 'GET or POST only' });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String((e && e.message) || e) });
  }
};
