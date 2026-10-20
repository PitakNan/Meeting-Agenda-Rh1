# ระบบวาระการประชุม เขตสุขภาพที่ 1

เว็บสำหรับ **สร้าง / นำเข้า / เผยแพร่ระเบียบวาระการประชุม** แทนการพิมพ์ HTML เองใน TinyMCE
ของ `webnew.rh1.go.th`

- 🌐 หน้าเว็บ: https://pitaknan.github.io/Meeting-Agenda-Rh1/
- ⚙️ API: https://meeting-agenda-rh1.pitaknan.workers.dev

---

## สถาปัตยกรรม

| ชั้น | ที่อยู่ | หมายเหตุ |
|---|---|---|
| หน้าเว็บ (SPA ไฟล์เดียว) | `index.html` → GitHub Pages | hash routing: `#/`, `#/m/<id>`, `#/edit/<id>` |
| API + ฐานข้อมูล | `worker/` → Cloudflare Worker + Durable Object (SQLite) | ชื่อ DO instance = `main` |
| ไฟล์แนบ PDF | คลังไฟล์ของ `webnew.rh1.go.th` (ResponsiveFilemanager) | โฟลเดอร์ `cfo/agenda-<id>/` |
| หน้าเผยแพร่จริง | **ข่าวบน webnew** (หมวด `topicID=27` ประชุม) | เว็บนี้เป็นตัวสร้าง + คลังย้อนหลัง |

**ทำไมไฟล์ PDF ไม่อยู่ R2:** token Cloudflare ของบัญชีนี้ไม่มีสิทธิ์ `r2`
และคลังไฟล์ webnew ให้ URL สาธารณะถาวรอยู่แล้ว ลิงก์วาระเก่า–ใหม่จึงอยู่บ้านเดียวกัน
ถ้าจะย้ายไป R2 ภายหลัง แก้เฉพาะคลาส `WebnewFiles` ใน `worker/src/index.js`

---

## การนำเข้าวาระ 4 แบบ

1. **กรอกเอง** — เพิ่ม/ลบ/เลื่อนลำดับวาระและข้อย่อย ลาก PDF วางทีละข้อ
2. **วางข้อความทั้งก้อน** — `parseAgendaText()` จับ `ระเบียบวาระที่ N` และข้อย่อย `4.1` / `4.1.1`
   พร้อมเดาส่วนหัว (วันที่/เวลา/สถานที่/Zoom)
3. **อัปโหลด Word / PDF** — `.docx` อ่านจาก `word/document.xml` (สะอาด) · `.pdf` ใช้ pdf.js
4. **ลากโฟลเดอร์ PDF ทั้งชุด** — จับคู่เลขข้อที่อยู่ในชื่อไฟล์ เช่น `4.1_xxx.pdf` → ข้อ 4.1

ทุกแบบมาจบที่ตารางวาระเดียวกันให้ตรวจก่อนบันทึก

---

## ⚠️ กับดักที่เจอมาแล้ว (อย่าพลาดซ้ำ)

- **คุกกี้ filemanager ต้องสะสม ไม่ใช่ทับ** — `dialog.php` ครั้งแรกให้ `PHPSESSID`
  ครั้งต่อมาให้แค่ `last_position` ถ้าเขียนทับทั้งก้อน `PHPSESSID` จะหาย
  แล้ว `upload.php` ตอบ `forbiden` เงียบ ๆ (HTTP 200)
- **ชื่อไฟล์** — ระบบ webnew บังคับ lower-case และแทนอักขระพิเศษด้วย `_`
  ต้องใช้ **ชื่อที่เซิร์ฟเวอร์ตอบกลับมา** เป็นชื่อจริง ห้ามเดาเอง
- **ชื่อโฟลเดอร์ต้องเป็น ASCII** (`agenda-<id>`) ถ้าใช้ภาษาไทยจะถูก transliterate แล้วเดา path ไม่ถูก
- **ภาษาไทยผ่าน argument ของ shell จะหาย** (console cp874) — ถ้าทดสอบด้วย curl
  ต้องส่งผ่านไฟล์ `--data-urlencode "field@file.txt"`
- **อักขระ PUA ในซอร์ส** — ตาราง `PUA` ต้องประกาศด้วย code point (`0xF701`) และ regex
  ใช้ `-` เสมอ อักขระจริงหายระหว่างแก้ไฟล์ผ่านเครื่องมือได้
- **ข้อความไทยจาก PDF เพี้ยนได้** — ฟอนต์ราชการเก็บสระ/วรรณยุกต์ไว้ใน Private Use Area
  ระบบ map กลับให้เท่าที่รู้จัก แต่ต้องตรวจทานทุกครั้ง มี `.docx` ให้ใช้ `.docx`

---

## endpoint ของ webnew ที่ใช้ (เรียกได้โดยไม่ต้องล็อกอิน)

| งาน | endpoint |
|---|---|
| รายการข่าวทั้งหมด | `POST /ajaxnews_P.php` (DataTables server-side) |
| สร้างข่าวใหม่ | `POST /module.php?module_name=crud_news_edit_2&file=addaction.php` |
| แก้ข่าวเดิม | `POST …&file=updateaction.php&newsID=<id>` |
| เนื้อหาข่าวจริง | `GET /view_User_2.php?newsID=<id>` (หน้า `/news/<id>` เป็นแค่เปลือก) |
| คลังไฟล์ | `dialog.php` → `execute.php?action=create_folder` → `upload.php` |

ฟิลด์ข่าว: `newsName`, `topicID` (27 = ประชุม), `newsDetail` (HTML), `newslink`
⚠️ ต้องส่งครบทุกฟิลด์ทุกครั้ง ฟิลด์ที่ไม่ส่งจะถูกล้างเป็นค่าว่าง

---

## การดูแลระบบ

```bash
# deploy API
cd worker && wrangler deploy

# เปลี่ยนรหัสผ่านผู้ดูแล
printf 'รหัสใหม่' | wrangler secret put ADMIN_KEY
```

รหัสผ่านเก็บเป็น Worker secret ชื่อ `ADMIN_KEY` — ฝั่งเว็บเก็บไว้ใน `localStorage` คีย์ `ma_key`

---

## 🚨 เหตุการณ์ 20 ต.ค. 2569 — ลบข่าว news/431 โดยไม่ตั้งใจ

ระหว่างสำรวจว่า webnew มี endpoint อะไรบ้าง มีการยิง **GET** ไปที่
`module.php?module_name=crud_news_edit_2&file=deleteaction.php&newsID=999999`
และ `…&file=del.php&newsID=999999` เพื่อดูว่ามีไฟล์นั้นจริงไหม
ผลคือ **ข่าว newsID 431 (วาระ CFO ครั้งที่ 1/2570) ถูกลบจริง** ทั้งที่ส่ง newsID คนละตัว
(จำนวนข่าว 323 → 322) — `delete.php` ต้องล็อกอิน แต่ตัว action ไม่ตรวจ

**กู้คืนแล้ว** เป็น https://webnew.rh1.go.th/news/433 ครบ 29 ย่อหน้า 14 ลิงก์
เพราะเนื้อหาถูกดึงเข้าระบบนี้ไว้ก่อนหน้าพอดี

สิ่งที่กู้กลับไม่ได้: **URL เดิม `/news/431` ตายถาวร** · วันที่ข่าวกลายเป็น 20 ต.ค. (เดิม 19 ต.ค.) ·
`newsID 432` ถูกกินไปเปล่า ๆ

### กฎที่ต้องถือตั้งแต่นี้
- **ห้ามยิง endpoint ที่ไม่รู้ความหมายบนระบบจริง** แม้เป็น GET และแม้ใส่ ID ปลอม
  ถ้าชื่อไฟล์มีคำว่า `delete` / `action` / `update` ให้ถือว่าเขียนข้อมูลไว้ก่อน
- ตรวจว่ามี endpoint อยู่จริงให้ดูจาก **ฟอร์มในหน้า `add.php` / `edit.php`** เท่านั้น
- ก่อนแตะอะไรที่เขียนได้ **สำรองเนื้อหาลงไฟล์ก่อน** (`view_User_2.php?newsID=<id>`)
