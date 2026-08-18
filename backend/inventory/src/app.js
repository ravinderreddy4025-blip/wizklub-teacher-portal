const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const apiRoutes = require('./routes');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

const corsOptions = env.nodeEnv === 'production'
  ? {
      origin: env.frontendUrl,
      credentials: true,
    }
  : undefined;

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Static uploads (backend/uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/', (req, res) => {
  res.send('Wizklub Inventory Management System API is running.');
});

// API routes — MVC: routes → controllers → models/services
app.use('/api', apiRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
