const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

let currentCatalog = [];
let promoMedia = [];
// Configurações padrão de tempo (em segundos)
let settings = { 
    background: '',
    promoIdleTime: 60, 
    promoImageDuration: 10 
};

app.post('/api/add-item', upload.single('image'), (req, res) => {
    currentCatalog.push({ id: Date.now(), name: req.body.name, image: req.file ? '/uploads/' + req.file.filename : '' });
    io.emit('updateCatalog', currentCatalog);
    res.json({ success: true });
});

app.post('/api/edit-item', upload.single('image'), (req, res) => {
    const index = currentCatalog.findIndex(item => item.id == req.body.id);
    if (index !== -1) {
        currentCatalog[index].name = req.body.name;
        if (req.file) currentCatalog[index].image = '/uploads/' + req.file.filename;
        io.emit('updateCatalog', currentCatalog);
        res.json({ success: true });
    } else res.status(404).json({ success: false });
});

app.post('/api/remove-item', (req, res) => {
    currentCatalog = currentCatalog.filter(item => item.id !== req.body.id);
    io.emit('updateCatalog', currentCatalog);
    res.json({ success: true });
});

app.post('/api/upload-background', upload.single('background'), (req, res) => {
    if (req.file) settings.background = '/uploads/' + req.file.filename;
    io.emit('updateSettings', settings);
    res.json({ success: true });
});

app.post('/api/add-promo', upload.single('media'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false });
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isVideo = ['.mp4', '.webm', '.ogg', '.mov'].includes(ext);
    promoMedia.push({ id: Date.now(), type: isVideo ? 'video' : 'image', url: '/uploads/' + req.file.filename });
    io.emit('updatePromo', promoMedia);
    res.json({ success: true });
});

app.post('/api/remove-promo', (req, res) => {
    promoMedia = promoMedia.filter(item => item.id !== req.body.id);
    io.emit('updatePromo', promoMedia);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.emit('updateCatalog', currentCatalog);
    socket.emit('updatePromo', promoMedia);
    socket.emit('updateSettings', settings);
    
    socket.on('videoFrame', (frame) => socket.broadcast.emit('streamVideo', frame));
    
    // Controlos manuais e de configuração
    socket.on('forcePlayPromo', () => io.emit('triggerPromoNow'));
    socket.on('forceStopPromo', () => io.emit('stopPromoNow'));
    socket.on('forceSkipPromo', () => io.emit('skipPromoNow'));
    
    socket.on('savePromoSettings', (newSettings) => {
        settings.promoIdleTime = parseInt(newSettings.promoIdleTime) || 60;
        settings.promoImageDuration = parseInt(newSettings.promoImageDuration) || 10;
        io.emit('updateSettings', settings);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Servidor rodando na porta ${PORT}`); });