const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

// Garantir diretórios
if (!fs.existsSync('./public/uploads')) fs.mkdirSync('./public/uploads', { recursive: true });
if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });

const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

let db;

async function initDB() {
    db = await open({ filename: './data/database.sqlite', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS catalog (id TEXT PRIMARY KEY, name TEXT, image TEXT);
        CREATE TABLE IF NOT EXISTS promo (id TEXT PRIMARY KEY, type TEXT, url TEXT, duration INTEGER);
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    
    const hasSettings = await db.get("SELECT * FROM settings LIMIT 1");
    if (!hasSettings) {
        await db.run("INSERT INTO settings (key, value) VALUES ('background', ''), ('promoIdleTime', '60')");
    }
}

async function broadcastAll(target = io) {
    const catalog = await db.all('SELECT * FROM catalog');
    const promo = await db.all('SELECT * FROM promo');
    const settingsRows = await db.all('SELECT * FROM settings');
    const settings = {};
    settingsRows.forEach(row => settings[row.key] = row.value);
    
    target.emit('updateCatalog', catalog);
    target.emit('updatePromo', promo);
    target.emit('updateSettings', settings);
}

// --- ROTAS DO CATÁLOGO ---
app.post('/api/add-item', upload.single('image'), async (req, res) => {
    const img = req.file ? '/uploads/' + req.file.filename : '';
    await db.run("INSERT INTO catalog (id, name, image) VALUES (?, ?, ?)", [Date.now().toString(), req.body.name, img]);
    broadcastAll();
    res.json({ success: true });
});

app.post('/api/edit-item', upload.single('image'), async (req, res) => {
    if (req.file) {
        await db.run("UPDATE catalog SET name = ?, image = ? WHERE id = ?", [req.body.name, '/uploads/' + req.file.filename, req.body.id]);
    } else {
        await db.run("UPDATE catalog SET name = ? WHERE id = ?", [req.body.name, req.body.id]);
    }
    broadcastAll();
    res.json({ success: true });
});

app.post('/api/remove-item', async (req, res) => {
    await db.run("DELETE FROM catalog WHERE id = ?", [req.body.id]);
    broadcastAll();
    res.json({ success: true });
});

// --- ROTAS DE CONFIGURAÇÃO E PROMO ---
app.post('/api/upload-background', upload.single('background'), async (req, res) => {
    if (req.file) await db.run("UPDATE settings SET value = ? WHERE key = 'background'", ['/uploads/' + req.file.filename]);
    broadcastAll();
    res.json({ success: true });
});

app.post('/api/add-promo', upload.single('media'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    const isVideo = ['.mp4', '.webm', '.ogg', '.mov'].includes(path.extname(req.file.originalname).toLowerCase());
    const duration = parseInt(req.body.duration) || 10;
    await db.run("INSERT INTO promo (id, type, url, duration) VALUES (?, ?, ?, ?)", [Date.now().toString(), isVideo ? 'video' : 'image', '/uploads/' + req.file.filename, duration]);
    broadcastAll();
    res.json({ success: true });
});

app.post('/api/remove-promo', async (req, res) => {
    await db.run("DELETE FROM promo WHERE id = ?", [req.body.id]);
    broadcastAll();
    res.json({ success: true });
});

// --- WEBSOCKETS ---
io.on('connection', (socket) => {
    broadcastAll(socket);
    socket.on('videoFrame', (frame) => socket.broadcast.emit('streamVideo', frame));
    socket.on('forcePlayPromo', () => io.emit('triggerPromoNow'));
    socket.on('forceStopPromo', () => io.emit('stopPromoNow'));
    socket.on('forceSkipPromo', () => io.emit('skipPromoNow'));
    socket.on('savePromoSettings', async (newSettings) => {
        const time = parseInt(newSettings.promoIdleTime) || 60;
        await db.run("UPDATE settings SET value = ? WHERE key = 'promoIdleTime'", [time.toString()]);
        broadcastAll();
    });
});

initDB().then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Servidor a correr na porta ${PORT}`));
});