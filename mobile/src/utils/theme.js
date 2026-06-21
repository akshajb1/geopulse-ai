/**
 * utils/theme.js – GeoPulse AI Design System
 */

export const COLORS = {
  primary:       '#00F0FF', // Neon Cyan
  primaryLight:  '#A0F9FF',
  primaryDark:   '#00B8C4',
  accent:        '#FF3D71',
  accentGreen:   '#4ECDC4',
  accentGold:    '#FFD93D',

  background:    '#000000', // Pure Black for depth
  surface:       '#0C0F14',
  surfaceLight:  '#161A22',
  card:          '#111111',
  cardBorder:    'rgba(0,240,255,0.1)',

  text:          '#FFFFFF',
  textSecondary: '#A0AEC0',
  textMuted:     '#4A5568',

  success:       '#00E096',
  warning:       '#FFAD0D',
  error:         '#FF3D71',
  info:          '#0095FF',

  mapOverlay:    'rgba(0,240,255,0.08)',
  markerBg:      '#00F0FF',
};

export const FONTS = {
  regular:    'System',
  medium:     'System',
  bold:       'System',
  sizes: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   18,
    xl:   22,
    xxl:  28,
    hero: 36,
  },
};

export const SHADOWS = {
  small: {
    shadowColor:   '#00F0FF',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius:  6,
    elevation:     4,
  },
  medium: {
    shadowColor:   '#00F0FF',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius:  12,
    elevation:     8,
  },
  large: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius:  20,
    elevation:     16,
  },
};

export const INTEREST_META = {
  Cafe:       { icon: 'coffee',           color: '#C8956C', emoji: '☕' },
  Restaurant: { icon: 'silverware-fork-knife', color: '#FF6B6B', emoji: '🍽️' },
  Adventure:  { icon: 'hiking',           color: '#4ECDC4', emoji: '🏔️' },
  Sports:     { icon: 'football',         color: '#63B3ED', emoji: '⚽' },
  Music:      { icon: 'music',            color: '#9F7AEA', emoji: '🎵' },
  Nightlife:  { icon: 'glass-cocktail',   color: '#F687B3', emoji: '🌃' },
  Events:     { icon: 'calendar-star',    color: '#FFD93D', emoji: '🎉' },
};
