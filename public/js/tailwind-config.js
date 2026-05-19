/**
 * Shared Tailwind CSS CDN Configuration
 * Design System: Literary Hearth / The Open Folio
 * Based on DESIGN.md — Material Design 3 tokens
 */
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "outline": "#81756c",
        "secondary": "#4a6549",
        "on-primary-fixed": "#2b1705",
        "on-tertiary-fixed": "#2b1700",
        "surface-container-highest": "#eae1db",
        "on-secondary": "#ffffff",
        "surface-container-lowest": "#ffffff",
        "tertiary-container": "#6b4614",
        "secondary-fixed": "#ccebc7",
        "background": "#fff8f4",
        "outline-variant": "#d3c4ba",
        "surface-bright": "#fff8f4",
        "on-secondary-fixed-variant": "#334d33",
        "on-tertiary-fixed-variant": "#633f0d",
        "on-error-container": "#93000a",
        "tertiary": "#513000",
        "on-surface": "#1f1b18",
        "surface-dim": "#e1d8d3",
        "on-surface-variant": "#4f453d",
        "on-tertiary": "#ffffff",
        "inverse-surface": "#34302c",
        "primary": "#4a321d",
        "surface-container-low": "#fbf2ec",
        "surface-container-high": "#efe6e1",
        "on-tertiary-container": "#eab57a",
        "surface-variant": "#eae1db",
        "on-secondary-container": "#506b4f",
        "surface-container": "#f5ece6",
        "tertiary-fixed": "#ffddba",
        "secondary-fixed-dim": "#b0cfad",
        "error-container": "#ffdad6",
        "on-primary": "#ffffff",
        "on-primary-container": "#ddb89c",
        "error": "#ba1a1a",
        "inverse-primary": "#e5bfa3",
        "secondary-container": "#ccebc7",
        "primary-fixed-dim": "#e5bfa3",
        "primary-fixed": "#ffdcc2",
        "tertiary-fixed-dim": "#f2bc80",
        "on-background": "#1f1b18",
        "on-error": "#ffffff",
        "primary-container": "#634832",
        "on-secondary-fixed": "#07200b",
        "on-primary-fixed-variant": "#5b412c",
        "inverse-on-surface": "#f8efe9",
        "surface": "#fff8f4",
        "surface-tint": "#755841"
      },
      borderRadius: {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      spacing: {
        "gutter-mobile": "16px",
        "margin-desktop": "64px",
        "margin-mobile": "20px",
        "container-max": "1280px",
        "base": "8px",
        "gutter-desktop": "32px"
      },
      fontFamily: {
        "display-lg": ["Lora", "serif"],
        "body-md": ["Be Vietnam Pro", "sans-serif"],
        "headline-lg": ["Lora", "serif"],
        "headline-lg-mobile": ["Lora", "serif"],
        "headline-md": ["Lora", "serif"],
        "caption": ["Be Vietnam Pro", "sans-serif"],
        "label-md": ["Be Vietnam Pro", "sans-serif"],
        "body-lg": ["Be Vietnam Pro", "sans-serif"]
      },
      fontSize: {
        "display-lg": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "600" }],
        "body-md": ["16px", { "lineHeight": "1.5", "fontWeight": "400" }],
        "headline-lg": ["32px", { "lineHeight": "1.2", "fontWeight": "500" }],
        "headline-lg-mobile": ["28px", { "lineHeight": "1.2", "fontWeight": "500" }],
        "headline-md": ["24px", { "lineHeight": "1.3", "fontWeight": "500" }],
        "caption": ["12px", { "lineHeight": "1.4", "fontWeight": "400" }],
        "label-md": ["14px", { "lineHeight": "1.2", "letterSpacing": "0.04em", "fontWeight": "600" }],
        "body-lg": ["18px", { "lineHeight": "1.6", "fontWeight": "400" }]
      }
    },
  },
};
