const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const WORDS = [
  'apple', 'banana', 'cat', 'dog', 'house', 'car', 'tree', 'sun', 'fish', 'book',
  'guitar', 'computer', 'pizza', 'rocket', 'castle', 'island', 'bridge', 'phone',
  'bicycle', 'camera', 'penguin', 'robot', 'dragon', 'volcano', 'umbrella'
];

let players = [];
let currentDrawerIndex = 0;
let currentWord = '';
let secretHint = '';
let roundTimer = 60;
let timerInterval = null;
let gameState = 'waiting'; // waiting, choosing, drawing, ended
let roundNumber = 1;
const maxRounds = 3;

function getRandomWords(count = 3) {
  const shuffled = [...WORDS].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function broadcastPlayers() {
  io.emit('updatePlayers', players.map((p, idx) => ({
    name: p.name,
    score: p.score,
    avatar: p.avatar,
    isDrawer: idx === currentDrawerIndex && gameState === 'drawing'
  })));
}

function startChoosingPhase() {
  gameState = 'choosing';
  clearInterval(timerInterval);
  roundTimer = 15;

  if (players.length === 0) {
    gameState = 'waiting';
    return;
  }

  if (currentDrawerIndex >= players.length) {
    currentDrawerIndex = 0;
    roundNumber++;
    if (roundNumber > maxRounds) {
      io.emit('chatMessage', { type: 'system', text: 'Game Over! Thanks for playing.' });
      gameState = 'waiting';
      return;
    }
  }

  io.emit('roundInfo', { round: roundNumber, maxRounds });
  broadcastPlayers();
  io.emit('canvasClear');

  const drawer = players[currentDrawerIndex];
  if (!drawer) return;

  const choices = getRandomWords(3);
  io.to(drawer.id).emit('wordChoice', choices);
  io.emit('setWordHint', '_ _ _ _ _');
  io.emit('chatMessage', { type: 'system', text: `${drawer.name} is choosing a word...` });

  timerInterval = setInterval(() => {
    roundTimer--;
    io.emit('updateTimer', roundTimer);
    if (roundTimer <= 0) {
      clearInterval(timerInterval);
      // Auto pick first word if drawer times out
      startDrawingPhase(choices[0]);
    }
  }, 1000);
}

function startDrawingPhase(word) {
  gameState = 'drawing';
  currentWord = word.toLowerCase();
  clearInterval(timerInterval);
  roundTimer = 60;

  secretHint = currentWord.split('').map(c => c === ' ' ? ' ' : '_').join(' ');
  io.emit('setWordHint', secretHint);
  io.emit('hideWordModal');

  const drawer = players[currentDrawerIndex];
  io.emit('chatMessage', { type: 'system', text: `Round started! Draw: ${currentWord} (for drawer only)` });

  // Send hint length to non-drawers
  players.forEach((p, idx) => {
    if (idx === currentDrawerIndex) {
      io.to(p.id).emit('setWordHint', currentWord);
    } else {
      io.to(p.id).emit('setWordHint', secretHint);
    }
  });

  timerInterval = setInterval(() => {
    roundTimer--;
    io.emit('updateTimer', roundTimer);

    // Reveal a hint character every 20 seconds
    if (roundTimer === 40 || roundTimer === 20) {
      revealHintChar();
    }

    if (roundTimer <= 0) {
      clearInterval(timerInterval);
      io.emit('chatMessage', { type: 'system', text: `Time is up! The word was: ${currentWord}` });
      setTimeout(nextTurn, 3000);
    }
  }, 1000);
}

function revealHintChar() {
  const chars = secretHint.split(' ');
  const unrevealedIndices = [];
  chars.forEach((c, i) => {
    if (c === '_') unrevealedIndices.push(i);
  });

  if (unrevealedIndices.length > 1) {
    const randIdx = unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)];
    chars[randIdx] = currentWord[randIdx];
    secretHint = chars.join(' ');
    players.forEach((p, idx) => {
      if (idx !== currentDrawerIndex) {
        io.to(p.id).emit('setWordHint', secretHint);
      }
    });
  }
}

function nextTurn() {
  currentDrawerIndex++;
  startChoosingPhase();
}

io.on('connection', (socket) => {
  socket.on('joinGame', ({ name, avatar }) => {
    players.push({
      id: socket.id,
      name: name || 'Player',
      score: 0,
      avatar: avatar || { color: '#ffca3a', eyes: 0, mouth: 0 }
    });

    broadcastPlayers();
    io.emit('chatMessage', { type: 'system', text: `${name} joined the game.` });

    if (gameState === 'waiting' && players.length >= 2) {
      roundNumber = 1;
      currentDrawerIndex = 0;
      startChoosingPhase();
    } else if (gameState === 'waiting' && players.length === 1) {
      socket.emit('chatMessage', { type: 'system', text: 'Waiting for at least one more player to start!' });
    }
  });

  socket.on('selectWord', (word) => {
    if (players[currentDrawerIndex] && players[currentDrawerIndex].id === socket.id) {
      startDrawingPhase(word);
    }
  });

  socket.on('drawData', (data) => {
    socket.broadcast.emit('drawData', data);
  });

  socket.on('canvasData', (dataUri) => {
    socket.broadcast.emit('canvasData', dataUri);
  });

  socket.on('canvasClear', () => {
    socket.broadcast.emit('canvasClear');
  });

  socket.on('chatMessage', (text) => {
    const player = players.find(p => p.id === socket.id);
    if (!player) return;

    const isDrawer = players[currentDrawerIndex] && players[currentDrawerIndex].id === socket.id;

    if (gameState === 'drawing' && !isDrawer && text.trim().toLowerCase() === currentWord) {
      io.emit('chatMessage', { type: 'correct', text: `${player.name} guessed the word correctly!` });
      player.score += 10;
      broadcastPlayers();
      clearInterval(timerInterval);
      setTimeout(nextTurn, 2500);
    } else {
      io.emit('chatMessage', { name: player.name, text });
    }
  });

  socket.on('disconnect', () => {
    const index = players.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      const removed = players.splice(index, 1)[0];
      io.emit('chatMessage', { type: 'system', text: `${removed.name} left the game.` });
      broadcastPlayers();

      if (players.length < 2) {
        clearInterval(timerInterval);
        gameState = 'waiting';
        io.emit('chatMessage', { type: 'system', text: 'Not enough players. Waiting for players...' });
      } else if (index === currentDrawerIndex) {
        nextTurn();
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
