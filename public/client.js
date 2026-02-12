import DiceBox from "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/dice-box.es.min.js";
const socket = io();

// 1. STATE & UI ELEMENTS
const lobbyOverlay = document.getElementById('lobby-overlay');
const lobbyMain = document.getElementById('lobby-main');
const lobbyJoin = document.getElementById('lobby-join');
const roomCodeDisplay = document.getElementById('room-code-display');
const msgInput = document.getElementById('msg-input');
const diceMenu = document.getElementById('dice-menu');
const messages = document.getElementById('messages');

let myUsername = "Player", myRoomCode = null, myDiceColor = "#5a2e91";

// 2. DICE ENGINE
let Box = new DiceBox({
    container: "#dice-stage",
    id: "dice-canvas",
    origin: "https://unpkg.com/@3d-dice/dice-box@1.1.3/dist/",
    assetPath: "assets/",
    scale: 12,
    theme: "default",
    themeColor: myDiceColor,
    restitution: 0.5,
    throwForce: 6
});
Box.init();

// 3. DICE ACTIONS
window.updateDiceColor = (color) => { myDiceColor = color; };
window.rollDice = (s) => { socket.emit('roll_dice', { sides: s, username: myUsername, color: myDiceColor }); };

socket.on('trigger_god_roll', (data) => {
    if (Box) {
        Box.clear(); // Clear any old dice

        // ✅ IMPORTANT: We pass an array of objects with the 'value' property.
        // This forces the physics engine to land on the server's result.
        Box.roll([{
            sides: data.sides,
            value: data.result, // <--- This forces the outcome on ALL screens
            themeColor: data.color
        }]).then((results) => {
            // SUM DISPLAYER: Calculate total from the results array
            const total = results.reduce((acc, curr) => acc + curr.value, 0);

            const item = document.createElement('div');
            item.style.borderLeft = `4px solid ${data.color}`;
            item.style.paddingLeft = "8px";
            item.innerHTML = `<b style="color:${data.color}">${data.user}:</b> Rolled D${data.sides} [ <b>${total}</b> ]`;
            messages.appendChild(item);
            messages.scrollTop = messages.scrollHeight;

            // Clear dice after 4 seconds to keep the board clean
            setTimeout(() => Box.clear(), 4000);
        });
    }
});

// Update the roll request to include your username and color
window.rollDice = (s) => {
    socket.emit('roll_dice', {
        sides: s,
        username: myUsername,
        color: myDiceColor
    });
};

window.toggleDiceMenu = () => diceMenu.style.display = (diceMenu.style.display === 'flex') ? 'none' : 'flex';

// 4. LOBBY LISTENERS
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
    myRoomCode = data.code;
    lobbyOverlay.classList.add('hidden');
    document.getElementById('room-info').style.display = 'block';
    roomCodeDisplay.innerText = myRoomCode;
});

// 5. CANVAS & BOARD LOGIC (RESTORED)
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let tokens = [], isDragging = false, dragId = null, offX = 0, offY = 0, dragOrigin = { x: 0, y: 0 };
let backgroundImage = new Image(), isMapLoaded = false;

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (isMapLoaded) ctx.drawImage(backgroundImage, 0, 0);

    // Grid (50px = 5ft)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= canvas.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

    // Measurement Arrow
    if (isDragging && dragId) {
        const t = tokens.find(tok => tok.id === dragId);
        if (t) {
            const distPx = Math.hypot(t.x - dragOrigin.x, t.y - dragOrigin.y);
            const distFt = Math.round(distPx / 50) * 5;
            ctx.beginPath(); ctx.moveTo(dragOrigin.x, dragOrigin.y); ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#ffff00'; ctx.font = 'bold 16px Arial';
            ctx.fillText(`${distFt} ft`, (dragOrigin.x + t.x) / 2, (dragOrigin.y + t.y) / 2 - 10);
        }
    }

    // Tokens
    tokens.forEach(t => {
        ctx.beginPath(); ctx.arc(t.x, t.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = t.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
        ctx.fillText(t.label, t.x, t.y + 4);
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

// Map Upload Logic
document.getElementById('map-upload').onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            socket.emit('update_map', { image: event.target.result, width: img.width, height: img.height });
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
};

canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (canvas.width / r.width);
    const my = (e.clientY - r.top) * (canvas.height / r.height);
    tokens.forEach(t => {
        if (Math.hypot(mx - t.x, my - t.y) < 20) {
            isDragging = true; dragId = t.id; offX = mx - t.x; offY = my - t.y;
            dragOrigin = { x: t.x, y: t.y };
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
        // Snapping logic (nearest 50px tile center)
        t.x = Math.round((t.x - 25) / 50) * 50 + 25;
        t.y = Math.round((t.y - 25) / 50) * 50 + 25;
        socket.emit('move_token', { id: t.id, x: t.x, y: t.y });
    }
    isDragging = false; dragId = null;
};

// 6. CHAT PANEL
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