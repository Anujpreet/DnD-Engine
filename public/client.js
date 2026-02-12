import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js";
const socket = io();

// 1. STATE & ELEMENTS
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMain = document.getElementById('lobby-main');
const lobbyJoin = document.getElementById('lobby-join');
const roomCodeDisplay = document.getElementById('room-code-display');
const msgInput = document.getElementById('msg-input');
const diceMenu = document.getElementById('dice-menu');
const messages = document.getElementById('messages');

let myUsername = "Player", myRoomCode = null, myDiceColor = "#5a2e91", isHost = false;

// 2. DICE ENGINE
let Box = new DiceBox({
    container: "#dice-stage",
    id: "dice-canvas",
    origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
    assetPath: "assets/",
    scale: 12,
    theme: "default",
    restitution: 0.5,
    throwForce: 6
});
Box.init();

// SYNCED MULTI-DICE RENDERING
socket.on('trigger_god_roll', (data) => {
    if (Box) {
        Box.clear();
        // Convert server results into dice config array
        const diceToRoll = data.results.map(val => ({
            sides: data.sides,
            value: val,
            themeColor: data.color
        }));

        Box.roll(diceToRoll).then((results) => {
            const total = results.reduce((acc, curr) => acc + curr.value, 0);
            const item = document.createElement('div');
            item.style.borderLeft = `4px solid ${data.color}`;
            item.style.paddingLeft = "8px";
            item.innerHTML = `<b style="color:${data.color}">${data.user}:</b> Rolled ${data.results.length}d${data.sides} [ <b>${total}</b> ]`;
            messages.appendChild(item);
            messages.scrollTop = messages.scrollHeight;
            setTimeout(() => Box.clear(), 5000);
        });
    }
});

window.rollDice = (s) => {
    const qty = document.getElementById('dice-qty').value;
    socket.emit('roll_dice', { sides: s, qty: qty, username: myUsername, color: myDiceColor });
};
window.updateDiceColor = (color) => { myDiceColor = color; };
window.toggleDiceMenu = () => diceMenu.style.display = (diceMenu.style.display === 'flex') ? 'none' : 'flex';

// 3. LOBBY LISTENERS (Restored & Functional)
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
    if (code.length === 4) socket.emit('join_game', { username: myUsername, code: code });
};

socket.on('room_joined', (data) => {
    myRoomCode = data.code; isHost = data.isHost;
    lobbyOverlay.classList.add('hidden');
    document.getElementById('room-info').style.display = 'block';
    roomCodeDisplay.innerText = myRoomCode;
    msgInput.disabled = false;
});

// 4. BOARD & CANVAS LOGIC (RESTORED)
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let tokens = [], isDragging = false, dragId = null, offX = 0, offY = 0, dragOrigin = { x: 0, y: 0 };
let backgroundImage = new Image(), isMapLoaded = false;

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isMapLoaded) ctx.drawImage(backgroundImage, 0, 0);

    // Grid (50px = 5ft)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    for (let x = 0; x <= canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // Measurement Arrow (RESTORED)
    if (isDragging && dragId) {
        const t = tokens.find(tok => tok.id === dragId);
        const distPx = Math.hypot(t.x - dragOrigin.x, t.y - dragOrigin.y);
        const distFt = Math.round(distPx / 50) * 5;
        ctx.beginPath(); ctx.moveTo(dragOrigin.x, dragOrigin.y); ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#ffff00'; ctx.font = 'bold 16px Arial';
        ctx.fillText(`${distFt} ft`, (dragOrigin.x + t.x) / 2, (dragOrigin.y + t.y) / 2 - 10);
    }

    // Render Tokens (Names + HP Bars)
    tokens.forEach(t => {
        ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = t.color; ctx.fill();
        ctx.strokeStyle = (t.owner === socket.id || isHost) ? '#fff' : '#333';
        ctx.lineWidth = 3; ctx.stroke();

        ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`${t.label} (${t.hp}/${t.maxHp})`, t.x, t.y - 30);

        ctx.fillStyle = '#441111'; ctx.fillRect(t.x - 20, t.y + 25, 40, 4);
        ctx.fillStyle = '#22aa22'; ctx.fillRect(t.x - 20, t.y + 25, 40 * (t.hp / t.maxHp), 4);
    });
}

socket.on('init_state', (state) => {
    tokens = state.tokens;
    if (state.background) {
        backgroundImage.src = state.background;
        backgroundImage.onload = () => { isMapLoaded = true; canvas.width = state.mapWidth; canvas.height = state.mapHeight; };
    } else { canvas.width = 800; canvas.height = 600; }
});

socket.on('update_token', (data) => {
    const t = tokens.find(tok => tok.id === data.id);
    if (t) { t.x = data.x; t.y = data.y; }
});

setInterval(draw, 30);

// Interaction Logic
canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);
    tokens.forEach(t => {
        if (Math.hypot(mx - t.x, my - t.y) < 20) {
            // Check Permission: Host or Owner
            if (isHost || t.owner === socket.id) {
                isDragging = true; dragId = t.id; offX = mx - t.x; offY = my - t.y;
                dragOrigin = { x: t.x, y: t.y };
            }
        }
    });
};

canvas.onmousemove = (e) => {
    if (isDragging) {
        const r = canvas.getBoundingClientRect();
        const mx = (e.clientX - r.left) * (canvas.width / r.width);
        const my = (e.clientY - r.top) * (canvas.height / r.height);
        const t = tokens.find(tok => tok.id === dragId);
        t.x = mx - offX; t.y = my - offY;
    }
};

canvas.onmouseup = () => {
    if (isDragging) {
        const t = tokens.find(tok => tok.id === dragId);
        t.x = Math.round((t.x - 25) / 50) * 50 + 25; // Snapping
        t.y = Math.round((t.y - 25) / 50) * 50 + 25;
        socket.emit('move_token', { id: t.id, x: t.x, y: t.y });
    }
    isDragging = false;
};

// Map Upload
document.getElementById('map-upload').onchange = (e) => {
    if (!isHost) return alert("Only the Host can change the map.");
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => socket.emit('update_map', { image: event.target.result, width: img.width, height: img.height });
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
};

// Chat PANEL logic
socket.on('chat_message', (msg) => {
    const item = document.createElement('div');
    item.innerHTML = `<b style="color:#a47ed8">${msg.user}:</b> ${msg.text}`;
    messages.appendChild(item);
    messages.scrollTop = messages.scrollHeight;
});

document.getElementById('input-area').onsubmit = (e) => {
    e.preventDefault();
    if (msgInput.value && myRoomCode) {
        socket.emit('chat_message', { user: myUsername, text: msgInput.value });
        msgInput.value = '';
    }
};