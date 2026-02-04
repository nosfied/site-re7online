module.exports = {
  apps: [
    {
      name: "re7-whatsapp-agent",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.PORT || "3001",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3001",
      },
    },
  ],
};
