module.exports = {
  apps: [
    {
      name: 'amanzi-ats-backend',
      script: 'npm',
      args: 'run start',
      cwd: './backend',
      instances: 'max', // Scale across all available CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
      },
      env_staging: {
        NODE_ENV: 'production',
        APP_ENV: 'staging'
      },
      env_production: {
        NODE_ENV: 'production',
        APP_ENV: 'production'
      },
      // Graceful shutdown settings
      kill_timeout: 10000,
      wait_ready: true, // PM2 will wait for process.send('ready')
      listen_timeout: 8000,
    },
    {
      name: 'amanzi-ats-python-worker',
      script: 'uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8001 --workers 4',
      cwd: './python-worker',
      interpreter: 'python3', // Requires Python3 installed globally or venv activated
      instances: 1, // Uvicorn manages its own workers via `--workers 4`
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        ENVIRONMENT: 'development',
      },
      env_staging: {
        ENVIRONMENT: 'staging',
      },
      env_production: {
        ENVIRONMENT: 'production',
      }
    }
  ]
};
