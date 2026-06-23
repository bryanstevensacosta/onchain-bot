/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bc: {
          ingestion: '#3b82f6',
          extraction: '#8b5cf6',
          parsing: '#a855f7',
          normalization: '#ec4899',
          'chain-detection': '#f59e0b',
          enrichment: '#10b981',
          classification: '#06b6d4',
          scoring: '#eab308',
          filters: '#f97316',
          honeypot: '#ef4444',
          publishing: '#22c55e',
          analytics: '#64748b',
        },
      },
    },
  },
  plugins: [],
};
