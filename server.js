const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {};

function generateRoomCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 4; i++) result += characters.charAt(Math.floor(Math.random() * characters.length));
    return result;
}

function createGameState() {
    return {
        background: null, mapWidth: 800, mapHeight: 600,
        tokens: [
            { id: 't1', x: 125, y: 125, color: '#ff4444', label: 'Warrior', hp: 25, maxHp: 25, owner: null },
            { id: 't2', x: 225, y: 125, color: '#4444ff', label: 'Mage', hp: 15, maxHp: 15, owner: null }
        ]
    };
}

io.on('connection', (socket) => {
    // 1. LOBBY LOGIC
    socket.on('host_game', (username) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = createGameState();
        socket.join(roomCode);
        socket.isHost = true; // Mark this socket as the DM
        socket.emit('room_joined', { code: roomCode, isHost: true, username: username });
        socket.emit('init_state', rooms[roomCode]);
    });

    socket.on('join_game', (data) => {
        const roomCode = data.code.toUpperCase();
        if (rooms[roomCode]) {
            socket.join(roomCode);
            socket.isHost = false;
            socket.emit('room_joined', { code: roomCode, isHost: false, username: data.username });
            socket.emit('init_state', rooms[roomCode]);
            io.to(roomCode).emit('chat_message', { user: 'System', text: `${data.username} joined.` });
        } else {
            socket.emit('chat_message', { user: 'System', text: 'Room not found.' });
        }
    });

    // 2. CHARACTER OWNERSHIP (HOST ONLY)
    socket.on('assign_token', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r.length === 4);
        if (socket.isHost && rooms[roomCode]) {
            const token = rooms[roomCode].tokens.find(t => t.id === data.tokenId);
            if (token) token.owner = data.targetSocketId;
            io.to(roomCode).emit('init_state', rooms[roomCode]);
        }
    });

    // 3. BOARD SYNC (With Permission Check)
    socket.on('move_token', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r.length === 4);
        if (roomCode && rooms[roomCode]) {
            const token = rooms[roomCode].tokens.find(t => t.id === data.id);
            // Permission: Host can move all; Players move only owned
            if (socket.isHost || token.owner === socket.id) {
                token.x = data.x; token.y = data.y;
                socket.to(roomCode).emit('update_token', data);
            }
        }
    });

    socket.on('update_map', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r.length === 4);
        if (socket.isHost && rooms[roomCode]) {
            rooms[roomCode].background = data.image;
            rooms[roomCode].mapWidth = data.width;
            rooms[roomCode].mapHeight = data.height;
            socket.to(roomCode).emit('init_state', rooms[roomCode]);
        }
    });

    // 4. SYNCED MULTI-DICE LOGIC
    socket.on('roll_dice', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r.length === 4);
        if (roomCode) {
            const qty = parseInt(data.qty) || 1;
            const results = Array.from({ length: qty }, () => Math.floor(Math.random() * data.sides) + 1);

            io.to(roomCode).emit('trigger_god_roll', {
                sides: data.sides,
                results: results, // Array of results for multi-dice
                user: data.username,
                color: data.color || "#5a2e91"
            });
        }
    });

    socket.on('chat_message', (msg) => {
        const roomCode = Array.from(socket.rooms).find(r => r.length === 4);
        if (roomCode) io.to(roomCode).emit('chat_message', msg);
    });
});

const PORT = 3000;
http.listen(PORT, () => console.log(`DM Server live on http://localhost:${PORT}`));