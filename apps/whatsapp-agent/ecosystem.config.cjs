module.exports = {
  apps: [
    {
      name: "re7-whatsapp-agent",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PORT: process.env.PORT || "3001",
      },
    },
  ],
};
