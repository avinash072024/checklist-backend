const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const compression = require('compression');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const checklistRoutes = require('./routes/checklistRoutes');

dotenv.config();

connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/checklists', checklistRoutes);

// Base route for testing
app.get('/', (req, res) => {
  res.send({success: true, message: 'Checklist API is running...' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port: http://localhost:${PORT}`));