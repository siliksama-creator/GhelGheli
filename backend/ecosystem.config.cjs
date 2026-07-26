// PM2 process definition.
//
// NOTE ON CLUSTER MODE: this app must stay `fork` with ONE instance. The
// games engine keeps live rooms, matchmaking queues and solo runs in plain
// in-memory Maps (backend/src/games/engine.js, games/solo.js). Running two
// workers would put two players in two different processes' queues and they
// would never be matched — and a socket reconnecting to the other worker
// would find its room gone. Scaling out needs a Redis adapter for Socket.IO
// plus shared state first; until then a single process is the CORRECT
// choice, not an oversight. Measured headroom: ~1000 concurrent active
// users at 10ms p50 on the current 2-vCPU / 4GB VPS.
module.exports = {
  apps: [{
    name: 'ghelgheli-api',
    script: 'src/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    // A leak or a runaway upload should recycle the process rather than
    // trigger the kernel OOM killer, which would take Postgres with it.
    max_memory_restart: '900M',
    // Node's default heap on a small box is conservative; the image
    // pipeline (sharp) and the socket table both want more headroom.
    node_args: '--max-old-space-size=1024',
    env: { NODE_ENV: 'production' },
    // Never spin-restart a process that is crash-looping on boot.
    exp_backoff_restart_delay: 200,
    max_restarts: 15,
  }]
};
