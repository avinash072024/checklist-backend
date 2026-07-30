const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const checklistRoutes = require('./routes/checklistRoutes');

dotenv.config();

connectDB();

const app = express();
const server = http.createServer(app);

// Socket.IO setup — allows same origin and the Angular dev server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Make io accessible in controllers via app.locals
app.locals.io = io;

io.on('connection', (socket) => {
  // console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    // console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/checklists', checklistRoutes);

// Base route for testing
app.get('/', (req, res) => {
  res.send({ success: true, message: 'Checklist API is running...' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port: http://localhost:${PORT}`));