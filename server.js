require('dotenv').config();
const express      = require('express');
const multer       = require('multer');
const sharp        = require('sharp');
const path         = require('path');
const fs           = require('fs');
const https        = require('https');
const rateLimit    = require('express-rate-limit');
const { v4: uuid } = require('uuid');

const app        = express();
const PORT       = process.env.PORT || 3000;
const PASSWORD   = process.env.PASSWORD;
const PASSWORD_ALT = process.env.PASSWORD_ALT || null;
const EVENT_NAME = process.env.EVENT_NAME || 'Familiefest';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const META_FILE  = path.join(__dirname, 'photos.json');

const SSL_CERT = process.env.SSL_CERT;
const SSL_KEY  = process.env.SSL_KEY;
const PUBLIC_URL = process.env.PUBLIC_URL || `https://localhost:${PORT}`;

if (!PASSWORD) {
  console.error('FEJL: PASSWORD mangler. Opret en .env fil (se .env.example).');
  process.exit(1);
}
if (!SSL_CERT || !SSL_KEY) {
  console.error('FEJL: SSL_CERT / SSL_KEY mangler i .env');
  process.exit(1);
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(META_FILE))  fs.writeFileSync(META_FILE, '[]');

const sessions = new Map();

function createSession(name) {
  const token = uuid();
  sessions.set(token, { name, createdAt: Date.now() });
  return token;
}

function validateSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return null;
  }
  return s;
}

app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'For mange forsøg — prøv igen om 15 minutter' },
  standardHeaders: true,
  legacyHeaders: false,
});

const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/heic','image/heif','image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Kun billedfiler er tilladt'));
  }
});

async function renderPolaroid(imageBuffer, guestName, timeStr) {
  const meta = await sharp(imageBuffer).metadata();
  const iw   = Math.min(meta.width, 2000);
  const ih   = Math.round(iw * meta.height / meta.width);
  const border = Math.round(Math.min(iw, ih) * 0.045);
  const bottom = Math.round(Math.min(iw, ih) * 0.22);
  const cw     = iw + border * 2;
  const ch     = ih + border + bottom;
const resized = await sharp(imageBuffer).rotate().resize(iw, ih, { fit: 'contain' }).toBuffer();
  const fontSize1 = Math.round(bottom * 0.22);
  const fontSize2 = Math.round(bottom * 0.19);
  const fontSize3 = Math.round(bottom * 0.22);
  const textSvg = Buffer.from(`<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg">
    <text x="${cw/2}" y="${ih + border + bottom * 0.32}"
      text-anchor="middle" font-family="Georgia, serif" font-style="italic"
      font-size="${fontSize1}" fill="#2a2018">${EVENT_NAME}</text>
    <text x="${cw/2}" y="${ih + border + bottom * 0.56}"
      text-anchor="middle" font-family="Georgia, serif" font-style="italic"
      font-size="${fontSize2}" fill="#6B5E52">${timeStr}</text>
    <text x="${cw/2}" y="${ih + border + bottom * 0.80}"
      text-anchor="middle" font-family="Georgia, serif" font-style="italic"
      font-size="${fontSize3}" fill="#7A4D1D">&#8212; ${guestName}</text>
  </svg>`);
  return await sharp({ create: { width: cw, height: ch, channels: 3, background: '#F5F0E8' } })
    .composite([{ input: resized, left: border, top: border }, { input: textSvg, left: 0, top: 0 }])
    .jpeg({ quality: 88 }).toBuffer();
}

app.post('/api/login', loginLimiter, (req, res) => {
  const { password, name } = req.body;
if (!password || (password !== PASSWORD && (!PASSWORD_ALT || password !== PASSWORD_ALT))) {
    console.log(`FAIL2BAN_FAIL ip=${req.ip} path=/api/login`);
    return res.status(401).json({ error: 'Forkert kodeord' });
  }
  const token = createSession(name ? name.trim() : 'Gæst');
  res.json({ ok: true, token });
});

app.post('/api/upload', upload.array('photos', 30), async (req, res) => {
  const { token, noScreen } = req.body;
  const session = validateSession(token);
  if (!session) return res.status(401).json({ error: 'Ugyldig session — log ind igen' });
  const now     = new Date();
  const timeStr = now.toLocaleString('da-DK', { day: 'numeric', month: 'short' }) +
                  '  ·  ' +
                  now.toLocaleString('da-DK', { hour: '2-digit', minute: '2-digit' });
  const meta    = JSON.parse(fs.readFileSync(META_FILE));
  const results = [];
  for (const file of req.files) {
    try {
      const polaroidBuf = await renderPolaroid(file.buffer, session.name, timeStr);
      const filename    = `${Date.now()}-${uuid()}.jpg`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), polaroidBuf);
      const entry = { id: filename, url: `/uploads/${filename}`, guest: session.name, noScreen: noScreen === 'true', time: timeStr };
      meta.push(entry);
      results.push(entry);
    } catch (err) {
      console.error('Polaroid render fejl:', err.message);
    }
  }
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  res.json({ ok: true, count: results.length, photos: results });
});

app.get('/api/photos', (req, res) => {
  const session = validateSession(req.query.token);
  if (!session) return res.status(401).json({ error: 'Ugyldig session' });
  const meta = JSON.parse(fs.readFileSync(META_FILE));
  res.json(meta);
});

const sslOptions = {
  cert: fs.readFileSync(SSL_CERT),
  key:  fs.readFileSync(SSL_KEY),
};

https.createServer(sslOptions, app).listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅  ${EVENT_NAME}-app kører på https://0.0.0.0:${PORT}`);
  console.log(`    Udefra:  ${PUBLIC_URL}`);
  console.log(`    (Kodeord sat via .env — vises ikke i log)\n`);
});
