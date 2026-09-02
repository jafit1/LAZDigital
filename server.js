const express = require('express');
const path = require('path');
const rpcHandler = require('./api/rpc.js');

const app = express();
const DEFAULT_PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'src/public')));

// Mount RPC endpoint
app.post('/api/rpc', (req, res) => {
  rpcHandler(req, res);
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'src/public/index.html'));
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 LAZ Digital Local Server running at:`);
    console.log(`👉 http://localhost:${port}`);
    console.log(`==================================================\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(Number(DEFAULT_PORT));
