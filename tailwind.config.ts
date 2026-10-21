import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      colors: {
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        'brand-subtle': 'var(--brand-subtle)',
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          muted: 'var(--color-surface-muted)',
          subtle: 'var(--color-surface-subtle)',
        },
        foreground: {
          DEFAULT: 'var(--color-foreground)',
          muted: 'var(--color-foreground-muted)',
          subtle: 'var(--color-foreground-subtle)',
          inverse: 'var(--color-foreground-inverse)',
        },
        'ui-border': {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        focus: 'var(--color-focus)',
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          subtle: 'var(--color-primary-subtle)',
          foreground: 'var(--color-primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary)',
          hover: 'var(--color-secondary-hover)',
          foreground: 'var(--color-secondary-foreground)',
          border: 'var(--color-secondary-border)',
        },
        success: {
          DEFAULT: 'var(--color-success)',
          hover: 'var(--color-success-hover)',
          subtle: 'var(--color-success-subtle)',
          'subtle-foreground': 'var(--color-success-subtle-foreground)',
          border: 'var(--color-success-border)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          hover: 'var(--color-warning-hover)',
          subtle: 'var(--color-warning-subtle)',
          'subtle-foreground': 'var(--color-warning-subtle-foreground)',
          border: 'var(--color-warning-border)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          hover: 'var(--color-danger-hover)',
          subtle: 'var(--color-danger-subtle)',
          'subtle-foreground': 'var(--color-danger-subtle-foreground)',
          border: 'var(--color-danger-border)',
          foreground: 'var(--color-danger-foreground)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          hover: 'var(--color-info-hover)',
          subtle: 'var(--color-info-subtle)',
          'subtle-foreground': 'var(--color-info-subtle-foreground)',
          border: 'var(--color-info-border)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar)',
          foreground: 'var(--color-sidebar-foreground)',
          muted: 'var(--color-sidebar-muted)',
          border: 'var(--color-sidebar-border)',
        },
      },
      fontSize: {
        'ui-page-title': ['var(--font-size-page-title)', { lineHeight: 'var(--line-height-page-title)' }],
        'ui-section-title': ['var(--font-size-section-title)', { lineHeight: 'var(--line-height-section-title)' }],
        'ui-body': ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
        'ui-label': ['var(--font-size-label)', { lineHeight: 'var(--line-height-label)' }],
        'ui-helper': ['var(--font-size-helper)', { lineHeight: 'var(--line-height-helper)' }],
        'ui-caption': ['var(--font-size-caption)', { lineHeight: 'var(--line-height-caption)' }],
        'ui-metric': ['var(--font-size-metric)', { lineHeight: 'var(--line-height-metric)' }],
      },
      spacing: {
        'ui-page': 'var(--space-page)',
        'ui-section': 'var(--space-section)',
        'ui-card': 'var(--space-card)',
        'ui-control-gap': 'var(--space-control-gap)',
      },
      height: {
        'ui-control-sm': 'var(--control-height-sm)',
        'ui-control-md': 'var(--control-height-md)',
        'ui-control-lg': 'var(--control-height-lg)',
      },
      borderRadius: {
        'ui-control': 'var(--radius-control)',
        'ui-surface': 'var(--radius-surface)',
        'ui-pill': 'var(--radius-pill)',
      },
      boxShadow: {
        'ui-surface': 'var(--shadow-surface)',
        'ui-overlay': 'var(--shadow-overlay)',
      },
    },
  },
  plugins: [],
}
export default config
