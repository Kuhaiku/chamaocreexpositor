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
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

let currentCatalog = [];
let settings = { 
    logo: '', 
    background: '' 
};

// Adicionar Doce
app.post('/api/add-item', upload.single('image'), (req, res) => {
    const newItem = {
        id: Date.now(),
        name: req.body.name,
        image: req.file ? '/uploads/' + req.file.filename : ''
    };
    currentCatalog.push(newItem);
    io.emit('updateCatalog', currentCatalog);
    res.json({ success: true });
});

// Remover Doce
app.post('/api/remove-item', (req, res) => {
    currentCatalog = currentCatalog.filter(item => item.id !== req.body.id);
    io.emit('updateCatalog', currentCatalog);
    res.json({ success: true });
});

// Upload Logo
app.post('/api/upload-logo', upload.single('logo'), (req, res) => {
    if (req.file) settings.logo = '/uploads/' + req.file.filename;
    io.emit('updateSettings', settings);
    res.json({ success: true });
});

// Upload Fundo
app.post('/api/upload-background', upload.single('background'), (req, res) => {
    if (req.file) settings.background = '/uploads/' + req.file.filename;
    io.emit('updateSettings', settings);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.emit('updateCatalog', currentCatalog);
    socket.emit('updateSettings', settings);

    socket.on('videoFrame', (frame) => {
        socket.broadcast.emit('streamVideo', frame);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});