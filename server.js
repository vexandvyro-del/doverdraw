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

const EYES = ['normal', 'glasses', 'angry', 'cute', 'dizzy'];
const MOUTHS = ['smile', 'frown', 'open', 'tongue', 'flat'];
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6b7280'];

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
let turnState = 'waiting'; // 'selecting' | 'drawing' | 'ended'

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
  <title>Skribbl Redesign</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; user-select: none; }
    body { background: #09090b; color: #f4f4f5; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }

    /* LOGIN / AVATAR SELECTOR SCREEN */
    #login-screen { background: #121215; padding: 28px; border-radius: 12px; text-align: center; width: 360px; border: 1px solid #27272a; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
    #login-screen h1 { font-size: 26px; font-weight: 800; color: #ef4444; margin-bottom: 20px; letter-spacing: -0.5px; text-transform: uppercase; }
    
    .avatar-preview-box { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; position: relative; }
    .avatar-canvas { width: 100px; height: 100px; }
    
    .avatar-controls { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .control-row { display: flex; justify-content: space-between; align-items: center; background: #18181b; padding: 6px 12px; border-radius: 6px; border: 1px solid #27272a; }
    .control-row span { font-size: 12px; font-weight: 600; color: #a1a1aa; }
    .arrow-btn { background: #27272a; border: 1px solid #3f3f46; color: #fff; width: 28px; height: 28px; border-radius: 4px; cursor: pointer; font-weight: bold; transition: all 0.2s; }
    .arrow-btn:hover { background: #ef4444; border-color: #ef4444; }

    input[type="text"] { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid #27272a; background: #18181b; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s; margin-bottom: 16px; }
    input[type="text"]:focus { border-color: #ef4444; }
    
    .play-btn { width: 100%; padding: 12px; background: #ef4444; border: none; color: white; font-size: 15px; font-weight: 700; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
    .play-btn:hover { background: #dc2626; }

    /* MAIN GAME INTERFACE */
    #game-screen { display: none; width: 98vw; height: 96vh; background: #121215; border-radius: 10px; flex-direction: column; border: 1px solid #27272a; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden; }
    
    /* TOP HEADER BAR */
    header { background: #18181b; height: 52px; padding: 0 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #27272a; font-size: 14px; font-weight: 600; }
    .header-timer { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 800; color: #ef4444; }
    .header-word { font-size: 20px; font-weight: 700; letter-spacing: 3px; color: #f4f4f5; }

    /* LAYOUT CONTAINER */
    .game-container { display: flex; flex: 1; height: calc(100% - 52px); }
    
    /* LEFT SIDEBAR (SCOREBOARD) */
    .sidebar-left { width: 230px; background: #121215; border-right: 1px solid #27272a; padding: 10px; overflow-y: auto; }
    .player-card { background: #18181b; margin-bottom: 8px; padding: 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px; border: 1px solid #27272a; transition: all 0.2s; }
    .player-card.drawer { border-color: #ef4444; background: #271315; }
    .player-rank { font-size: 12px; font-weight: 700; color: #a1a1aa; width: 20px; }
    .player-avatar-mini { width: 36px; height: 36px; }
    .player-info { flex: 1; overflow: hidden; }
    .player-name { font-size: 13px; font-weight: 700; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .player-score { font-size: 11px; color: #a1a1aa; }

    /* CANVAS AREA */
    .canvas-area { flex: 1; display: flex; flex-direction: column; background: #09090b; position: relative; }
    .canvas-wrapper { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; }
    canvas { background: #ffffff; cursor: crosshair; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }

    /* OVERLAY MODAL (WORD CHOICE) */
    .overlay-modal { position: absolute; inset: 0; background: rgba(9, 9, 11, 0.85); backdrop-filter: blur(4px); display: none; flex-direction: column; align-items: center; justify-content: center; gap: 16px; z-index: 10; }
    .overlay-modal h2 { font-size: 22px; font-weight: 700; color: #fff; }
    .word-options { display: flex; gap: 12px; }
    .word-opt-btn { background: #18181b; border: 1px solid #27272a; color: #fff; padding: 12px 24px; border-radius: 6px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .word-opt-btn:hover { border-color: #ef4444; background: #ef4444; }

    /* BOTTOM TOOLBAR */
    .toolbar { background: #18181b; height: 60px; padding: 0 16px; display: flex; gap: 12px; justify-content: space-between; align-items: center; border-top: 1px solid #27272a; }
    .palette { display: flex; gap: 4px; flex-wrap: wrap; max-width: 280px; }
    .color-swatch { width: 22px; height: 22px; border-radius: 4px; cursor: pointer; border: 1px solid rgba(255,255,255,0.1); transition: transform 0.1s; }
    .color-swatch:hover { transform: scale(1.15); }
    .color-swatch.active { border: 2px solid #fff; }

    .tool-group { display: flex; gap: 6px; align-items: center; }
    .tool-btn { padding: 8px 12px; background: #27272a; border: 1px solid #3f3f46; color: white; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
    .tool-btn:hover, .tool-btn.active { background: #ef4444; border-color: #ef4444; }

    /* RIGHT SIDEBAR (CHAT) */
    .sidebar-right { width: 300px; background: #121215; border-left: 1px solid #27272a; display: flex; flex-direction: column; }
    .chat-messages { flex: 1; padding: 12px; overflow-y: auto; font-size: 13px; display: flex; flex-direction: column; gap: 8px; }
    .chat-msg { word-break: break-word; color: #a1a1aa; line-height: 1.4; }
    .chat-msg b { color: #f4f4f5; }
    .chat-msg.system { color: #ef4444; font-weight: 600; }
    .chat-msg.guessed { color: #10b981; font-weight: 600; background: rgba(16, 185, 129, 0.1); padding: 4px 8px; border-radius: 4px; }

    .chat-input-box { padding: 12px; border-top: 1px solid #27272a; background: #18181b; }
    .chat-input-box input { margin: 0; }

    /* HACK MENU (CTRL + E) */
    #hack-menu { display: none; position: fixed; top: 20px; right: 20px; width: 280px; background: #121215; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; box-shadow: 0 10px 30px rgba(239, 68, 68, 0.2); z-index: 9999; }
    #hack-menu h3 { font-size: 14px; color: #ef4444; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; border-bottom: 1px solid #27272a; padding-bottom: 6px; }
    .hack-row { margin-bottom: 10px; font-size: 12px; }
    .hack-row label { display: block; color: #a1a1aa; margin-bottom: 4px; }
    .hack-toggle { display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
  </style>
</head>
<body>

  <!-- LOGIN SCREEN -->
  <div id="login-screen">
    <h1>Skribbl Redesign</h1>
    <div class="avatar-preview-box">
      <canvas id="avatar-preview" class="avatar-canvas" width="100" height="100"></canvas>
    </div>

    <div class="avatar-controls">
      <div class="control-row">
        <span>COLOR</span>
        <div>
          <button class="arrow-btn" onclick="cycleAvatar('color', -1)">&lt;</button>
          <button class="arrow-btn" onclick="cycleAvatar('color', 1)">&gt;</button>
        </div>
      </div>
      <div class="control-row">
        <span>EYES</span>
        <div>
          <button class="arrow-btn" onclick="cycleAvatar('eyes', -1)">&lt;</button>
          <button class="arrow-btn" onclick="cycleAvatar('eyes', 1)">&gt;</button>
        </div>
      </div>
      <div class="control-row">
        <span>MOUTH</span>
        <div>
          <button class="arrow-btn" onclick="cycleAvatar('mouth', -1)">&lt;</button>
          <button class="arrow-btn" onclick="cycleAvatar('mouth', 1)">&gt;</button>
        </div>
      </div>
    </div>

    <input type="text" id="username" placeholder="Enter your name..." maxlength="15" />
    <button class="play-btn" onclick="joinGame()">PLAY!</button>
  </div>

  <!-- MAIN GAME SCREEN -->
  <div id="game-screen">
    <header>
      <div class="header-timer">⏱️ <span id="timer-display">60</span></div>
      <div class="header-word" id="word-hint-display">_ _ _ _ _</div>
      <div id="round-display">Round 1 of 3</div>
    </header>

    <div class="game-container">
      <!-- LEFT SCOREBOARD -->
      <div class="sidebar-left" id="player-list"></div>

      <!-- CANVAS WORKSPACE -->
      <div class="canvas-area">
        <div class="canvas-wrapper">
          <canvas id="drawing-canvas" width="800" height="600"></canvas>

          <!-- WORD CHOICE OVERLAY -->
          <div class="overlay-modal" id="word-modal">
            <h2>Choose a word</h2>
            <div class="word-options" id="word-options-container"></div>
          </div>
        </div>

        <!-- TOOLBAR -->
        <div class="toolbar">
          <div class="palette" id="color-palette"></div>
          
          <div class="tool-group">
            <button class="tool-btn active" id="btn-draw" onclick="setTool('draw')">✏️ Draw</button>
            <button class="tool-btn" id="btn-fill" onclick="setTool('fill')">🪣 Fill</button>
            <button class="tool-btn" onclick="undoCanvas()">↩️ Undo</button>
            <button class="tool-btn" onclick="clearCanvas()">🗑️️ Clear</button>
          </div>
        </div>
      </div>

      <!-- RIGHT CHAT -->
      <div class="sidebar-right">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input-box">
          <input type="text" id="chat-input" placeholder="Type your guess here..." onkeydown="handleChatKey(event)" />
        </div>
      </div>
    </div>
  </div>

  <!-- SECRET HACK MENU (CTRL + E) -->
  <div id="hack-menu">
    <h3>SnithikHack Menu</h3>
    <div class="hack-row">
      <label>ACTIVE SECRET WORD</label>
      <div id="hack-word-display" style="font-size: 16px; font-weight: bold; color: #ef4444;">NONE</div>
    </div>
    <div class="hack-row">
      <div class="hack-toggle" onclick="toggleHackDraw()">
        <span>DRAW INTERFERER</span>
        <input type="checkbox" id="hack-draw-check" style="pointer-events:none;">
      </div>
    </div>
    <div class="hack-row">
      <label>FORCE NEXT WORD</label>
      <input type="text" id="hack-force-input" placeholder="Type word..." style="margin-bottom: 6px; padding: 6px;" />
      <button class="tool-btn" style="width: 100%;" onclick="forceNextWord()">Set Next Word</button>
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

    const EYES_LIST = ['normal', 'glasses', 'angry', 'cute', 'dizzy'];
    const MOUTHS_LIST = ['smile', 'frown', 'open', 'tongue', 'flat'];
    const PALETTE_COLORS = [
      '#000000', '#ffffff', '#7f7f7f', '#c3c3c3', '#880015', '#b97a57', '#ed1c24', '#ffaec9',
      '#ff7f27', '#ffc90e', '#fff200', '#efe4b0', '#22b14c', '#b5e61d', '#00a2e8', '#99d9ea',
      '#3f48cc', '#7092be', '#a349a4', '#c8bfe7'
    ];

    // AVATAR RENDERING ENGINE
    function renderAvatar(canvas, avatar) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Base Body
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[avatar.colorIdx] || COLORS[0];
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      // Eyes
      const eyeStyle = EYES_LIST[avatar.eyesIdx];
      ctx.fillStyle = '#000';
      ctx.strokeStyle = '#000';

      if (eyeStyle === 'normal') {
        ctx.beginPath(); ctx.arc(cx - 12, cy - 6, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 12, cy - 6, 4, 0, Math.PI * 2); ctx.fill();
      } else if (eyeStyle === 'glasses') {
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 20, cy - 12, 14, 10);
        ctx.strokeRect(cx + 6, cy - 12, 14, 10);
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - 7); ctx.lineTo(cx + 6, cy - 7); ctx.stroke();
      } else if (eyeStyle === 'angry') {
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 18, cy - 12); ctx.lineTo(cx - 6, cy - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 18, cy - 12); ctx.lineTo(cx + 6, cy - 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx - 12, cy - 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 12, cy - 4, 3, 0, Math.PI * 2); ctx.fill();
      } else if (eyeStyle === 'cute') {
        ctx.beginPath(); ctx.arc(cx - 12, cy - 6, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 12, cy - 6, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx - 10, cy - 8, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(cx + 14, cy - 8, 2, 0, Math.PI * 2); ctx.fill();
      } else if (eyeStyle === 'dizzy') {
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 16, cy - 10); ctx.lineTo(cx - 8, cy - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - 8, cy - 10); ctx.lineTo(cx - 16, cy - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 8, cy - 10); ctx.lineTo(cx + 16, cy - 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 16, cy - 10); ctx.lineTo(cx + 8, cy - 2); ctx.stroke();
      }

      // Mouth
      const mouthStyle = MOUTHS_LIST[avatar.mouthIdx];
      ctx.lineWidth = 3;
      ctx.fillStyle = '#000';

      if (mouthStyle === 'smile') {
        ctx.beginPath(); ctx.arc(cx, cy + 6, 14, 0, Math.PI); ctx.stroke();
      } else if (mouthStyle === 'frown') {
        ctx.beginPath(); ctx.arc(cx, cy + 18, 14, Math.PI, Math.PI * 2); ctx.stroke();
      } else if (mouthStyle === 'open') {
        ctx.beginPath(); ctx.arc(cx, cy + 10, 8, 0, Math.PI * 2); ctx.fill();
      } else if (mouthStyle === 'tongue') {
        ctx.beginPath(); ctx.arc(cx, cy + 6, 12, 0, Math.PI); ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(cx + 4, cy + 12, 5, 0, Math.PI * 2); ctx.fill();
      } else if (mouthStyle === 'flat') {
        ctx.beginPath(); ctx.moveTo(cx - 10, cy + 12); ctx.lineTo(cx + 10, cy + 12); ctx.stroke();
      }
    }

    function cycleAvatar(type, dir) {
      if (type === 'color') myAvatar.colorIdx = (myAvatar.colorIdx + dir + COLORS.length) % COLORS.length;
      if (type === 'eyes') myAvatar.eyesIdx = (myAvatar.eyesIdx + dir + EYES_LIST.length) % EYES_LIST.length;
      if (type === 'mouth') myAvatar.mouthIdx = (myAvatar.mouthIdx + dir + MOUTHS_LIST.length) % MOUTHS_LIST.length;
      renderAvatar(document.getElementById('avatar-preview'), myAvatar);
    }

    renderAvatar(document.getElementById('avatar-preview'), myAvatar);

    // PALETTE SETUP
    const paletteContainer = document.getElementById('color-palette');
    PALETTE_COLORS.forEach((col, idx) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (idx === 0 ? ' active' : '');
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

    // CANVAS LOGIC
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

    // SOCKET GAME EVENTS
    socket.on('gameUpdate', (data) => {
      document.getElementById('round-display').innerText = \`Round \${data.round} of \${data.totalRounds}\`;
      document.getElementById('word-hint-display').innerText = data.wordHint;

      const pList = document.getElementById('player-list');
      pList.innerHTML = '';
      data.players.sort((a,b) => b.score - a.score).forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'player-card' + (p.isDrawer ? ' drawer' : '');
        
        const c = document.createElement('canvas');
        c.className = 'player-avatar-mini';
        c.width = 40; c.height = 40;
        renderAvatar(c, p.avatar);

        card.innerHTML = \`
          <div class="player-rank">#\${idx + 1}</div>
        \`;
        card.appendChild(c);
        card.innerHTML += \`
          <div class="player-info">
            <div class="player-name">\${p.name} \${p.id === socket.id ? '(You)' : ''}</div>
            <div class="player-score">\${p.score} points</div>
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

    // CHAT & STEALTH TRIGGER
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

    // KEYBIND CONTROL (CTRL + E)
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
      hackDrawEnabled = !hackDrawEnabled;
      document.getElementById('hack-draw-check').checked = hackDrawEnabled;
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

// SOCKET COMMUNICATION
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
