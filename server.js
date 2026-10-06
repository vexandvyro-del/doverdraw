const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

// Serve static frontend files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

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
  io.emit('systemMessage', players[drawerId].name + ' is choosing a word!');

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
  io.emit('systemMessage', players[drawerId].name + ' is drawing now!');

  turnTimer = setInterval(() => {
    timeLeft--;
    io.emit('timerUpdate', { timeLeft });

    if (timeLeft <= 0) {
      endTurn("Time's up! The word was: " + currentWord);
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
          endTurn('Everyone guessed the word! It was: ' + currentWord);
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
