/**
 * PM2: copy to repo root as ecosystem.config.cjs, edit paths, then:
 *   pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'parent-orientation-tracker',
      script: 'backend/server.js',
      cwd: '/home/ubuntu/parent-orientation',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      // App loads .env from cwd via dotenv (backend/src/bootstrap.js)
      error_file: '~/.pm2/logs/parent-orientation-error.log',
      out_file: '~/.pm2/logs/parent-orientation-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
