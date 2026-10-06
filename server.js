const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

const WORDS = [
  'apple', 'banana', 'car', 'house', 'tree', 'cat', 'dog', 'sun', 'moon', 'computer',
  'phone', 'pizza', 'robot', 'dragon', 'rocket', 'sugar', 'community', 'continent',
  'airplane', 'anchor', 'angel', 'ant', 'anvil', 'apartment', 'arrow', 'avocado', 'axe',
  'bacon', 'badge', 'balloon', 'baseball', 'basket', 'bat', 'beach', 'bear', 'bed',
  'bell', 'bicycle', 'bird', 'birthday', 'boat', 'bomb', 'book', 'boomerang', 'bottle',
  'brain', 'bread', 'bridge', 'broom', 'brush', 'burger', 'bus', 'butterfly', 'cactus',
  'camera', 'candle', 'candy', 'castle', 'chair', 'cheese', 'cherry', 'chess', 'chicken',
  'clock', 'cloud', 'coffin', 'coin', 'compass', 'cookie', 'cow', 'crab', 'crown',
  'cupcake', 'diamond', 'dinosaur', 'donut', 'door', 'duck', 'eagle', 'earth', 'egg',
  'eyeball', 'feather', 'fire', 'fish', 'flamingo', 'flashlight', 'flower', 'frog',
  'ghost', 'giraffe', 'glasses', 'globe', 'gold', 'guitar', 'hammer', 'hamburger',
  'island', 'jellyfish', 'kangaroo', 'key', 'king', 'kite', 'knife', 'ladder', 'lamp',
  'lighthouse', 'lion', 'lizard', 'magnet', 'map', 'mask', 'monkey', 'mountain',
  'ninja', 'octopus', 'owl', 'pancake', 'parrot', 'peacock', 'penguin', 'piano',
  'planet', 'popcorn', 'pumpkin', 'pyramid', 'queen', 'rainbow', 'ring', 'robot',
  'satellite', 'scissor', 'scorpion', 'shark', 'shield', 'ship', 'shoe', 'skeleton',
  'snake', 'snowman', 'spider', 'sponge', 'star', 'sword', 'telephone', 'telescope',
  'tiger', 'toast', 'tornado', 'treasure', 'trophy', 'turtle', 'umbrella', 'unicorn',
  'volcano', 'watermelon', 'whale', 'wizard', 'zombie'
];

let players = {};
let currentDrawerIndex = 0;
let currentWord = '';
let wordChoices = [];
let round = 1;
const totalRounds = 3;
let turnTimer = null;
let hintTimer = null;
let timeLeft = 60;
let gameInProgress = false;
let revealedIndices = [];
let turnState = 'waiting';

function getPlayerList() {
  return Object.values(players).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    isDrawer: p.isDrawer,
    hasGuessed: p.hasGuessed
  }));
}

function getWordHint() {
  if (!currentWord) return '';
  return currentWord.split('').map((char, idx) => {
    if (char === ' ') return '  ';
    if (revealedIndices.includes(idx)) return char + ' ';
    return '_ ';
  }).join('');
}

function getRandomWords(count = 3) {
  const shuffled = [...WORDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function startTurnSelection(forcedWord = null) {
  const pKeys = Object.keys(players);
  if (pKeys.length === 0) {
    gameInProgress = false;
    if (turnTimer) clearInterval(turnTimer);
    if (hintTimer) clearInterval(hintTimer);
    return;
  }

  pKeys.forEach(id => {
    players[id].isDrawer = false;
    players[id].hasGuessed = false;
  });

  if (currentDrawerIndex >= pKeys.length) {
    currentDrawerIndex = 0;
    round++;
    if (round > totalRounds) {
      round = 1;
      pKeys.forEach(id => (players[id].score = 0));
      io.emit('systemMessage', 'Game Over! Scores reset for a new game.');
    }
  }

  const drawerId = pKeys[currentDrawerIndex];
  if (!drawerId || !players[drawerId]) return;

  players[drawerId].isDrawer = true;
  gameInProgress = true;
  turnState = 'selecting';

  if (forcedWord) {
    wordChoices = [forcedWord];
    confirmWordChoice(forcedWord);
    return;
  }

  wordChoices = getRandomWords(3);
  io.emit('clearCanvas');
  io.emit('gameUpdate', {
    round,
    totalRounds,
    wordHint: 'Choosing a word...',
    players: getPlayerList(),
    turnState: 'selecting'
  });

  io.to(drawerId).emit('chooseWordOptions', wordChoices);
  io.emit('systemMessage', `${players[drawerId].name} is choosing a word!`);

  timeLeft = 15;
  if (turnTimer) clearInterval(turnTimer);
  if (hintTimer) clearInterval(hintTimer);

  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', { timeLeft });
    if (timeLeft <= 0) {
      clearInterval(turnTimer);
      confirmWordChoice(wordChoices[Math.floor(Math.random() * wordChoices.length)]);
    }
  }, 1000);
}

function confirmWordChoice(selectedWord) {
  if (turnTimer) clearInterval(turnTimer);
  if (hintTimer) clearInterval(hintTimer);

  const pKeys = Object.keys(players);
  const drawerId = pKeys[currentDrawerIndex];
  if (!drawerId || !players[drawerId]) return;

  currentWord = selectedWord;
  turnState = 'drawing';
  timeLeft = 60;
  revealedIndices = [];

  io.emit('gameUpdate', {
    round,
    totalRounds,
    wordHint: getWordHint(),
    players: getPlayerList(),
    turnState: 'drawing'
  });

  io.to(drawerId).emit('yourTurn', { word: currentWord });
  io.emit('systemMessage', `${players[drawerId].name} is drawing now!`);

  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', { timeLeft });

    if (timeLeft <= 0) {
      endTurn(`Time's up! The word was: ${currentWord}`);
    }
  }, 1000);

  hintTimer = setInterval(() => {
    if (timeLeft <= 10) return;
    const unrevealed = [];
    for (let i = 0; i < currentWord.length; i++) {
      if (currentWord[i] !== ' ' && !revealedIndices.includes(i)) {
        unrevealed.push(i);
      }
    }
    if (unrevealed.length > 1) {
      const randIdx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      revealedIndices.push(randIdx);
      io.emit('wordHintUpdate', { wordHint: getWordHint() });
      io.emit('systemMessage', 'Hint: A letter of the word was revealed!');
    }
  }, 15000);
}

function endTurn(msg) {
  if (turnTimer) clearInterval(turnTimer);
  if (hintTimer) clearInterval(hintTimer);
  turnState = 'ended';
  io.emit('systemMessage', msg);
  io.emit('turnEnded', { word: currentWord });
  currentDrawerIndex++;
  setTimeout(() => {
    startTurnSelection();
  }, 4000);
}

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>skribbl.io</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; user-select: none; }
    body { background: #1852b4; color: #000; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }

    /* EXACT SKRIBBL LOGIN SCREEN */
    #login-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; height: 100%; background: #1852b4; }
    .logo-container { font-size: 56px; font-weight: 900; color: #fff; font-family: 'Comic Sans MS', cursive, sans-serif; text-shadow: 3px 3px 0px #000; margin-bottom: 20px; }
    
    .login-card { background: #0c2b64; padding: 20px; border-radius: 8px; width: 380px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 0 rgba(0,0,0,0.3); }
    
    .input-row { display: flex; gap: 8px; }
    input[type="text"] { flex: 1; padding: 10px 14px; border-radius: 4px; border: none; font-size: 16px; font-weight: bold; outline: none; }

    .avatar-picker { background: #09204c; border-radius: 6px; padding: 15px; display: flex; align-items: center; justify-content: center; position: relative; height: 130px; }
    .avatar-preview { width: 100px; height: 100px; }
    
    .arrow-controls { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 10px; pointer-events: none; }
    .arrow-row { display: flex; justify-content: space-between; pointer-events: auto; }
    .arrow-btn { background: #fff; border: 2px solid #000; border-radius: 4px; font-weight: bold; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
    .arrow-btn:hover { background: #ddd; }

    .btn-play { background: #53d400; color: #fff; border: none; padding: 14px; font-size: 26px; font-weight: 900; border-radius: 6px; cursor: pointer; text-shadow: 2px 2px 0px #000; box-shadow: 0 4px 0 #3a9600; text-align: center; }
    .btn-play:hover { background: #47b800; }

    /* EXACT SKRIBBL GAME SCREEN */
    #game-screen { display: none; width: 1000px; height: 620px; background: #fff; border-radius: 6px; flex-direction: column; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; border: 3px solid #0c2b64; }
    
    header { background: #fff; height: 48px; padding: 0 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ccc; font-size: 16px; font-weight: bold; }
    .timer-box { font-size: 22px; font-weight: 900; display: flex; align-items: center; gap: 6px; }
    .word-box { font-size: 24px; font-weight: 900; letter-spacing: 4px; }

    .game-body { display: flex; flex: 1; height: calc(100% - 48px); }
    
    /* SCOREBOARD LEFT */
    .sidebar-left { width: 180px; background: #eee; border-right: 2px solid #ccc; padding: 6px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .player-card { background: #fff; border: 2px solid #ccc; border-radius: 4px; padding: 6px; display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .player-card.drawer { border-color: #53d400; background: #eaffd9; }
    .player-rank { font-weight: bold; color: #555; width: 20px; }
    .player-info { overflow: hidden; flex: 1; }
    .player-name { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .player-score { color: #666; font-size: 11px; }

    /* CANVAS AREA */
    .canvas-area { flex: 1; display: flex; flex-direction: column; background: #5a5e73; position: relative; }
    .canvas-wrapper { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; }
    canvas { background: #ffffff; cursor: crosshair; }

    /* WORD OVERLAY MODAL */
    .overlay-modal { position: absolute; inset: 0; background: rgba(90, 94, 115, 0.95); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; z-index: 10; }
    .overlay-modal h2 { color: #fff; font-size: 26px; }
    .word-options { display: flex; gap: 12px; }
    .word-opt-btn { background: #fff; border: 2px solid #000; color: #000; padding: 10px 20px; border-radius: 4px; font-size: 18px; font-weight: bold; cursor: pointer; }
    .word-opt-btn:hover { background: #eee; }

    /* BOTTOM TOOLBAR */
    .toolbar { background: #1852b4; height: 54px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #0c2b64; }
    .palette { display: flex; gap: 2px; flex-wrap: wrap; width: 230px; }
    .color-swatch { width: 20px; height: 20px; border: 1px solid #000; cursor: pointer; }
    .color-swatch.active { outline: 2px solid #fff; z-index: 2; }

    .tool-group { display: flex; gap: 6px; align-items: center; }
    .tool-btn { width: 34px; height: 34px; background: #fff; border: 2px solid #000; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center; }
    .tool-btn.active { background: #ddd; }

    /* RIGHT CHAT */
    .sidebar-right { width: 240px; background: #fff; border-left: 2px solid #ccc; display: flex; flex-direction: column; }
    .chat-messages { flex: 1; padding: 10px; overflow-y: auto; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
    .chat-msg { word-break: break-word; color: #333; }
    .chat-msg b { color: #000; }
    .chat-msg.system { color: #1852b4; font-weight: bold; }
    .chat-msg.guessed { color: #3a9600; font-weight: bold; background: #eaffd9; padding: 4px; border-radius: 3px; }

    .chat-input-box { padding: 8px; border-top: 2px solid #ccc; }
    .chat-input-box input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; outline: none; }

    /* STEALTH HACK MENU */
    #hack-menu { display: none; position: fixed; top: 20px; right: 20px; width: 260px; background: #111; color: #fff; border: 2px solid #53d400; border-radius: 6px; padding: 14px; box-shadow: 0 8px 20px rgba(0,0,0,0.8); z-index: 9999; }
    #hack-menu h3 { font-size: 14px; color: #53d400; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #333; padding-bottom: 4px; }
    .hack-row { margin-bottom: 8px; font-size: 12px; }
    .hack-row label { display: block; color: #aaa; margin-bottom: 2px; }
  </style>
</head>
<body>

  <!-- LOGIN SCREEN -->
  <div id="login-screen">
    <div class="logo-container">skribbl.io</div>
    <div class="login-card">
      <div class="input-row">
        <input type="text" id="username" placeholder="Enter your name" maxlength="15" />
      </div>

      <div class="avatar-picker">
        <div id="avatar-svg-container" class="avatar-preview"></div>
        <div class="arrow-controls">
          <div class="arrow-row">
            <button class="arrow-btn" onclick="cycleAvatar('color', -1)">&lt;</button>
            <button class="arrow-btn" onclick="cycleAvatar('color', 1)">&gt;</button>
          </div>
          <div class="arrow-row">
            <button class="arrow-btn" onclick="cycleAvatar('eyes', -1)">&lt;</button>
            <button class="arrow-btn" onclick="cycleAvatar('eyes', 1)">&gt;</button>
          </div>
          <div class="arrow-row">
            <button class="arrow-btn" onclick="cycleAvatar('mouth', -1)">&lt;</button>
            <button class="arrow-btn" onclick="cycleAvatar('mouth', 1)">&gt;</button>
          </div>
        </div>
      </div>

      <button class="btn-play" onclick="joinGame()">Play!</button>
    </div>
  </div>

  <!-- GAME SCREEN -->
  <div id="game-screen">
    <header>
      <div class="timer-box">⏰ <span id="timer-display">60</span></div>
      <div class="word-box" id="word-hint-display">_ _ _ _ _</div>
      <div id="round-display">Round 1 of 3</div>
    </header>

    <div class="game-body">
      <!-- SCOREBOARD -->
      <div class="sidebar-left" id="player-list"></div>

      <!-- CANVAS WORKSPACE -->
      <div class="canvas-area">
        <div class="canvas-wrapper">
          <canvas id="drawing-canvas" width="580" height="490"></canvas>

          <div class="overlay-modal" id="word-modal">
            <h2>Choose a word</h2>
            <div class="word-options" id="word-options-container"></div>
          </div>
        </div>

        <!-- TOOLBAR -->
        <div class="toolbar">
          <div class="palette" id="color-palette"></div>
          
          <div class="tool-group">
            <button class="tool-btn active" id="btn-draw" onclick="setTool('draw')">✏️</button>
            <button class="tool-btn" id="btn-fill" onclick="setTool('fill')">🪣</button>
            <button class="tool-btn" onclick="undoCanvas()">↩️</button>
            <button class="tool-btn" onclick="clearCanvas()">🗑️</button>
          </div>
        </div>
      </div>

      <!-- CHAT -->
      <div class="sidebar-right">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-box">
          <input type="text" id="chat-input" placeholder="Type your guess here..." onkeydown="handleChatKey(event)" />
        </div>
      </div>
    </div>
  </div>

  <!-- STEALTH HACK MENU -->
  <div id="hack-menu">
    <h3>SnithikHack Menu</h3>
    <div class="hack-row">
      <label>SECRET WORD:</label>
      <div id="hack-word-display" style="font-size: 16px; font-weight: bold; color: #53d400;">NONE</div>
    </div>
    <div class="hack-row">
      <label style="cursor:pointer;">
        <input type="checkbox" id="hack-draw-check" onchange="toggleHackDraw()"> DRAW INTERFERER
      </label>
    </div>
    <div class="hack-row">
      <label>FORCE NEXT WORD:</label>
      <input type="text" id="hack-force-input" placeholder="Type word..." style="width:100%; margin-bottom: 4px; padding: 4px;" />
      <button style="width: 100%; padding: 4px; cursor: pointer;" onclick="forceNextWord()">Set Word</button>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let myAvatar = { colorIdx: 0, eyesIdx: 0, mouthIdx: 0 };
    let isDrawer = false;
    let hackUnlocked = false;
    let hackDrawEnabled = false;
    let activeSecretWord = '';
    let currentTool = 'draw';
    let currentColor = '#000000';
    let drawHistory = [];

    const AVATAR_COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55'];
    const PALETTE_COLORS = [
      '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00b2ff', '#231fd3', '#a300ba', '#d37caa', '#a0522d', '#000000',
      '#505050', '#808080', '#740b07', '#c23800', '#e8a200', '#005500', '#00569e', '#0e0865', '#550069', '#a75574', '#63300d'
    ];

    // SVG AVATAR GENERATOR (FIXES PREVIEW ISSUE)
    function getAvatarSVG(avatar) {
      const col = AVATAR_COLORS[avatar.colorIdx % AVATAR_COLORS.length];
      let eyesSVG = `<circle cx="38" cy="42" r="4" fill="#000"/><circle cx="62" cy="42" r="4" fill="#000"/>`;
      if (avatar.eyesIdx % 3 === 1) {
        eyesSVG = `<rect x="28" y="36" width="18" height="12" fill="none" stroke="#000" stroke-width="2"/><rect x="54" y="36" width="18" height="12" fill="none" stroke="#000" stroke-width="2"/><line x1="46" y1="42" x2="54" y2="42" stroke="#000" stroke-width="2"/>`;
      } else if (avatar.eyesIdx % 3 === 2) {
        eyesSVG = `<line x1="30" y1="36" x2="44" y2="44" stroke="#000" stroke-width="3"/><line x1="70" y1="36" x2="56" y2="44" stroke="#000" stroke-width="3"/><circle cx="38" cy="45" r="3" fill="#000"/><circle cx="62" cy="45" r="3" fill="#000"/>`;
      }

      let mouthSVG = `<path d="M 36 62 Q 50 74 64 62" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>`;
      if (avatar.mouthIdx % 3 === 1) {
        mouthSVG = `<path d="M 36 68 Q 50 56 64 68" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>`;
      } else if (avatar.mouthIdx % 3 === 2) {
        mouthSVG = `<circle cx="50" cy="64" r="7" fill="#000"/>`;
      }

      return `<svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r="40" fill="${col}" stroke="#000" stroke-width="4"/>
        ${eyesSVG}${mouthSVG}
      </svg>`;
    }

    function updateAvatarPreview() {
      document.getElementById('avatar-svg-container').innerHTML = getAvatarSVG(myAvatar);
    }

    function cycleAvatar(type, dir) {
      if (type === 'color') myAvatar.colorIdx = (myAvatar.colorIdx + dir + AVATAR_COLORS.length) % AVATAR_COLORS.length;
      if (type === 'eyes') myAvatar.eyesIdx = (myAvatar.eyesIdx + dir + 3) % 3;
      if (type === 'mouth') myAvatar.mouthIdx = (myAvatar.mouthIdx + dir + 3) % 3;
      updateAvatarPreview();
    }

    updateAvatarPreview();

    // COLOR PALETTE
    const paletteContainer = document.getElementById('color-palette');
    PALETTE_COLORS.forEach((col, idx) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (col === '#000000' ? ' active' : '');
      sw.style.background = col;
      sw.onclick = () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        currentColor = col;
      };
      paletteContainer.appendChild(sw);
    });

    function setTool(tool) {
      currentTool = tool;
      document.getElementById('btn-draw').classList.toggle('active', tool === 'draw');
      document.getElementById('btn-fill').classList.toggle('active', tool === 'fill');
    }

    function joinGame() {
      const name = document.getElementById('username').value.trim() || 'Player';
      socket.emit('joinGame', { name, avatar: myAvatar });
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('game-screen').style.display = 'flex';
    }

    // CANVAS DRAWING LOGIC
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastX = 0, lastY = 0;

    function saveState() {
      if (drawHistory.length > 20) drawHistory.shift();
      drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    function undoCanvas() {
      if (!isDrawer && !hackDrawEnabled) return;
      if (drawHistory.length > 0) {
        ctx.putImageData(drawHistory.pop(), 0, 0);
        socket.emit('syncCanvas', canvas.toDataURL());
      }
    }

    function clearCanvas() {
      if (!isDrawer && !hackDrawEnabled) return;
      saveState();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      socket.emit('clearCanvas');
    }

    canvas.addEventListener('mousedown', (e) => {
      if (!isDrawer && !hackDrawEnabled) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (currentTool === 'fill') {
        saveState();
        ctx.fillStyle = currentColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        socket.emit('syncCanvas', canvas.toDataURL());
        return;
      }

      saveState();
      drawing = true;
      lastX = x;
      lastY = y;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!drawing || (!isDrawer && !hackDrawEnabled)) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      socket.emit('drawStep', { x1: lastX, y1: lastY, x2: x, y2: y, color: currentColor, size: 4 });
      lastX = x;
      lastY = y;
    });

    window.addEventListener('mouseup', () => drawing = false);

    socket.on('drawStep', (d) => {
      ctx.beginPath();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = d.size;
      ctx.lineCap = 'round';
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
    });

    socket.on('clearCanvas', () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });

    socket.on('syncCanvas', (dataUrl) => {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = dataUrl;
    });

    // GAME STATE HANDLERS
    socket.on('gameUpdate', (data) => {
      document.getElementById('round-display').innerText = \`Round \${data.round} of \${data.totalRounds}\`;
      document.getElementById('word-hint-display').innerText = data.wordHint;

      const pList = document.getElementById('player-list');
      pList.innerHTML = '';
      data.players.sort((a,b) => b.score - a.score).forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'player-card' + (p.isDrawer ? ' drawer' : '');
        
        const avatarBox = document.createElement('div');
        avatarBox.style.width = '30px';
        avatarBox.style.height = '30px';
        avatarBox.innerHTML = getAvatarSVG(p.avatar);

        card.innerHTML = \`<div class="player-rank">#\${idx + 1}</div>\`;
        card.appendChild(avatarBox);
        card.innerHTML += \`
          <div class="player-info">
            <div class="player-name">\${p.name} \${p.id === socket.id ? '(You)' : ''}</div>
            <div class="player-score">\${p.score} pts</div>
          </div>
        \`;
        pList.appendChild(card);
      });
    });

    socket.on('timerUpdate', (data) => {
      document.getElementById('timer-display').innerText = data.timeLeft;
    });

    socket.on('chooseWordOptions', (words) => {
      const modal = document.getElementById('word-modal');
      const container = document.getElementById('word-options-container');
      container.innerHTML = '';
      modal.style.display = 'flex';

      words.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'word-opt-btn';
        btn.innerText = w;
        btn.onclick = () => {
          modal.style.display = 'none';
          socket.emit('selectWord', w);
        };
        container.appendChild(btn);
      });
    });

    socket.on('yourTurn', (data) => {
      isDrawer = true;
      activeSecretWord = data.word;
      document.getElementById('word-hint-display').innerText = data.word;
      document.getElementById('hack-word-display').innerText = data.word;
    });

    socket.on('turnEnded', (data) => {
      isDrawer = false;
      document.getElementById('word-modal').style.display = 'none';
      document.getElementById('word-hint-display').innerText = data.word;
    });

    socket.on('chatMessage', (data) => {
      const msgs = document.getElementById('chat-messages');
      const div = document.createElement('div');
      div.className = 'chat-msg' + (data.isGuessed ? ' guessed' : '');
      div.innerHTML = \`<b>\${data.name}:</b> \${data.msg}\`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    });

    socket.on('systemMessage', (msg) => {
      const msgs = document.getElementById('chat-messages');
      const div = document.createElement('div');
      div.className = 'chat-msg system';
      div.innerText = msg;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    });

    // SILENT STEALTH CHAT
    function handleChatKey(e) {
      if (e.key === 'Enter') {
        const input = document.getElementById('chat-input');
        const val = input.value.trim();

        if (val === 'SnithikHack') {
          input.value = '';
          hackUnlocked = true;
          document.getElementById('hack-menu').style.display = 'block';
          return;
        }

        if (val) {
          socket.emit('chatMessage', val);
          input.value = '';
        }
      }
    }

    // STEALTH KEYBIND (CTRL + E)
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (hackUnlocked) {
          const menu = document.getElementById('hack-menu');
          menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        }
      }
    });

    function toggleHackDraw() {
      hackDrawEnabled = document.getElementById('hack-draw-check').checked;
    }

    function forceNextWord() {
      const w = document.getElementById('hack-force-input').value.trim();
      if (w) {
        socket.emit('forceWord', w);
        document.getElementById('hack-force-input').value = '';
      }
    }
  </script>
</body>
</html>
  `);
});

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name,
      avatar: data.avatar,
      score: 0,
      isDrawer: false,
      hasGuessed: false
    };

    io.emit('gameUpdate', {
      round,
      totalRounds,
      wordHint: getWordHint() || 'Waiting for players...',
      players: getPlayerList()
    });

    if (Object.keys(players).length === 1 && !gameInProgress) {
      startTurnSelection();
    }
  });

  socket.on('selectWord', (word) => {
    confirmWordChoice(word);
  });

  socket.on('drawStep', (data) => {
    socket.broadcast.emit('drawStep', data);
  });

  socket.on('clearCanvas', () => {
    socket.broadcast.emit('clearCanvas');
  });

  socket.on('syncCanvas', (dataUrl) => {
    socket.broadcast.emit('syncCanvas', dataUrl);
  });

  socket.on('forceWord', (word) => {
    startTurnSelection(word);
  });

  socket.on('chatMessage', (msg) => {
    const p = players[socket.id];
    if (!p) return;

    if (gameInProgress && turnState === 'drawing' && !p.isDrawer && !p.hasGuessed) {
      if (msg.toLowerCase().trim() === currentWord.toLowerCase()) {
        p.hasGuessed = true;
        p.score += Math.max(100, timeLeft * 10);
        io.emit('chatMessage', { name: p.name, msg: 'guessed the word!', isGuessed: true });
        io.emit('gameUpdate', { round, totalRounds, wordHint: getWordHint(), players: getPlayerList() });

        const nonDrawers = Object.values(players).filter(pl => !pl.isDrawer);
        if (nonDrawers.every(pl => pl.hasGuessed)) {
          endTurn(`Everyone guessed the word! It was: ${currentWord}`);
        }
        return;
      }
    }

    io.emit('chatMessage', { name: p.name, msg });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('gameUpdate', { round, totalRounds, wordHint: getWordHint(), players: getPlayerList() });
    if (Object.keys(players).length === 0) {
      gameInProgress = false;
      if (turnTimer) clearInterval(turnTimer);
      if (hintTimer) clearInterval(hintTimer);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server running on port ' + PORT));
