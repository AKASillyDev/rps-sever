// Rock Paper Scissors Game Server
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Store active games
const games = {};

// Generate random 6-digit game code
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Make sure code doesn't already exist
  if (games[code]) {
    return generateGameCode();
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new game
  socket.on('createGame', (data) => {
    const gameId = generateGameCode();
    
    games[gameId] = {
      id: gameId,
      player1: {
        socketId: socket.id,
        name: data.playerName,
        choice: null
      },
      player2: {
        socketId: null,
        name: null,
        choice: null
      },
      round: 1
    };

    socket.join(gameId);
    socket.emit('gameCreated', { gameId: gameId });
    console.log('Game created:', gameId);
  });

  // Join existing game
  socket.on('joinGame', (data) => {
    const game = games[data.gameId];
    
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    if (game.player2.socketId) {
      socket.emit('error', 'Game is full');
      return;
    }

    game.player2.socketId = socket.id;
    game.player2.name = data.playerName;

    socket.join(data.gameId);
    
    // Notify both players
    socket.emit('gameJoined', { gameState: game });
    socket.to(data.gameId).emit('playerJoined', { gameState: game });
    
    console.log('Player joined game:', data.gameId);
  });

  // Player makes a choice
  socket.on('makeChoice', (data) => {
    const game = games[data.gameId];
    
    if (!game) {
      socket.emit('error', 'Game not found');
      return;
    }

    // Update player choice
    if (data.playerNumber === 1) {
      game.player1.choice = data.choice;
    } else {
      game.player2.choice = data.choice;
    }

    // Broadcast to all players in the game
    io.to(data.gameId).emit('choiceMade', { gameState: game });
    
    console.log('Choice made in game:', data.gameId);
  });

  // Play again
  socket.on('playAgain', (data) => {
    const game = games[data.gameId];
    
    if (!game) return;

    // Reset choices
    game.player1.choice = null;
    game.player2.choice = null;
    game.round += 1;

    io.to(data.gameId).emit('gameReset');
    console.log('Game reset:', data.gameId);
  });

  // Leave game
  socket.on('leaveGame', (data) => {
    if (data.gameId && games[data.gameId]) {
      delete games[data.gameId];
      socket.to(data.gameId).emit('opponentLeft');
      console.log('Game deleted:', data.gameId);
    }
    socket.leave(data.gameId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    // Find and clean up any games this player was in
    for (let gameId in games) {
      const game = games[gameId];
      if (game.player1.socketId === socket.id || game.player2.socketId === socket.id) {
        io.to(gameId).emit('opponentLeft');
        delete games[gameId];
        console.log('Game cleaned up:', gameId);
      }
    }
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Rock Paper Scissors Server is running! Active games: ' + Object.keys(games).length);
});

http.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
