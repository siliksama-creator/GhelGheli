module.exports = {
  apps: [{
    name: 'ghelgheli-api',
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: { NODE_ENV: 'production' }
  }]
};
