/**
 * Meeting Agenda Rh1 — API Worker
 * ระบบจัดเก็บ/เผยแพร่ระเบียบวาระการประชุม เขตสุขภาพที่ 1
 *
 * - ข้อมูลวาระ  : Durable Object + SQLite (AgendaStore)
 * - ไฟล์แนบ PDF : ฝากคลังไฟล์ของ webnew.rh1.go.th (ResponsiveFilemanager)
 * - ส่งขึ้น webnew : crud_news_edit_2 addaction.php / updateaction.php
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function cors(req) {
  return {
    'access-control-allow-origin': req.headers.get('origin') || '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-admin-key',
    'access-control-max-age': '86400',
  };
}

function json(req, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...cors(req) },
  });
}

/* ───────────────────────── Durable Object ───────────────────────── */

export class AgendaStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meetings (
        id          TEXT PRIMARY KEY,
        slug        TEXT,
        title       TEXT,
        news_name   TEXT,
        org         TEXT,
        meeting_no  TEXT,
        date_text   TEXT,
        time_text   TEXT,
        place       TEXT,
        zoom        TEXT,
        agenda_pdf  TEXT,
        items       TEXT,
        news_id     TEXT,
        status      TEXT,
        created_at  TEXT,
        updated_at  TEXT
      )
    `);
    // ตารางเดิมที่สร้างก่อนมีฟิลด์นี้ ต้องเติมเอง (CREATE TABLE IF NOT EXISTS ไม่เติมให้)
    try { this.sql.exec('ALTER TABLE meetings ADD COLUMN news_name TEXT'); } catch (e) { /* มีแล้ว */ }
    try { this.sql.exec('ALTER TABLE meetings ADD COLUMN attachments TEXT'); } catch (e) { /* มีแล้ว */ }
  }

  rowToMeeting(r) {
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      newsName: r.news_name,
      org: r.org,
      meetingNo: r.meeting_no,
      dateText: r.date_text,
      timeText: r.time_text,
      place: r.place,
      zoom: r.zoom,
      agendaPdf: r.agenda_pdf ? JSON.parse(r.agenda_pdf) : null,
      items: r.items ? JSON.parse(r.items) : [],
      attachments: r.attachments ? JSON.parse(r.attachments) : [],
      newsId: r.news_id,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  list() {
    const rows = [...this.sql.exec('SELECT * FROM meetings ORDER BY created_at DESC')];
    return rows.map((r) => {
      const m = this.rowToMeeting(r);
      const flat = m.items.flatMap((i) => [i, ...(i.children || [])]);
      return {
        id: m.id,
        slug: m.slug,
        title: m.title,
        meetingNo: m.meetingNo,
        dateText: m.dateText,
        status: m.status,
        newsId: m.newsId,
        itemCount: m.items.length,
        fileCount: flat.filter((i) => i.url).length,
        updatedAt: m.updatedAt,
      };
    });
  }

  get(id) {
    const rows = [...this.sql.exec('SELECT * FROM meetings WHERE id = ?', id)];
    return rows.length ? this.rowToMeeting(rows[0]) : null;
  }

  put(id, body) {
    const now = new Date().toISOString();
    const prev = this.get(id);
    const m = {
      slug: body.slug ?? prev?.slug ?? id,
      title: body.title ?? prev?.title ?? '',
      newsName: body.newsName ?? prev?.newsName ?? '',
      org: body.org ?? prev?.org ?? '',
      meetingNo: body.meetingNo ?? prev?.meetingNo ?? '',
      dateText: body.dateText ?? prev?.dateText ?? '',
      timeText: body.timeText ?? prev?.timeText ?? '',
      place: body.place ?? prev?.place ?? '',
      zoom: body.zoom ?? prev?.zoom ?? '',
      agendaPdf: body.agendaPdf !== undefined ? body.agendaPdf : prev?.agendaPdf ?? null,
      items: body.items ?? prev?.items ?? [],
      attachments: body.attachments ?? prev?.attachments ?? [],
      newsId: body.newsId !== undefined ? body.newsId : prev?.newsId ?? null,
      status: body.status ?? prev?.status ?? 'draft',
    };
    this.sql.exec(
      `INSERT INTO meetings (id,slug,title,news_name,org,meeting_no,date_text,time_text,place,zoom,agenda_pdf,items,attachments,news_id,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         slug=excluded.slug, title=excluded.title, news_name=excluded.news_name, org=excluded.org,
         meeting_no=excluded.meeting_no, date_text=excluded.date_text,
         time_text=excluded.time_text, place=excluded.place, zoom=excluded.zoom,
         agenda_pdf=excluded.agenda_pdf, items=excluded.items,
         attachments=excluded.attachments,
         news_id=excluded.news_id, status=excluded.status, updated_at=excluded.updated_at`,
      id, m.slug, m.title, m.newsName, m.org, m.meetingNo, m.dateText, m.timeText, m.place, m.zoom,
      m.agendaPdf ? JSON.stringify(m.agendaPdf) : null,
      JSON.stringify(m.items), JSON.stringify(m.attachments), m.newsId, m.status,
      prev?.createdAt ?? now, now
    );
    return this.get(id);
  }

  del(id) {
    this.sql.exec('DELETE FROM meetings WHERE id = ?', id);
    return { ok: true };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get('op');
    const id = url.searchParams.get('id');
    try {
      if (op === 'list') return Response.json(this.list());
      if (op === 'get') return Response.json(this.get(id));
      if (op === 'put') return Response.json(this.put(id, await request.json()));
      if (op === 'del') return Response.json(this.del(id));
      return new Response('bad op', { status: 400 });
    } catch (e) {
      return new Response(String(e && e.stack || e), { status: 500 });
    }
  }
}

/* ───────────────────── คลังไฟล์ webnew (filemanager) ───────────────────── */

class WebnewFiles {
  constructor(env) {
    this.base = env.WEBNEW_BASE;
    this.akey = env.WEBNEW_AKEY;
    this.root = env.WEBNEW_ROOT;
    this.jar = new Map();
  }

  get cookie() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** เก็บคุกกี้แบบ "สะสม" — ถ้าทับทั้งก้อนจะทำ PHPSESSID หายตั้งแต่คำสั่งที่สอง */
  absorb(res) {
    const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const pair = c.split(';')[0];
      const i = pair.indexOf('=');
      if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }

  /** เปิด session ของ filemanager ที่โฟลเดอร์ fldr (ต้องทำก่อนทุกคำสั่ง) */
  async openDialog(fldr) {
    const u = `${this.base}/filemanager/dialog.php?type=2&akey=${encodeURIComponent(this.akey)}&fldr=${encodeURIComponent(fldr)}`;
    const res = await fetch(u, { headers: this.cookie ? { cookie: this.cookie } : {} });
    this.absorb(res);
    await res.arrayBuffer();
    return res.status;
  }

  async createFolder(name) {
    await this.openDialog(`${this.root}/`);
    const body = new URLSearchParams({ path: `${this.root}/`, name });
    const res = await fetch(`${this.base}/filemanager/execute.php?action=create_folder`, {
      method: 'POST',
      headers: {
        cookie: this.cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    this.absorb(res);
    await res.arrayBuffer();
    return res.status;
  }

  /**
   * อัปโหลดไฟล์เข้าโฟลเดอร์ย่อยใต้ root
   * คืนชื่อไฟล์จริงที่เซิร์ฟเวอร์ตั้งให้ (ระบบบังคับ lower-case + แทนอักขระด้วย _)
   */
  async upload(folder, filename, blob) {
    const fldr = `${this.root}/${folder}/`;
    await this.openDialog(fldr);
    const fd = new FormData();
    fd.append('path', `../file_1/source/${fldr}`);
    fd.append('path_thumb', `../file_1/thumbs/${fldr}`);
    fd.append('fldr', fldr);
    fd.append('type', '2');
    fd.append('file', blob, filename);
    const res = await fetch(`${this.base}/filemanager/upload.php`, {
      method: 'POST',
      headers: { cookie: this.cookie },
      body: fd,
    });
    const text = (await res.text()).trim();
    if (!res.ok) throw new Error(`upload failed ${res.status}: ${text.slice(0, 200)}`);
    this.lastRaw = text;
    this.lastCookie = this.cookie;
    const stored = text.split('\n').pop().trim() || filename;
    return {
      name: stored,
      url: `${this.base}/file_1/source/${fldr}${encodeURIComponent(stored)}`,
    };
  }
}

/* ───────────────────── สร้าง HTML วาระ (รูปแบบ webnew) ───────────────────── */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INDENT = '&nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;';

export function renderAgendaHtml(m) {
  const out = [];
  const center = (html) => out.push(`<p style="text-align: center;"><strong>${html}</strong></p>`);
  const headLines = [
    m.title,
    m.dateText && m.timeText ? `${m.dateText} เวลา ${m.timeText}` : m.dateText || m.timeText,
    m.place,
    m.zoom,
  ].filter(Boolean);
  headLines.forEach((l) => center(esc(l)));
  center('*********************************************');
  if (m.agendaPdf && m.agendaPdf.url) {
    out.push(
      `<p style="text-align: center;"><a href="${esc(m.agendaPdf.url)}" target="_blank">ดาวน์โหลดระเบียบวาระการประชุม (PDF)</a></p>`
    );
  }
  out.push('<p style="text-align: center;">&nbsp;</p>');

  for (const item of m.items || []) {
    out.push(`<p><strong>ระเบียบวาระที่ </strong><strong>${esc(item.no)} ${esc(item.title)}</strong></p>`);
    for (const c of item.children || []) {
      const label = esc(c.title || '');
      const body = c.url
        ? `<a href="${esc(c.url)}" target="_blank">${label}</a>`
        : label;
      out.push(`<p>${INDENT}${esc(c.no)} ${body}</p>`);
    }
  }
  if ((m.attachments || []).length) {
    out.push(`<p><strong>เอกสารประกอบ : หนังสือเชิญประชุม</strong></p>`);
    for (const a of m.attachments) {
      out.push(`<p>${INDENT}<a href="${esc(a.url)}" target="_blank">${esc(a.title)}</a></p>`);
    }
  }
  return out.join('\n');
}

/* ───────────────────── ส่งขึ้น webnew (ข่าว/วาระ) ───────────────────── */

async function pushToWebnew(env, m) {
  const base = env.WEBNEW_BASE;
  const detail = renderAgendaHtml(m);
  const fd = new URLSearchParams();
  fd.set('newsName', m.newsName || m.title);
  fd.set('topicID', '27'); // 27 = ประชุม
  fd.set('newsDetail', detail);
  fd.set('newslink', '');
  fd.set('submit', 'submit');

  const file = m.newsId ? 'updateaction.php' : 'addaction.php';
  const qs = m.newsId ? `&newsID=${encodeURIComponent(m.newsId)}` : '';
  const url = `${base}/module.php?module_name=crud_news_edit_2&file=${file}${qs}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: fd,
    redirect: 'manual',
  });
  await res.arrayBuffer();

  let newsId = m.newsId;
  if (!newsId) {
    // ของใหม่: หา newsID ล่าสุดที่ชื่อตรงกัน จากตารางข่าว
    newsId = await findNewsIdByName(base, m.newsName || m.title);
  }
  return { ok: res.status < 400, status: res.status, newsId };
}

async function findNewsIdByName(base, title) {
  const body = new URLSearchParams({
    draw: '1', start: '0', length: '10',
    'order[0][column]': '1', 'order[0][dir]': 'desc',
  });
  const res = await fetch(`${base}/ajaxnews_P.php`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.data) return null;
  const strip = (s) => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const hit = data.data.find((r) => strip(r.newsName) === title.trim());
  return hit ? hit.newsID : null;
}

/* ───────────────────────────── Worker ───────────────────────────── */

function stub(env) {
  return env.AGENDA.get(env.AGENDA.idFromName('main'));
}

async function doCall(env, op, id, body) {
  const u = new URL('https://do/');
  u.searchParams.set('op', op);
  if (id) u.searchParams.set('id', id);
  const res = await stub(env).fetch(u, {
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function authed(req, env) {
  const key = req.headers.get('x-admin-key') || '';
  return env.ADMIN_KEY && key === env.ADMIN_KEY;
}

const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(request) });
    }

    try {
      /* --- ตรวจรหัสผ่านผู้ดูแล --- */
      if (path === '/api/login' && request.method === 'POST') {
        const { key } = await request.json().catch(() => ({}));
        return json(request, { ok: !!env.ADMIN_KEY && key === env.ADMIN_KEY });
      }

      /* --- รายการประชุมทั้งหมด --- */
      if (path === '/api/meetings' && request.method === 'GET') {
        return json(request, await doCall(env, 'list'));
      }

      /* --- สร้างใหม่ --- */
      if (path === '/api/meetings' && request.method === 'POST') {
        if (!authed(request, env)) return json(request, { error: 'unauthorized' }, 401);
        const body = await request.json();
        const id = newId();
        const m = await doCall(env, 'put', id, { ...body, slug: `agenda-${id}` });
        return json(request, m);
      }

      const mMatch = path.match(/^\/api\/meetings\/([A-Za-z0-9_-]+)(\/(files|push|html))?$/);
      if (mMatch) {
        const id = mMatch[1];
        const sub = mMatch[3];

        if (!sub && request.method === 'GET') {
          const m = await doCall(env, 'get', id);
          return m ? json(request, m) : json(request, { error: 'not found' }, 404);
        }
        if (!sub && request.method === 'PUT') {
          if (!authed(request, env)) return json(request, { error: 'unauthorized' }, 401);
          return json(request, await doCall(env, 'put', id, await request.json()));
        }
        if (!sub && request.method === 'DELETE') {
          if (!authed(request, env)) return json(request, { error: 'unauthorized' }, 401);
          return json(request, await doCall(env, 'del', id));
        }

        /* --- HTML สำหรับวางใน webnew --- */
        if (sub === 'html' && request.method === 'GET') {
          const m = await doCall(env, 'get', id);
          if (!m) return json(request, { error: 'not found' }, 404);
          return json(request, { html: renderAgendaHtml(m) });
        }

        /* --- อัปโหลดไฟล์แนบ --- */
        if (sub === 'files' && request.method === 'POST') {
          if (!authed(request, env)) return json(request, { error: 'unauthorized' }, 401);
          const m = await doCall(env, 'get', id);
          if (!m) return json(request, { error: 'not found' }, 404);
          const form = await request.formData();
          const file = form.get('file');
          if (!file) return json(request, { error: 'no file' }, 400);
          const prefix = (form.get('prefix') || '').toString().replace(/[^0-9.]/g, '');
          const fm = new WebnewFiles(env);
          await fm.createFolder(m.slug);
          const name = prefix ? `${prefix}_${file.name}` : file.name;
          const saved = await fm.upload(m.slug, name, file);
          if (url.searchParams.get('debug')) {
            return json(request, { ...saved, raw: fm.lastRaw, cookie: fm.lastCookie, sent: name });
          }
          return json(request, saved);
        }

        /* --- ส่งขึ้น webnew --- */
        if (sub === 'push' && request.method === 'POST') {
          if (!authed(request, env)) return json(request, { error: 'unauthorized' }, 401);
          const m = await doCall(env, 'get', id);
          if (!m) return json(request, { error: 'not found' }, 404);
          const r = await pushToWebnew(env, m);
          if (r.newsId && r.newsId !== m.newsId) {
            await doCall(env, 'put', id, { newsId: r.newsId });
          }
          return json(request, {
            ...r,
            newsUrl: r.newsId ? `${env.WEBNEW_BASE}/news/${r.newsId}` : null,
          });
        }
      }

      /* --- ตารางข่าวของ webnew (ไว้ผูกวาระเดิม) --- */
      if (path === '/api/webnew/news' && request.method === 'GET') {
        const length = url.searchParams.get('length') || '25';
        const search = url.searchParams.get('search') || '';
        const body = new URLSearchParams({
          draw: '1', start: '0', length,
          'order[0][column]': '1', 'order[0][dir]': 'desc',
          'search[value]': search,
        });
        const res = await fetch(`${env.WEBNEW_BASE}/ajaxnews_P.php`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body,
        });
        return json(request, await res.json());
      }

      /* --- ดึงเนื้อหาวาระเดิมจาก webnew มาเป็นร่าง --- */
      if (path === '/api/webnew/import' && request.method === 'GET') {
        const nid = url.searchParams.get('newsID');
        const res = await fetch(`${env.WEBNEW_BASE}/view_User_2.php?newsID=${encodeURIComponent(nid)}`);
        return json(request, { html: await res.text() });
      }

      return json(request, { error: 'not found', path }, 404);
    } catch (e) {
      return json(request, { error: String(e && e.message || e) }, 500);
    }
  },
};
