/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        re7: {
          navy: "#06132A",
          sky: "#7FC4E5",
          orange: "#FC6C16",
          amber: "#FE9807",
          gray: "#D2D3D5",
        },
      },
    },
  },
  plugins: [],
};
