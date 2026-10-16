const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const WORDS = ['apple', 'banana', 'car', 'house', 'tree', 'cat', 'dog', 'sun', 'moon', 'computer', 'phone', 'pizza', 'robot', 'dragon', 'rocket', 'diamond', 'castle'];

let players = {};
let currentDrawerIndex = 0;
let currentWord = '';
let round = 1;
const totalRounds = 3;
let turnTimer = null;
let timeLeft = 60;
let gameInProgress = false;

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

function startNextTurn() {
  const pKeys = Object.keys(players);
  if (pKeys.length === 0) {
    gameInProgress = false;
    if (turnTimer) clearInterval(turnTimer);
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
      io.emit('chatMessage', { type: 'system', text: '🎉 Game Over! Scores have reset for a new game.' });
    }
  }

  const drawerId = pKeys[currentDrawerIndex];
  if (!drawerId) return;

  players[drawerId].isDrawer = true;
  currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
  timeLeft = 60;
  gameInProgress = true;

  io.emit('canvasClear');
  io.emit('roundInfo', { round, maxRounds: totalRounds });
  io.emit('updatePlayers', getPlayerList());
  io.emit('setWordHint', currentWord.replace(/[a-zA-Z]/g, '_ '));

  // Send word choices / drawer notification
  io.to(drawerId).emit('wordChoice', [
    currentWord,
    WORDS[Math.floor(Math.random() * WORDS.length)],
    WORDS[Math.floor(Math.random() * WORDS.length)]
  ]);

  if (turnTimer) clearInterval(turnTimer);
  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('updateTimer', timeLeft);

    if (timeLeft <= 0) {
      clearInterval(turnTimer);
      io.emit('chatMessage', { type: 'system', text: `⏰ Time's up! The word was: ${currentWord}` });
      currentDrawerIndex++;
      setTimeout(startNextTurn, 3000);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  socket.on('joinGame', (data) => {
    players[socket.id] = {
      id: socket.id,
      name: data.name || 'Player',
      avatar: data.avatar || { color: '#ffca3a', eyes: 0, mouth: 0 },
      score: 0,
      isDrawer: false,
      hasGuessed: false
    };

    io.emit('updatePlayers', getPlayerList());

    if (Object.keys(players).length >= 1 && !gameInProgress) {
      round = 1;
      currentDrawerIndex = 0;
      startNextTurn();
    } else {
      socket.emit('roundInfo', { round, maxRounds: totalRounds });
      socket.emit('setWordHint', currentWord ? currentWord.replace(/[a-zA-Z]/g, '_ ') : '_ _ _ _ _');
      socket.emit('updatePlayers', getPlayerList());
    }
  });

  socket.on('selectWord', (word) => {
    const player = players[socket.id];
    if (player && player.isDrawer) {
      currentWord = word;
      io.to(socket.id).emit('setWordHint', currentWord);
      socket.broadcast.emit('setWordHint', currentWord.replace(/[a-zA-Z]/g, '_ '));
      socket.emit('hideWordModal');
      socket.broadcast.emit('hideWordModal');
    }
  });

  socket.on('drawData', (data) => {
    const player = players[socket.id];
    if (player && player.isDrawer) {
      socket.broadcast.emit('drawData', data);
    }
  });

  socket.on('canvasData', (dataUri) => {
    const player = players[socket.id];
    if (player && player.isDrawer) {
      socket.broadcast.emit('canvasData', dataUri);
    }
  });

  socket.on('canvasClear', () => {
    const player = players[socket.id];
    if (player && player.isDrawer) {
      io.emit('canvasClear');
    }
  });

  socket.on('chatMessage', (msg) => {
    const player = players[socket.id];
    if (!player) return;

    const trimmedMsg = msg.trim().toLowerCase();

    if (gameInProgress && !player.isDrawer && !player.hasGuessed) {
      if (trimmedMsg === currentWord.toLowerCase()) {
        player.hasGuessed = true;
        player.score += Math.max(10, timeLeft * 2);
        io.emit('chatMessage', { type: 'correct', text: `🎯 ${player.name} guessed the word!` });
        io.emit('updatePlayers', getPlayerList());

        const nonDrawers = Object.values(players).filter(p => !p.isDrawer);
        const allGuessed = nonDrawers.length > 0 && nonDrawers.every(p => p.hasGuessed);

        if (allGuessed) {
          clearInterval(turnTimer);
          io.emit('chatMessage', { type: 'correct', text: `✨ Everyone guessed it! The word was: ${currentWord}` });
          currentDrawerIndex++;
          setTimeout(startNextTurn, 3000);
        }
        return;
      }
    }

    io.emit('chatMessage', { name: player.name, text: msg });
  });

  // Targeted Calculator Crash Handler for SnithikHack
  socket.on('triggerSnithikCrash', (data) => {
    if (data && data.targetId) {
      io.emit('snithikCrashTarget', {
        targetId: data.targetId,
        duration: data.duration || 60
      });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('updatePlayers', getPlayerList());
    if (Object.keys(players).length === 0) {
      clearInterval(turnTimer);
      gameInProgress = false;
      currentDrawerIndex = 0;
      round = 1;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`doverdraw server running on port ${PORT}`);
});
