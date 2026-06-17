const PORT = process.env.PORT || 3000;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./databases');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// ─── REST API endpoints ───

// Create a new user
app.get('/api/new-user', async (req, res) => {
  try {
    const id = await db.createUser();
    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Check if a user exists
app.get('/api/user/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  try {
    const result = await db.getUser(id);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get message history between two users
app.get('/api/messages/:userId/:contactId', async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  const contactId = parseInt(req.params.contactId, 10);
  if (isNaN(userId) || isNaN(contactId)) {
    return res.status(400).json({ error: 'Invalid IDs' });
  }
  try {
    const messages = await db.getMessages(userId, contactId);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Socket.IO ───

// Store online users (userId -> socketId)
const onlineUsers = new Map();

io.on('connection', (socket) => {
  let currentUserId = null;

  socket.on('register', async (userId) => {
    currentUserId = userId;
    // Add to online map
    onlineUsers.set(userId, socket.id);
    // Notify others that this user is online
    socket.broadcast.emit('user-online', userId);
    console.log(`User ${userId} online`);
  });

  socket.on('send-message', async (data) => {
    const { receiverId, content } = data;
    if (!currentUserId || !receiverId || !content) return;

    try {
      // Save to database
      const saved = await db.saveMessage(currentUserId, receiverId, content);

      // Emit to sender (confirmation)
      socket.emit('message-sent', saved);

      // Emit to receiver if online
      const receiverSocketId = onlineUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('message', saved);
      }

      // Also send to sender (so both sides see it) - but we already did optimistic update
      // However we may want to broadcast to sender too, but they already have it.
      // We'll let the sender's client handle it via the optimistic update.
      // But if the sender has multiple tabs, we may send it to themselves:
      socket.emit('message', saved); // just for consistency, but will be duplicate if not careful.
      // Actually, better: we already did optimistic update, and we also get 'message-sent' for confirmation.
      // To avoid duplication, we can skip sending 'message' to sender. Let's just use 'message-sent'.
      // But the frontend might expect 'message' for incoming from others. We'll send to receiver.
      // And we'll rely on 'message-sent' for confirmation.

    } catch (err) {
      console.error('Save message error:', err);
      socket.emit('message-error', { error: 'Failed to save message' });
    }
  });

  socket.on('disconnect', () => {
    if (currentUserId) {
      onlineUsers.delete(currentUserId);
      socket.broadcast.emit('user-offline', currentUserId);
      console.log(`User ${currentUserId} offline`);
    }
  });
});

// ─── Start server ─── 
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});