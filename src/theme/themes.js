// Bagliore radiale usato su bottone primario, card viaggio e tab/nav attiva:
// firma visiva condivisa delle superfici "accese" dal colore dell'ambiente.
export const ACCENT_GRADIENT = 'radial-gradient(130% 160% at 18% -10%, var(--accent), var(--accent2))'

export const THEMES = {
  mountain: { paper: '#F0EDE3', card: '#FBFAF4', ink: '#1C2721', muted: '#6E7B72', line: '#DED7C6', accent: '#B5502F', accent2: '#2F6B52', tint: '#E6E1D1' },
  sea: { paper: '#E9F0F1', card: '#F9FCFC', ink: '#11262F', muted: '#5D7A83', line: '#CDDDDF', accent: '#1F6E8C', accent2: '#D3982F', tint: '#DBE7E9' },
  city: { paper: '#EFEBEF', card: '#FBF9FB', ink: '#241F2B', muted: '#6F6878', line: '#DBD3DE', accent: '#6A4A9C', accent2: '#B5502F', tint: '#E4DDE7' },
  wild: { paper: '#EBEEE4', card: '#F9FBF5', ink: '#1D2618', muted: '#68755E', line: '#D5DCC7', accent: '#4B7A2B', accent2: '#A8621F', tint: '#DFE5D3' }
}

export function getTheme(palette) {
  return THEMES[palette] || THEMES.mountain
}

// "r g b" (spazio, non virgola) per comporre ombre tinte con rgb(var(--x) / alpha).
function rgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

// CSS custom properties da applicare come `style` sul contenitore che deve
// vestirsi con il tema di un viaggio (root dell'app, card in Home, ecc).
export function themeStyle(palette) {
  const t = getTheme(palette)
  return {
    '--paper': t.paper,
    '--card': t.card,
    '--ink': t.ink,
    '--muted': t.muted,
    '--line': t.line,
    '--accent': t.accent,
    '--accent2': t.accent2,
    '--tint': t.tint,
    '--ink-rgb': rgbTriplet(t.ink),
    '--accent-rgb': rgbTriplet(t.accent),
    '--paper-rgb': rgbTriplet(t.paper),
    '--card-rgb': rgbTriplet(t.card)
  }
}
