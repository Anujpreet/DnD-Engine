const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

const rooms = {}; // Room storage

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
    console.log('User connected:', socket.id);

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
        } else {
            socket.emit('error_message', 'Room not found!');
        }
    });

    socket.on('move_token', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode && rooms[roomCode]) {
            const token = rooms[roomCode].tokens.find(t => t.id === data.id);
            if (token) { token.x = data.x; token.y = data.y; socket.to(roomCode).emit('update_token', data); }
        }
    });

    socket.on('roll_complete', (data) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) {
            // NOW we tell the chat the result
            io.to(roomCode).emit('chat_message', {
                user: data.user,
                text: `Rolled D${data.sides}: [ ${data.result} ]`
            });
        }
    });

    socket.on('chat_message', (msg) => {
        const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
        if (roomCode) io.to(roomCode).emit('chat_message', msg);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));