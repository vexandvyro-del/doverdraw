const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const WORDS = [
  'apple', 'banana', 'car', 'house', 'tree', 'cat', 'dog', 'sun', 'moon', 'computer',
  'phone', 'pizza', 'robot', 'dragon', 'rocket', 'ligma', 'skibidi', 'rizz', 'gyatt', 'sigma',
  'fanum tax', 'ohio', 'mewing', 'grimace', 'kai cenat', 'bussin', 'cap', 'no cap', 'sus', 'impostor',
  'airplane', 'anchor', 'angel', 'ant', 'anvil', 'apartment', 'arrow', 'avocado', 'axe', 'baby',
  'bacon', 'badge', 'balloon', 'baseball', 'basket', 'bat', 'beach', 'bear', 'bed', 'bee',
  'bell', 'bicycle', 'bird', 'birthday', 'blackhole', 'boat', 'bomb', 'book', 'boomerang', 'bottle',
  'brain', 'bread', 'bridge', 'broom', 'brush', 'burger', 'bus', 'butterfly', 'cactus', 'cake',
  'camera', 'candle', 'candy', 'castle', 'caterpillar', 'chair', 'cheese', 'cherry', 'chess', 'chicken',
  'clock', 'cloud', 'coffin', 'coin', 'compass', 'cookie', 'cow', 'crab', 'crown', 'crystal',
  'cupcake', 'diamond', 'dinosaur', 'donut', 'door', 'duck', 'eagle', 'earth', 'egg', 'elephant',
  'eyeball', 'feather', 'fire', 'fireworks', 'fish', 'flamingo', 'flashlight', 'flower', 'fountain', 'frog',
  'ghost', 'giraffe', 'glasses', 'globe', 'gold', 'guitar', 'hammer', 'hamburger', 'helicopter', 'iceberg',
  'island', 'jellyfish', 'kangaroo', 'key', 'king', 'kite', 'knife', 'ladder', 'lamp', 'lemon',
  'lighthouse', 'lion', 'lizard', 'magnet', 'map', 'mask', 'microscope', 'monkey', 'mountain', 'mushroom',
  'ninja', 'octopus', 'owl', 'pancake', 'parrot', 'peacock', 'penguin', 'piano', 'pineapple', 'pirate',
  'planet', 'popcorn', 'pumpkin', 'pyramid', 'queen', 'rainbow', 'ring', 'robot', 'rocket', 'sandwich',
  'satellite', 'scissor', 'scorpion', 'shark', 'shield', 'ship', 'shoe', 'skeleton', 'skull', 'snake',
  'snowman', 'spider', 'sponge', 'star', 'sword', 'telephone', 'telescope', 'throne', 'tiger', 'toast',
  'tornado', 'treasure', 'trophy', 'turtle', 'umbrella', 'unicorn', 'volcano', 'watermelon', 'whale', 'wizard',
  'zombie', 'anchor', 'alien', 'astronaut', 'battery', 'bridge', 'castle', 'dice', 'feather', 'guitar'
];

let players = {};
let currentDrawerIndex = 0;
let currentWord = '';
let round = 1;
const totalRounds = 3;
let turnTimer = null;
let hintTimer = null;
let timeLeft = 60;
let gameInProgress = false;
let revealedIndices = [];

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

function startNextTurn(forcedWord = null) {
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
      io.emit('systemMessage', '🎉 Game Over! Scores reset for a new game.');
    }
  }

  const drawerId = pKeys[currentDrawerIndex];
  if (!drawerId) return;

  players[drawerId].isDrawer = true;
  currentWord = forcedWord || WORDS[Math.floor(Math.random() * WORDS.length)];
  timeLeft = 60;
  revealedIndices = [];
  gameInProgress = true;

  io.emit('clearCanvas');
  io.emit('gameUpdate', {
    round,
    totalRounds,
    wordHint: getWordHint(),
    players: getPlayerList()
  });

  io.to(drawerId).emit('yourTurn', { word: currentWord });

  if (turnTimer) clearInterval(turnTimer);
  if (hintTimer) clearInterval(hintTimer);

  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(turnTimer);
      if (hintTimer) clearInterval(hintTimer);
      io.emit('systemMessage', `⏰ Time's up! The word was: ${currentWord}`);
      currentDrawerIndex++;
      setTimeout(startNextTurn, 3000);
    }
  }, 1000);

  // Leak 1 letter every 20 seconds
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
      io.emit('systemMessage', '💡 Hint: A letter of the word was revealed!');
    }
  }, 20000);
}

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>doverdraw</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Comic Sans MS', 'Arial', sans-serif; }
    body { background: #0c1a24; color: #fff; height: 100vh; display: flex; align-items: center; justify-content: center; overflow: hidden; }

    #login-screen { background: #182836; padding: 30px; border-radius: 12px; text-align: center; width: 360px; border: 4px solid #328cc1; box-shadow: 0px 8px 0px #092532; }
    #login-screen h1 { font-size: 42px; color: #f6f7d7; margin-bottom: 20px; text-shadow: 2px 2px #000; }
    
    .avatar-selector { display: flex; justify-content: center; gap: 10px; margin-bottom: 15px; font-size: 32px; }
    .avatar-opt { cursor: pointer; padding: 5px; border-radius: 8px; border: 2px solid transparent; }
    .avatar-opt.selected { border-color: #50b347; background: #24384a; }

    input[type="text"], select { width: 100%; padding: 10px; margin-bottom: 15px; border-radius: 6px; border: 2px solid #ccc; font-size: 16px; outline: none; }
    button { width: 100%; padding: 12px; background: #50b347; border: none; color: white; font-size: 20px; font-weight: bold; border-radius: 6px; cursor: pointer; box-shadow: 0 4px 0 #31722a; }
    button:active { transform: translateY(2px); box-shadow: 0 2px 0 #31722a; }

    #game-screen { display: none; width: 95vw; height: 92vh; background: #12181b; border-radius: 8px; flex-direction: column; border: 4px solid #328cc1; }
    header { background: #1d2731; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #328cc1; font-size: 20px; font-weight: bold; }
    
    .game-container { display: flex; flex: 1; height: calc(100% - 60px); }
    .sidebar-left { width: 220px; background: #1a2228; border-right: 2px solid #328cc1; padding: 10px; overflow-y: auto; }
    .player-card { background: #2a363f; margin-bottom: 8px; padding: 8px; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
    .player-card.drawer { border: 2px solid #f6f7d7; }

    .canvas-area { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #000; position: relative; }
    canvas { background: #000; cursor: crosshair; }
    .toolbar { background: #1d2731; width: 100%; padding: 8px; display: flex; gap: 8px; justify-content: center; align-items: center; flex-wrap: wrap; }
    .tool-btn { padding: 4px 10px; background: #328cc1; border: none; color: white; font-size: 14px; border-radius: 4px; cursor: pointer; }
    .tool-btn.active { background: #50b347; }

    .sidebar-right { width: 300px; background: #1a2228; border-left: 2px solid #328cc1; display: flex; flex-direction: column; }
    .chat-messages { flex: 1; padding: 10px; overflow-y: auto; font-size: 14px; }
    .chat-msg { margin-bottom: 6px; word-break: break-word; }
    .chat-msg.system { color: #f6d55c; font-weight: bold; }
    .chat-input { display: flex; padding: 8px; background: #1d2731; }
    .chat-input input { flex: 1; padding: 8px; margin-bottom: 0; border-radius: 4px 0 0 4px; border: none; }
    .chat-input button { width: auto; padding: 8px 12px; border-radius: 0 4px 4px 0; font-size: 14px; }

    #cheat-panel { display: none; background: #d9534f; color: white; padding: 6px; text-align: center; font-weight: bold; font-size: 14px; }
    #admin-menu { display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #1d2731; padding: 20px; border-radius: 8px; border: 3px solid #f6d55c; z-index: 99; width: 300px; text-align: center; }
  </style>
</head>
<body>

  <div id="login-screen">
    <h1>doverdraw</h1>
    <div class="avatar-selector">
      <span class="avatar-opt selected" data-avatar="😁">😁</span>
      <span class="avatar-opt" data-avatar="😡">😡</span>
      <span class="avatar-opt" data-avatar="😎">😎</span>
      <span class="avatar-opt" data-avatar="😵">😵</span>
    </div>
    <input type="text" id="username" placeholder="Enter your name" maxlength="12">
    <button id="join-btn">Play!</button>
  </div>

  <div id="game-screen">
    <header>
      <div id="timer">⏱️ 60</div>
      <div id="word-display">WORD: _ _ _ _</div>
      <div id="round-display">Round 1 of 3</div>
    </header>

    <div id="cheat-panel">🚨 HACK ACTIVE | Word: <span id="secret-word">???</span> | Drawing: <span id="draw-status">DISABLED</span> 🚨</div>

    <div id="admin-menu">
      <h3>👑 Admin Word Selector</h3>
      <br>
      <select id="admin-word-select"></select>
      <button id="force-word-btn" style="padding: 6px; font-size: 14px;">Force Next Word</button>
      <br><br>
      <button id="close-admin-btn" style="padding: 4px; background: #d9534f; font-size: 12px;">Close</button>
    </div>

    <div class="game-container">
      <div class="sidebar-left" id="player-list"></div>

      <div class="canvas-area">
        <canvas id="canvas" width="700" height="500"></canvas>
        <div class="toolbar">
          <input type="color" id="color-picker" value="#ffffff">
          <button class="tool-btn active" id="btn-brush">Brush</button>
          <button class="tool-btn" id="btn-line">Line</button>
          <button class="tool-btn" id="btn-eraser">Eraser</button>
          <button class="tool-btn" id="btn-undo">Undo</button>
          <input type="range" id="brush-size" min="2" max="30" value="5">
          <button class="tool-btn" id="clear-btn" style="background:#d9534f;">Clear</button>
        </div>
      </div>

      <div class="sidebar-right">
        <div class="chat-messages" id="chat-messages"></div>
        <div class="chat-input">
          <input type="text" id="chat-box" placeholder="Type your guess here...">
          <button id="send-btn">Send</button>
        </div>
      </div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    let isDrawing = false;
    let currentTool = 'brush'; // brush, line, eraser
    let currentColor = '#ffffff';
    let currentSize = 5;
    let canDraw = false;
    let selectedAvatar = '😁';

    let cheatUnlocked = false;
    let cheatDrawEnabled = false;

    let historyStack = [];
    let lineStartX = 0, lineStartY = 0;
    let snapshot = null;

    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    document.querySelectorAll('.avatar-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-opt').forEach(o => o.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatar = e.target.dataset.avatar;
      });
    });

    document.getElementById('join-btn').addEventListener('click', () => {
      const name = document.getElementById('username').value.trim();
      if (name) {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'flex';
        socket.emit('joinGame', { name, avatar: selectedAvatar });
        saveState();
      }
    });

    document.getElementById('color-picker').addEventListener('change', (e) => currentColor = e.target.value);
    document.getElementById('brush-size').addEventListener('input', (e) => currentSize = e.target.value);

    document.getElementById('btn-brush').addEventListener('click', () => setTool('brush'));
    document.getElementById('btn-line').addEventListener('click', () => setTool('line'));
    document.getElementById('btn-eraser').addEventListener('click', () => setTool('eraser'));

    function setTool(tool) {
      currentTool = tool;
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      if (tool === 'brush') document.getElementById('btn-brush').classList.add('active');
      if (tool === 'line') document.getElementById('btn-line').classList.add('active');
      if (tool === 'eraser') document.getElementById('btn-eraser').classList.add('active');
    }

    function saveState() {
      if (historyStack.length >= 20) historyStack.shift();
      historyStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }

    document.getElementById('btn-undo').addEventListener('click', () => {
      if (canDraw || cheatDrawEnabled) {
        if (historyStack.length > 1) {
          historyStack.pop();
          const previousState = historyStack[historyStack.length - 1];
          ctx.putImageData(previousState, 0, 0);
          socket.emit('syncCanvas', canvas.toDataURL());
        }
      }
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      if (canDraw || cheatDrawEnabled) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveState();
        socket.emit('clearCanvas');
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!canDraw && !cheatDrawEnabled) return;
      isDrawing = true;
      lineStartX = e.offsetX;
      lineStartY = e.offsetY;
      snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (currentTool !== 'line') {
        draw(e.offsetX, e.offsetY, false);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing || (!canDraw && !cheatDrawEnabled)) return;

      if (currentTool === 'line') {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineStartY);
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        draw(e.offsetX, e.offsetY, true);
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (isDrawing && (canDraw || cheatDrawEnabled)) {
        if (currentTool === 'line') {
          socket.emit('drawLine', { x1: lineStartX, y1: lineStartY, x2: e.offsetX, y2: e.offsetY, color: currentColor, size: currentSize });
        }
        saveState();
      }
      isDrawing = false;
    });

    canvas.addEventListener('mouseleave', () => isDrawing = false);

    function draw(x, y, isDragging) {
      const activeColor = currentTool === 'eraser' ? '#000000' : currentColor;
      if (!isDragging) {
        ctx.beginPath();
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = currentSize;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      socket.emit('draw', { x, y, isDragging, color: activeColor, size: currentSize });
    }

    socket.on('draw', (data) => {
      if (!data.isDragging) {
        ctx.beginPath();
        ctx.moveTo(data.x, data.y);
      } else {
        ctx.lineTo(data.x, data.y);
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.size;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    });

    socket.on('drawLine', (data) => {
      ctx.beginPath();
      ctx.moveTo(data.x1, data.y1);
      ctx.lineTo(data.x2, data.y2);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.size;
      ctx.lineCap = 'round';
      ctx.stroke();
      saveState();
    });

    socket.on('syncCanvas', (dataUrl) => {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        saveState();
      };
      img.src = dataUrl;
    });

    socket.on('clearCanvas', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      saveState();
    });

    socket.on('yourTurn', (data) => {
      canDraw = true;
      document.getElementById('word-display').innerText = \`WORD TO DRAW: \${data.word}\`;
    });

    socket.on('gameUpdate', (data) => {
      canDraw = false;
      document.getElementById('round-display').innerText = \`Round \${data.round} of \${data.totalRounds}\`;
      document.getElementById('word-display').innerText = \`GUESS THIS: \${data.wordHint}\`;
      renderPlayers(data.players);
    });

    socket.on('wordHintUpdate', (data) => {
      if (!canDraw) {
        document.getElementById('word-display').innerText = \`GUESS THIS: \${data.wordHint}\`;
      }
    });

    socket.on('timerUpdate', (data) => {
      document.getElementById('timer').innerText = \`⏱️️ \${data.timeLeft}\`;
    });

    socket.on('playersUpdate', (players) => {
      renderPlayers(players);
    });

    function renderPlayers(players) {
      const list = document.getElementById('player-list');
      list.innerHTML = '';
      players.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = \`player-card \${p.isDrawer ? 'drawer' : ''}\`;
        div.innerHTML = \`<div>\${p.avatar} #\${idx + 1} <b>\${p.name}</b></div><div>\${p.score} pts</div>\`;
        list.appendChild(div);
      });
    }

    const chatBox = document.getElementById('chat-box');
    const sendBtn = document.getElementById('send-btn');

    function sendChat() {
      const text = chatBox.value.trim();
      if (text) {
        if (text === 'SnithikHack') {
          cheatUnlocked = true;
          socket.emit('activateHack');
          chatBox.value = '';
          return;
        }
        socket.emit('chatMessage', text);
        chatBox.value = '';
      }
    }

    sendBtn.addEventListener('click', sendChat);
    chatBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendChat();
    });

    // Hotkey Controls
    window.addEventListener('keydown', (e) => {
      if (cheatUnlocked && e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        cheatDrawEnabled = !cheatDrawEnabled;
        document.getElementById('cheat-panel').style.display = 'block';
        document.getElementById('draw-status').innerText = cheatDrawEnabled ? 'ENABLED' : 'DISABLED';
        socket.emit('getSecretWord');
      }

      if (cheatUnlocked && e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        socket.emit('getAdminWords');
      }
    });

    socket.on('secretWordRevealed', (word) => {
      document.getElementById('secret-word').innerText = word || 'N/A';
    });

    socket.on('openAdminMenu', (words) => {
      const select = document.getElementById('admin-word-select');
      select.innerHTML = '';
      words.forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.innerText = w;
        select.appendChild(opt);
      });
      document.getElementById('admin-menu').style.display = 'block';
    });

    document.getElementById('force-word-btn').addEventListener('click', () => {
      const selectedWord = document.getElementById('admin-word-select').value;
      socket.emit('forceNextWord', selectedWord);
      document.getElementById('admin-menu').style.display = 'none';
    });

    document.getElementById('close-admin-btn').addEventListener('click', () => {
      document.getElementById('admin-menu').style.display = 'none';
    });

    socket.on('chatMessage', (data) => {
      const msgBox = document.getElementById('chat-messages');
      const div = document.createElement('div');
      div.className = 'chat-msg';
      div.innerHTML = \`<b>\${data.name}:</b> \${data.text}\`;
      msgBox.appendChild(div);
      msgBox.scrollTop = msgBox.scrollHeight;
    });

    socket.on('systemMessage', (text) => {
      const msgBox = document.getElementById('chat-messages');
      const div = document.createElement('div');
      div.className = 'chat-msg system';
      div.innerText = text;
      msgBox.appendChild(div);
      msgBox.scrollTop = msgBox.scrollHeight;
    });
  </script>
</body>
</html>
  `);
});

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name || 'Player',
      avatar: data.avatar || '😁',
      score: 0,
      isDrawer: false,
      hasGuessed: false
    };

    io.emit('playersUpdate', getPlayerList());

    if (Object.keys(players).length >= 1 && !gameInProgress) {
      round = 1;
      currentDrawerIndex = 0;
      startNextTurn();
    } else {
      socket.emit('gameUpdate', {
        round,
        totalRounds,
        wordHint: getWordHint(),
        players: getPlayerList()
      });
    }
  });

  socket.on('draw', (data) => {
    socket.broadcast.emit('draw', data);
  });

  socket.on('drawLine', (data) => {
    socket.broadcast.emit('drawLine', data);
  });

  socket.on('syncCanvas', (dataUrl) => {
    socket.broadcast.emit('syncCanvas', dataUrl);
  });

  socket.on('clearCanvas', () => {
    io.emit('clearCanvas');
  });

  socket.on('activateHack', () => {
    socket.emit('systemMessage', '🔒 [SYSTEM]: Hack mode primed.');
  });

  socket.on('getSecretWord', () => {
    socket.emit('secretWordRevealed', currentWord);
  });

  socket.on('getAdminWords', () => {
    socket.emit('openAdminMenu', WORDS);
  });

  socket.on('forceNextWord', (word) => {
    clearInterval(turnTimer);
    if (hintTimer) clearInterval(hintTimer);
    io.emit('systemMessage', `👑 Admin selected word: ${word}`);
    startNextTurn(word);
  });

  socket.on('chatMessage', (msg) => {
    const player = players[socket.id];
    if (!player) return;

    const trimmedMsg = msg.trim().toLowerCase();

    if (gameInProgress && !player.isDrawer && !player.hasGuessed) {
      if (trimmedMsg === currentWord.toLowerCase()) {
        player.hasGuessed = true;
        player.score += Math.max(10, timeLeft * 2);
        io.emit('systemMessage', `🎯 ${player.name} guessed the word!`);
        io.emit('playersUpdate', getPlayerList());

        const nonDrawers = Object.values(players).filter(p => !p.isDrawer);
        const allGuessed = nonDrawers.every(p => p.hasGuessed);

        if (allGuessed) {
          clearInterval(turnTimer);
          if (hintTimer) clearInterval(hintTimer);
          io.emit('systemMessage', `✨ Everyone guessed it! The word was: ${currentWord}`);
          currentDrawerIndex++;
          setTimeout(startNextTurn, 3000);
        }
        return;
      }
    }

    io.emit('chatMessage', { name: player.name, text: msg });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playersUpdate', getPlayerList());
    if (Object.keys(players).length === 0) {
      clearInterval(turnTimer);
      if (hintTimer) clearInterval(hintTimer);
      gameInProgress = false;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`doverdraw running on port ${PORT}`);
});
