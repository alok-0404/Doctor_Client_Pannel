import type { FC, SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & {
  /** Width and height in px. Defaults to 20. */
  size?: number | string
}

function mergeIconClass(className?: string) {
  return ['ui-icon', className].filter(Boolean).join(' ')
}

function baseIconProps({ size = 20, className, ...props }: IconProps) {
  return {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: mergeIconClass(className),
    ...props,
  }
}

export const HomeIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6V20.5H5.5A1.5 1.5 0 0 1 4 19v-8.5Z" />
  </svg>
)

export const CalendarIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M7 3.5v2M17 3.5v2M4.5 8.5h15" />
    <path d="M6 5.5h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" />
  </svg>
)

export const UserIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <circle cx="12" cy="8" r="3.25" />
    <path d="M6.5 19.5c.75-3 3.25-4.75 5.5-4.75s4.75 1.75 5.5 4.75" />
  </svg>
)

export const LabIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M10 3.5h4l1 5.5-4.25 8.25a1.5 1.5 0 0 0 1.3 2.25h4.9a1.5 1.5 0 0 0 1.3-2.25L14 9" />
    <path d="M8.5 14.5h7" />
  </svg>
)

export const PharmacyIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)

export const BellIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M12 4.25a4.25 4.25 0 0 0-4.25 4.25c0 4.5-1.5 6-1.5 6h11.5s-1.5-1.5-1.5-6A4.25 4.25 0 0 0 12 4.25Z" />
    <path d="M10.25 18.25a1.75 1.75 0 0 0 3.5 0" />
  </svg>
)

export const DocumentIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M8.5 3.5h7l3 3v13a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 7.5 19.5v-15A1.5 1.5 0 0 1 8.5 3.5Z" />
    <path d="M15.5 3.5V7h3.5M10 12h6M10 15.5h6" />
  </svg>
)

export const PhoneIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M8.75 5.25c.35 2.1 1.15 4.05 2.35 5.75 1.2 1.7 2.75 3.05 4.55 3.95l1.85-1.85a1 1 0 0 1 1-.25c1.1.35 2.25.55 3.45.55a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1C10.85 19 5 13.15 5 5.75a1 1 0 0 1 1-1h2.65a1 1 0 0 1 1 .95c.05.85.15 1.65.35 2.55a1 1 0 0 1-.25 1L8.75 5.25Z" />
  </svg>
)

export const ClockIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <circle cx="12" cy="12" r="8.25" />
    <path d="M12 8v4.25l2.75 2.75" />
  </svg>
)

export const MenuIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M5 7h14M5 12h14M5 17h14" />
  </svg>
)

export const ChevronDownIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const ChevronRightIcon: FC<IconProps> = (props) => (
  <svg {...baseIconProps(props)} aria-hidden={props['aria-hidden'] ?? true}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
