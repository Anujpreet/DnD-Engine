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

// 2. LOBBY LISTENERS (TOP LEVEL FOR SAFETY)
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

// 3. 3D DICE ENGINE INITIALIZATION
let Box;
try {
    Box = new DiceBox("#dice-stage", {
        id: "dice-canvas",
        assetPath: "/assets/dice-box/",
        startingHeight: 8,
        throwForce: 6,
        spinForce: 5,
        themeColor: "#5a2e91",
    });
    Box.init().then(() => console.log("Dice Ready"));
} catch (e) { console.error("Dice failed, but game will work.", e); }

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

socket.on('dice_result', (data) => {
    if (Box) {
        Box.roll(`d${data.sides}`, { result: data.result, clear: true });
        setTimeout(() => Box.clear(), 5000);
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
window.rollDice = (s) => { socket.emit('roll_dice', { sides: s }); diceMenu.style.display = 'none'; };

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let tokens = [];
let backgroundImage = new Image();
let isMapLoaded = false;

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isMapLoaded) ctx.drawImage(backgroundImage, 0, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    for (let x = 0; x <= canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
    tokens.forEach(t => {
        ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = t.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(t.label, t.x, t.y + 4);
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

// Token movement logic - Unchanged
let isDragging = false, dragId = null, offX = 0, offY = 0;
canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width), my = (e.clientY - r.top) * (canvas.height / r.height);
    tokens.forEach(t => { if (Math.hypot(mx - t.x, my - t.y) < 20) { isDragging = true; dragId = t.id; offX = mx - t.x; offY = my - t.y; } });
};
canvas.onmousemove = (e) => {
    if (isDragging) {
        const r = canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (canvas.width / r.width), my = (e.clientY - r.top) * (canvas.height / r.height);
        const t = tokens.find(tok => tok.id === dragId);
        t.x = mx - offX; t.y = my - offY;
        draw(); socket.emit('move_token', { id: t.id, x: t.x, y: t.y });
    }
};
canvas.onmouseup = () => isDragging = false;