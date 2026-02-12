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
            { id: 't1', x: 100, y: 100, color: '#ff4444', label: 'T1' },
            { id: 't2', x: 200, y: 100, color: '#4444ff', label: 'T2' }
        ]
    };
}

io.on('connection', (socket) => {
    socket.on('host_game', (username) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = createGameState();
        socket.join(roomCode);
        socket.emit('room_joined', { code: roomCode, isHost: true, username: username });
        socket.emit('init_state', rooms[roomCode]);
    });

    socket.on('join_game', (data) => {
        const roomCode = data.code.toUpperCase();
        if (rooms[roomCode]) {
            socket.join(roomCode);
            socket.emit('room_joined', { code: roomCode, isHost: false, username: data.username });
            socket.emit('init_state', rooms[roomCode]);
            io.to(roomCode).emit('chat_message', { user: 'System', text: `${data.username} joined.` });
        }
    });

    socket.on('move_token', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode && rooms[roomCode]) {
            const token = rooms[roomCode].tokens.find(t => t.id === data.id);
            if (token) {
                token.x = data.x; token.y = data.y;
                socket.to(roomCode).emit('update_token', data);
            }
        }
    });

    socket.on('update_map', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode && rooms[roomCode]) {
            rooms[roomCode].background = data.image;
            rooms[roomCode].mapWidth = data.width;
            rooms[roomCode].mapHeight = data.height;
            socket.to(roomCode).emit('init_state', rooms[roomCode]);
        }
    });

    socket.on('roll_dice', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            // 1. Force conversion to number and pick a result ONCE
            const sides = parseInt(data.sides);
            const resultValue = Math.floor(Math.random() * sides) + 1;

            // 2. Broadcast the EXACT result to everyone in the room
            io.to(roomCode).emit('trigger_god_roll', {
                sides: sides,
                result: resultValue,
                user: data.username,
                color: data.color || "#5a2e91"
            });
        }
    });

    socket.on('chat_message', (msg) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) io.to(roomCode).emit('chat_message', msg);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));