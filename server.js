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
