import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/*/src/**/*.{ts,tsx}',

  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#F5F2EC',
        surface: '#FFFFFF',
        surface2: '#F0EDE6',
        border: '#E2DDD6',
        text: '#1A1714',
        text2: '#6B6560',
        text3: '#9B9590',
        accent: {
          DEFAULT: '#2D5F3F',
          light: '#EAF2ED',
        },
        danger: {
          DEFAULT: '#C84B31',
          light: '#FAEAE6',
        },
        warning: {
          DEFAULT: '#E8A020',
          light: '#FDF4E3',
        },
        info: {
          DEFAULT: '#2B4C7E',
          light: '#E8EDF5',
        },
      },
    },
  },
  plugins: [],
};

export default config;
