// ตั้งค่าสี Tailwind ให้ตรงกับโทนกระดาษอุ่นและ terracotta ของธีม Minimalist Art
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        display: ['"Noto Serif Thai"', 'serif'],
        sans: ['"IBM Plex Sans Thai"', 'system-ui', 'sans-serif'],
      },
      colors: {
        rsu: { 50: '#F8F3EF', 100: '#EFE2DA', 200: '#DEC6B9', 400: '#BF8068', 600: '#A34E35', 700: '#823D2D', 800: '#653026' },
        ink: { 50: '#F2F0EA', 100: '#E2DED4', 300: '#AAA59A', 500: '#6C6A62', 700: '#46443E', 900: '#25251F' },
      },
    },
  },
};
