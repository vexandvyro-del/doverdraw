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
      io.emit('systemMessage', '🎉 Game Over! Scores have reset for a new game.');
    }
  }

  const drawerId = pKeys[currentDrawerIndex];
  if (!drawerId) return;

  players[drawerId].isDrawer = true;
  currentWord = WORDS[Math.floor(Math.random() * WORDS.length)];
  timeLeft = 60;
  gameInProgress = true;

  io.emit('clearCanvas');
  io.emit('gameUpdate', {
    round,
    totalRounds,
    wordHint: currentWord.replace(/[a-zA-Z]/g, '_ '),
    players: getPlayerList()
  });

  io.to(drawerId).emit('yourTurn', { word: currentWord });

  if (turnTimer) clearInterval(turnTimer);
  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', { timeLeft });

    if (timeLeft <= 0) {
      clearInterval(turnTimer);
      io.emit('systemMessage', `⏰ Time's up! The word was: ${currentWord}`);
      currentDrawerIndex++;
      setTimeout(startNextTurn, 3000);
    }
  }, 1000);
}

io.on('connection', (socket) => {
  let triggerCount = 0;

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
        wordHint: currentWord ? currentWord.replace(/[a-zA-Z]/g, '_ ') : '',
        players: getPlayerList()
      });
    }
  });

  socket.on('draw', (data) => {
    const player = players[socket.id];
    if ((player && player.isDrawer) || data.isCheat) {
      socket.broadcast.emit('draw', data);
    }
  });

  socket.on('clearCanvas', () => {
    const player = players[socket.id];
    if (player && player.isDrawer) {
      io.emit('clearCanvas');
    }
  });

  socket.on('chatMessage', (msg) => {
    const player = players[socket.id];
    if (!player) return;

    const trimmedMsg = msg.trim().toLowerCase();

    // Trigger Cheat Code
    if (trimmedMsg === 'lil bro lil bro lil bro' || trimmedMsg === 'lil bro') {
      if (trimmedMsg === 'lil bro') triggerCount++;
      if (trimmedMsg === 'lil bro lil bro lil bro' || triggerCount >= 3) {
        socket.emit('enableCheat', { currentWord });
        socket.emit('systemMessage', '🚨 [CHEAT MENU ACTIVATED]: Word revealed & drawing unlocked!');
        return;
      }
    }

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
      gameInProgress = false;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`doverdraw server running on port ${PORT}`);
});
