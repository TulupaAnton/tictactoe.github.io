import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
})

const rooms = new Map()

io.on('connection', socket => {
  let currentRoom = null
  let playerRole = null // 'X' или 'O'

  socket.on('createRoom', roomId => {
    rooms.set(roomId, {
      board: Array(9).fill(null),
      players: [socket.id],
      messages: [],
      currentTurn: 'X',
      creator: socket.id
    })
    socket.join(roomId)
    currentRoom = roomId
    playerRole = 'X'
    socket.emit('playerRole', 'X')
    socket.emit('yourTurn', true)
  })

  socket.on('joinRoom', roomId => {
    const room = rooms.get(roomId)
    if (!room || room.players.length >= 2) {
      socket.emit('roomFull')
      return
    }

    room.players.push(socket.id)
    socket.join(roomId)
    currentRoom = roomId
    playerRole = 'O'
    socket.emit('playerRole', 'O')
    socket.emit('yourTurn', false)

    io.to(roomId).emit('gameState', room.board)
    io.to(room.players[0]).emit('yourTurn', true)
  })

  socket.on('makeMove', ({ roomId, index }) => {
    const room = rooms.get(roomId)
    if (!room || !room.players.includes(socket.id)) return

    const expectedPlayer = room.currentTurn
    if (playerRole !== expectedPlayer) {
      socket.emit('invalidMove', 'Не ваш ход!')
      return
    }

    if (room.board[index] || calculateWinner(room.board)) return

    room.board[index] = playerRole
    room.currentTurn = playerRole === 'X' ? 'O' : 'X'

    io.to(roomId).emit('gameState', room.board)

    const winner = calculateWinner(room.board)
    if (winner) {
      io.to(roomId).emit('winner', winner)

      // Запускаем таймер для автоматического перезапуска
      setTimeout(() => {
        if (rooms.has(roomId)) {
          const room = rooms.get(roomId)
          room.board = Array(9).fill(null)

          room.currentTurn = winner === 'X' ? 'O' : 'X'

          io.to(roomId).emit('gameState', room.board)
          io.to(roomId).emit('winner', null)

          const nextPlayer =
            room.currentTurn === 'X' ? room.players[0] : room.players[1]
          io.to(nextPlayer).emit('yourTurn', true)
          io.to(room.players.find(id => id !== nextPlayer)).emit(
            'yourTurn',
            false
          )
        }
      }, 5000)
    } else {
      const nextPlayer =
        room.currentTurn === 'X' ? room.players[0] : room.players[1]
      io.to(nextPlayer).emit('yourTurn', true)
      io.to(room.players.find(id => id !== nextPlayer)).emit('yourTurn', false)
    }
  })

  socket.on('continueGame', roomId => {
    const room = rooms.get(roomId)
    if (!room) return

    room.board = Array(9).fill(null)

    io.to(roomId).emit('gameState', room.board)
    io.to(roomId).emit('winner', null)

    const firstPlayer =
      room.currentTurn === 'X' ? room.players[0] : room.players[1]
    io.to(firstPlayer).emit('yourTurn', true)
    io.to(room.players.find(id => id !== firstPlayer)).emit('yourTurn', false)
  })

  socket.on('sendMessage', ({ roomId, user, text }) => {
    const room = rooms.get(roomId)
    if (!room) return

    const message = { user, text }
    room.messages.push(message)
    io.to(roomId).emit('newMessage', message)
  })

  socket.on('disconnect', () => {
    if (currentRoom) {
      const room = rooms.get(currentRoom)
      if (room) {
        room.players = room.players.filter(id => id !== socket.id)
        if (room.players.length === 0) {
          rooms.delete(currentRoom)
        } else {
          io.to(currentRoom).emit('opponentDisconnected')
        }
      }
    }
  })
})

function calculateWinner (squares) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // горизонтали
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // вертикали
    [0, 4, 8],
    [2, 4, 6] // диагонали
  ]

  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return squares[a]
    }
  }
  return null
}

const PORT = 3001
server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`)
})
