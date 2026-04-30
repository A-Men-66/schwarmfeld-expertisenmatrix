require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3006;

// ─── Mail ──────────────────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  }
});

async function sendMail(to, subject, html) {
  if (!to || !process.env.BREVO_SMTP_PASS) return;
  try {
    await mailer.sendMail({
      from: `SchwarmFeld SD <${process.env.MAIL_FROM || process.env.BREVO_SMTP_USER}>`,
      to, subject, html
    });
  } catch (err) {
    console.warn('Mail nicht gesendet:', err.message);
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET Umgebungsvariable ist nicht gesetzt');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DB Init ───────────────────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'mitglied',
      anzeigename VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS skills (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      kategorie VARCHAR(50) DEFAULT 'Allgemein'
    );

    CREATE TABLE IF NOT EXISTS mitglieder (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name VARCHAR(255) NOT NULL,
      beschreibung TEXT,
      kontakt_email VARCHAR(255),
      ort VARCHAR(255),
      zeitliches_budget VARCHAR(100),
      lerninteressen TEXT,
      aktiv BOOLEAN DEFAULT false,
      bereit_zur_pruefung BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mitglied_skills (
      mitglied_id INTEGER REFERENCES mitglieder(id) ON DELETE CASCADE,
      skill_id INTEGER REFERENCES skills(id) ON DELETE CASCADE,
      niveau SMALLINT DEFAULT 1 CHECK (niveau >= 0 AND niveau <= 3),
      PRIMARY KEY (mitglied_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      app_name VARCHAR(255) DEFAULT 'SchwarmFeld · System Delta',
      app_subtitle VARCHAR(500) DEFAULT 'Expertise-Matrix & Vernetzung',
      kontakt_email VARCHAR(255) DEFAULT '',
      uber_uns TEXT DEFAULT '',
      CHECK (id = 1)
    );

    INSERT INTO config (id) VALUES (1) ON CONFLICT DO NOTHING;
  `);

  // Migrations
  await pool.query(`ALTER TABLE skills ADD COLUMN IF NOT EXISTS kategorie VARCHAR(50) DEFAULT 'Allgemein'`);
  await pool.query(`ALTER TABLE mitglieder ADD COLUMN IF NOT EXISTS urls TEXT DEFAULT '[]'`);

  // Admin-Account anlegen falls nicht vorhanden
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPw = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPw) {
    console.warn('ADMIN_EMAIL oder ADMIN_PASSWORD nicht gesetzt – kein Admin-Account angelegt');
  } else {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPw, 10);
      await pool.query(
        'INSERT INTO users (email, password_hash, role, anzeigename) VALUES ($1, $2, $3, $4)',
        [adminEmail, hash, 'admin', 'Admin']
      );
      console.log(`Admin-Account angelegt: ${adminEmail}`);
    }
  }

  // SD-spezifische Skills anlegen
  const skillCount = await pool.query('SELECT COUNT(*) FROM skills');
  if (parseInt(skillCount.rows[0].count) === 0) {
    const sdSkills = [
      { name: 'Ungleichheit & Verteilung', kategorie: 'Säule' },
      { name: 'Wellbeing Economy', kategorie: 'Säule' },
      { name: 'Komplementärwährungen / LETS / Zeitbanken', kategorie: 'Säule' },
      { name: 'Geldsystemkritik / Plurakonomie', kategorie: 'Säule' },
      { name: 'Wirtschaftssubstitution', kategorie: 'Säule' },
      { name: 'Vertrauen als Konzept', kategorie: 'Säule' },
      { name: 'Schwarmorganisation / Gemeinschaftsbildung', kategorie: 'Säule' },
      { name: 'Gerechte Transformation', kategorie: 'Säule' },
      { name: 'Gemeinwohl & Gemeinwohl-Ökonomie', kategorie: 'Säule' },
      { name: 'Inhalte recherchieren', kategorie: 'Methode' },
      { name: 'Storytelling', kategorie: 'Methode' },
      { name: 'Fakten-Check', kategorie: 'Methode' },
      { name: 'Texte konzipieren', kategorie: 'Methode' },
      { name: 'Visualisierung', kategorie: 'Methode' },
      { name: 'Lektorat / Redigieren', kategorie: 'Methode' },
      { name: 'Grafikdesign', kategorie: 'Methode' },
      { name: 'Videoscripting', kategorie: 'Methode' },
      { name: 'Videoschnitt', kategorie: 'Methode' },
      { name: 'Fotografie', kategorie: 'Methode' },
      { name: 'Bildbearbeitung', kategorie: 'Methode' },
      { name: 'Datenanalyse', kategorie: 'Methode' },
      { name: 'Interviewführung', kategorie: 'Methode' },
      { name: 'Kampagnenplanung', kategorie: 'Methode' },
      { name: 'Zielgruppenanalyse', kategorie: 'Methode' },
      { name: 'Community Management', kategorie: 'Methode' },
      { name: 'Projektmanagement', kategorie: 'Methode' },
      { name: 'Prozessbegleitung / Facilitation', kategorie: 'Methode' },
      { name: 'Konzeptentwicklung / Begriffsarbeit', kategorie: 'Methode' },
      { name: 'Dialogformate gestalten', kategorie: 'Methode' },
      { name: 'Tool- / App-Entwicklung', kategorie: 'Methode' },
      { name: 'CMS / Hugo / WordPress', kategorie: 'Plattform' },
      { name: 'SEO', kategorie: 'Plattform' },
      { name: 'Mastodon', kategorie: 'Plattform' },
      { name: 'Bluesky', kategorie: 'Plattform' },
      { name: 'TikTok', kategorie: 'Plattform' },
      { name: 'Instagram', kategorie: 'Plattform' },
      { name: 'YouTube', kategorie: 'Plattform' },
      { name: 'LinkedIn', kategorie: 'Plattform' },
      { name: 'PeerTube', kategorie: 'Plattform' },
      { name: 'Email-Verteiler / Newsletter', kategorie: 'Plattform' },
    ];
    for (const s of sdSkills) {
      await pool.query(
        'INSERT INTO skills (name, kategorie) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [s.name, s.kategorie]
      );
    }
    console.log('SD-Skills angelegt.');
  }

  console.log('SchwarmFeld SD v1.0 läuft auf Port', PORT);
}

// ─── Auth Middleware ────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Nicht angemeldet' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig' });
  }
}

function adminRequired(req, res, next) {
  authRequired(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Kein Admin' });
    next();
  });
}

// ─── Auth Routes ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  const user = result.rows[0];
  if (!user) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'E-Mail oder Passwort falsch' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, anzeigename: user.anzeigename },
    JWT_SECRET, { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, anzeigename: user.anzeigename } });
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  const result = await pool.query('SELECT id, email, role, anzeigename FROM users WHERE id = $1', [req.user.id]);
  res.json(result.rows[0]);
});

app.post('/api/auth/registrieren', async (req, res) => {
  const { email, password, anzeigename } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  if (password.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const cleanEmail = email.toLowerCase().trim();
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, anzeigename) VALUES ($1, $2, $3, $4) RETURNING id, email',
      [cleanEmail, hash, 'mitglied', anzeigename || null]
    );
    const userId = result.rows[0].id;
    await pool.query(
      'INSERT INTO mitglieder (user_id, name, kontakt_email) VALUES ($1, $2, $3)',
      [userId, anzeigename || '', cleanEmail]
    );
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendMail(
        adminEmail,
        'SchwarmFeld SD: Neue Registrierung',
        `<p>Neue Selbstregistrierung: <strong>${anzeigename || cleanEmail}</strong> (${cleanEmail})</p>
         <p>Das Profil muss noch ausgefüllt und im Admin-Bereich freigeschaltet werden.</p>`
      );
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-Mail bereits vergeben' });
    throw e;
  }
});

app.post('/api/auth/passwort-aendern', authRequired, async (req, res) => {
  const { altes_passwort, neues_passwort } = req.body;
  if (!altes_passwort || !neues_passwort) return res.status(400).json({ error: 'Beide Passwörter erforderlich' });
  if (neues_passwort.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  const ok = await bcrypt.compare(altes_passwort, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  const hash = await bcrypt.hash(neues_passwort, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ ok: true });
});

// ─── Config ────────────────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  const result = await pool.query('SELECT app_name, app_subtitle, kontakt_email, uber_uns FROM config WHERE id = 1');
  res.json(result.rows[0]);
});

app.put('/api/admin/config', adminRequired, async (req, res) => {
  const { app_name, app_subtitle, kontakt_email, uber_uns } = req.body;
  await pool.query(
    'UPDATE config SET app_name=$1, app_subtitle=$2, kontakt_email=$3, uber_uns=$4 WHERE id=1',
    [app_name || 'SchwarmFeld · System Delta', app_subtitle || '', kontakt_email || '', uber_uns || '']
  );
  res.json({ ok: true });
});

// ─── Skills ────────────────────────────────────────────────────────────────
app.get('/api/skills', authRequired, async (req, res) => {
  const result = await pool.query('SELECT * FROM skills ORDER BY kategorie, name');
  res.json(result.rows);
});

// ─── Mitglieder-API (nur für eingeloggte Nutzer) ───────────────────────────
app.get('/api/mitglieder/public', authRequired, async (req, res) => {
  const result = await pool.query(`
    SELECT m.*,
      COALESCE(
        json_agg(
          json_build_object('id', s.id, 'name', s.name, 'kategorie', s.kategorie, 'niveau', ms.niveau)
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS skills
    FROM mitglieder m
    LEFT JOIN mitglied_skills ms ON m.id = ms.mitglied_id
    LEFT JOIN skills s ON ms.skill_id = s.id
    WHERE m.aktiv = true
    GROUP BY m.id
    ORDER BY m.name
  `);
  res.json(result.rows);
});

// ─── Mitglied-Profil (eigenes) ─────────────────────────────────────────────
app.get('/api/mitglieder/meine', authRequired, async (req, res) => {
  const result = await pool.query(`
    SELECT m.*,
      COALESCE(
        json_agg(
          json_build_object('id', s.id, 'name', s.name, 'kategorie', s.kategorie, 'niveau', ms.niveau)
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS skills
    FROM mitglieder m
    LEFT JOIN mitglied_skills ms ON m.id = ms.mitglied_id
    LEFT JOIN skills s ON ms.skill_id = s.id
    WHERE m.user_id = $1
    GROUP BY m.id
  `, [req.user.id]);
  res.json(result.rows[0] || null);
});

app.put('/api/mitglieder/meine', authRequired, async (req, res) => {
  const { name, beschreibung, kontakt_email, ort, zeitliches_budget, lerninteressen, urls, skill_niveaus } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  let urlsJson = '[]';
  if (Array.isArray(urls)) {
    const clean = urls.filter(u => u && typeof u.url === 'string' && u.url.trim());
    urlsJson = JSON.stringify(clean.map(u => ({ label: (u.label || '').trim(), url: u.url.trim() })));
  }

  const existing = await pool.query('SELECT id FROM mitglieder WHERE user_id = $1', [req.user.id]);
  let mitglied_id;

  if (existing.rows.length === 0) {
    const ins = await pool.query(`
      INSERT INTO mitglieder (user_id, name, beschreibung, kontakt_email, ort, zeitliches_budget, lerninteressen, urls, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()) RETURNING id
    `, [req.user.id, name, beschreibung, kontakt_email, ort, zeitliches_budget, lerninteressen, urlsJson]);
    mitglied_id = ins.rows[0].id;
  } else {
    mitglied_id = existing.rows[0].id;
    await pool.query(`
      UPDATE mitglieder SET name=$1, beschreibung=$2, kontakt_email=$3, ort=$4,
        zeitliches_budget=$5, lerninteressen=$6, urls=$7, updated_at=NOW()
      WHERE id=$8
    `, [name, beschreibung, kontakt_email, ort, zeitliches_budget, lerninteressen, urlsJson, mitglied_id]);
  }

  // Anzeigename im User-Account synchronisieren
  await pool.query('UPDATE users SET anzeigename = $1 WHERE id = $2', [name, req.user.id]);

  // Skills mit Niveau neu setzen
  await pool.query('DELETE FROM mitglied_skills WHERE mitglied_id = $1', [mitglied_id]);
  if (skill_niveaus && typeof skill_niveaus === 'object') {
    for (const [skill_id, niveau] of Object.entries(skill_niveaus)) {
      if (parseInt(niveau) > 0) {
        await pool.query(
          'INSERT INTO mitglied_skills (mitglied_id, skill_id, niveau) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [mitglied_id, parseInt(skill_id), parseInt(niveau)]
        );
      }
    }
  }

  res.json({ ok: true, mitglied_id });
});

app.post('/api/mitglieder/meine/einreichen', authRequired, async (req, res) => {
  const m = await pool.query('SELECT * FROM mitglieder WHERE user_id = $1', [req.user.id]);
  if (m.rows.length === 0) return res.status(400).json({ error: 'Kein Profil vorhanden' });
  const mitglied = m.rows[0];
  const skillCount = await pool.query('SELECT COUNT(*) FROM mitglied_skills WHERE mitglied_id = $1', [mitglied.id]);
  const fehlend = [];
  if (!mitglied.beschreibung?.trim()) fehlend.push('Kurzbeschreibung');
  if (parseInt(skillCount.rows[0].count) === 0) fehlend.push('mindestens 1 Expertise');
  if (fehlend.length > 0) return res.status(400).json({ error: `Bitte noch ergänzen: ${fehlend.join(', ')}` });
  await pool.query('UPDATE mitglieder SET bereit_zur_pruefung = true WHERE id = $1', [mitglied.id]);

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendMail(
      adminEmail,
      'SchwarmFeld SD: Neues Profil zur Prüfung',
      `<p>Mitglied <strong>${mitglied.name}</strong> hat ihr Profil zur Prüfung eingereicht.</p>
       <p>Bitte im Admin-Bereich freischalten.</p>`
    );
  }
  res.json({ ok: true });
});

// ─── Notfall-Reset ─────────────────────────────────────────────────────────
app.post('/api/notfall-reset', async (req, res) => {
  const { secret, email, neues_passwort } = req.body;
  const resetSecret = process.env.RESET_SECRET;
  if (!resetSecret || secret !== resetSecret) return res.status(403).json({ error: 'Falsches Secret' });
  if (!neues_passwort || neues_passwort.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });
  const hash = await bcrypt.hash(neues_passwort, 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
    [hash, email.toLowerCase().trim()]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'E-Mail nicht gefunden' });
  res.json({ ok: true });
});

// ─── Admin Routes ──────────────────────────────────────────────────────────
app.get('/api/admin/users', adminRequired, async (req, res) => {
  const result = await pool.query('SELECT id, email, role, anzeigename, created_at FROM users ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/admin/users', adminRequired, async (req, res) => {
  const { email, password, anzeigename } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  if (password.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const cleanEmail = email.toLowerCase().trim();
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, anzeigename) VALUES ($1, $2, $3, $4) RETURNING id, email, role, anzeigename',
      [cleanEmail, hash, 'mitglied', anzeigename || null]
    );
    const userId = result.rows[0].id;
    await pool.query(
      'INSERT INTO mitglieder (user_id, name, kontakt_email) VALUES ($1, $2, $3)',
      [userId, anzeigename || '', cleanEmail]
    );
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-Mail bereits vergeben' });
    throw e;
  }
});

app.put('/api/admin/eigene-email', adminRequired, async (req, res) => {
  const { neue_email, passwort } = req.body;
  if (!neue_email) return res.status(400).json({ error: 'E-Mail erforderlich' });
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = result.rows[0];
  const ok = await bcrypt.compare(passwort || '', user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  const cleanEmail = neue_email.toLowerCase().trim();
  try {
    await pool.query('UPDATE users SET email = $1 WHERE id = $2', [cleanEmail, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-Mail bereits vergeben' });
    throw e;
  }
});

app.delete('/api/admin/users/:id', adminRequired, async (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Den eigenen Account kannst du nicht löschen' });
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/passwort', adminRequired, async (req, res) => {
  const { neues_passwort } = req.body;
  if (!neues_passwort || neues_passwort.length < 6) return res.status(400).json({ error: 'Passwort mindestens 6 Zeichen' });
  const hash = await bcrypt.hash(neues_passwort, 10);
  const result = await pool.query(
    'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
    [hash, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'User nicht gefunden' });
  res.json({ ok: true });
});

app.get('/api/admin/mitglieder', adminRequired, async (req, res) => {
  const result = await pool.query(`
    SELECT m.*, u.email AS user_email,
      COALESCE(
        json_agg(
          json_build_object('id', s.id, 'name', s.name, 'kategorie', s.kategorie, 'niveau', ms.niveau)
        ) FILTER (WHERE s.id IS NOT NULL),
        '[]'
      ) AS skills
    FROM mitglieder m
    LEFT JOIN users u ON m.user_id = u.id
    LEFT JOIN mitglied_skills ms ON m.id = ms.mitglied_id
    LEFT JOIN skills s ON ms.skill_id = s.id
    GROUP BY m.id, u.email
    ORDER BY m.created_at DESC
  `);
  res.json(result.rows);
});

app.put('/api/admin/mitglieder/:id/toggle-aktiv', adminRequired, async (req, res) => {
  const result = await pool.query(
    'UPDATE mitglieder SET aktiv = NOT aktiv, bereit_zur_pruefung = false WHERE id = $1 RETURNING aktiv',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ aktiv: result.rows[0].aktiv });
});

app.delete('/api/admin/mitglieder/:id', adminRequired, async (req, res) => {
  await pool.query('DELETE FROM mitglieder WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/skills', adminRequired, async (req, res) => {
  const result = await pool.query('SELECT * FROM skills ORDER BY kategorie, name');
  res.json(result.rows);
});

app.post('/api/admin/skills', adminRequired, async (req, res) => {
  const { name, kategorie } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  try {
    const result = await pool.query(
      'INSERT INTO skills (name, kategorie) VALUES ($1, $2) RETURNING *',
      [name.trim(), kategorie || 'Allgemein']
    );
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Skill existiert bereits' });
    throw e;
  }
});

app.delete('/api/admin/skills/:id', adminRequired, async (req, res) => {
  await pool.query('DELETE FROM skills WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ─── Error Handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Serverfehler' });
});

// ─── Start ─────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => console.log(`SchwarmFeld SD v1.0 läuft auf Port ${PORT}`));
}).catch(err => {
  console.error('DB-Init fehlgeschlagen:', err);
  process.exit(1);
});
