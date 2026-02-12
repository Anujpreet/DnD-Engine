import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js";

const socket = io();

// 1. DOM ELEMENTS
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMain = document.getElementById('lobby-main');
const lobbyJoin = document.getElementById('lobby-join');
const roomCodeDisplay = document.getElementById('room-code-display');
const msgInput = document.getElementById('msg-input');
const diceMenu = document.getElementById('dice-menu');
const messages = document.getElementById('messages');

let myUsername = "Player";
let myRoomCode = null;

// 2. LOBBY LISTENERS
document.getElementById('btn-host-game').onclick = () => {
    myUsername = document.getElementById('username-input').value || "Host";
    socket.emit('host_game', myUsername);
};

document.getElementById('btn-show-join').onclick = () => {
    lobbyMain.classList.add('hidden');
    lobbyJoin.classList.remove('hidden');
};

document.getElementById('btn-back').onclick = () => {
    lobbyJoin.classList.add('hidden');
    lobbyMain.classList.remove('hidden');
};

document.getElementById('btn-confirm-join').onclick = () => {
    const code = document.getElementById('room-code-input').value.toUpperCase();
    myUsername = document.getElementById('username-input').value || "Guest";
    if (code.length === 4) {
        socket.emit('join_game', { username: myUsername, code: code });
    } else { alert("Enter 4-letter code"); }
};

// 3. 3D DICE ENGINE (VISIBILITY FIX)
let Box;
try {
    Box = new DiceBox({
        container: "#dice-stage",
        id: "dice-canvas",
        origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
        assetPath: "assets/",

        // VISIBILITY SETTINGS
        scale: 9,           // Max safe size for physics
        throwForce: 20,      // ✅ INCREASED: Throws them into the center of the screen
        spinForce: 4,       // More spin looks better large
        startingHeight: 15, // Drop from higher up
        gravity: 1,

        theme: "default",
        themeColor: "#5a2e91"
    });

    Box.init().then(() => console.log("Dice Ready"));
} catch (e) {
    console.error("Dice failed", e);
}


// 4. SOCKET LOGIC
socket.on('room_joined', (data) => {
    myRoomCode = data.code;
    lobbyOverlay.classList.add('hidden');
    document.getElementById('room-info').style.display = 'block';
    roomCodeDisplay.innerText = myRoomCode;
    msgInput.disabled = false;
    msgInput.placeholder = "Type a message...";
    msgInput.focus();
});

socket.on('trigger_roll', (data) => {
    const menu = document.getElementById('dice-menu');
    if (menu) menu.style.display = 'none';

    if (Box) {
        // 👇 FIX: Use '1d' instead of data.sides + 'd'
        // This ensures we only roll ONE die of the specified type
        Box.roll(`1d${data.sides}`).then((results) => {

            // Only the person who clicked sends the result to chat
            if (data.rollerId === socket.id) {
                let total = results.reduce((acc, r) => acc + r.value, 0);
                socket.emit('roll_complete', {
                    sides: data.sides,
                    result: total,
                    user: myUsername
                });
            }

            // Clear dice after 4 seconds
            setTimeout(() => Box.clear(), 4000);
        });
    }
});

socket.on('chat_message', (msg) => {
    const item = document.createElement('div');
    item.innerHTML = typeof msg === 'object' ? `<b style="color:#a47ed8">${msg.user}:</b> ${msg.text}` : msg;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

// 5. CANVAS & INPUT LOGIC
document.getElementById('input-area').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value && myRoomCode) {
        socket.emit('chat_message', { user: myUsername, text: msgInput.value });
        msgInput.value = '';
    }
};

window.toggleDiceMenu = () => diceMenu.style.display = (diceMenu.style.display === 'flex') ? 'none' : 'flex';
window.rollDice = (s) => {
    socket.emit('roll_dice', { sides: s });
};

// --- NEW CANVAS LOGIC ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let tokens = [];
let backgroundImage = new Image();
let isMapLoaded = false;
let dragOrigin = { x: 0, y: 0 }; // Where did the drag start?

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Map
    if (isMapLoaded) ctx.drawImage(backgroundImage, 0, 0);

    // 2. Draw Grid (50px squares)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // 3. Draw Measurement Arrow (if dragging)
    if (isDragging && dragId) {
        const t = tokens.find(tok => tok.id === dragId);
        if (t) {
            // Calculate distance: 50px = 5ft
            const distPx = Math.hypot(t.x - dragOrigin.x, t.y - dragOrigin.y);
            const distFt = Math.round(distPx / 50) * 5;

            // Draw Line
            ctx.beginPath();
            ctx.moveTo(dragOrigin.x, dragOrigin.y);
            ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = '#ffff00'; // Yellow arrow
            ctx.lineWidth = 3;
            ctx.stroke();

            // Draw Distance Text
            ctx.fillStyle = '#ffff00';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${distFt} ft`, (dragOrigin.x + t.x) / 2, (dragOrigin.y + t.y) / 2 - 10);
        }
    }

    // 4. Draw Tokens
    tokens.forEach(t => {
        ctx.beginPath();
        ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(t.label, t.x, t.y + 4);
    });
}

socket.on('init_state', (state) => {
    tokens = state.tokens;
    if (state.background) {
        backgroundImage.src = state.background;
        backgroundImage.onload = () => { isMapLoaded = true; canvas.width = state.mapWidth; canvas.height = state.mapHeight; draw(); };
    } else { canvas.width = 800; canvas.height = 600; draw(); }
});

socket.on('update_token', (data) => {
    const t = tokens.find(tok => tok.id === data.id);
    if (t) { t.x = data.x; t.y = data.y; draw(); }
});

let isDragging = false, dragId = null, offX = 0, offY = 0;

canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);

    tokens.forEach(t => {
        if (Math.hypot(mx - t.x, my - t.y) < 20) {
            isDragging = true;
            dragId = t.id;
            offX = mx - t.x;
            offY = my - t.y;
            dragOrigin = { x: t.x, y: t.y }; // Save start position for arrow
        }
    });
};

canvas.onmousemove = (e) => {
    if (isDragging) {
        const r = canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (canvas.width / r.width);
        const my = (e.clientY - r.top) * (canvas.height / r.height);

        const t = tokens.find(tok => tok.id === dragId);
        t.x = mx - offX;
        t.y = my - offY;

        draw();
        // We only emit on drop to save performance
    }
};

canvas.onmouseup = () => {
    if (isDragging) {
        const t = tokens.find(tok => tok.id === dragId);

        // SNAP TO GRID (Nearest 50px)
        // 25 is the offset (half of 50) so it snaps to center of tile
        t.x = Math.round((t.x - 25) / 50) * 50 + 25;
        t.y = Math.round((t.y - 25) / 50) * 50 + 25;

        draw();
        socket.emit('move_token', { id: t.id, x: t.x, y: t.y });
    }
    isDragging = false;
    dragId = null;
};