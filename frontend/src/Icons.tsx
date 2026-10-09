import type { ReactNode } from 'react'

type IconProps = { className?: string }

function Icon({ children, className = 'h-5 w-5' }: IconProps & { children: ReactNode }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
}

export function ExploreIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></Icon>
}

export function PlusIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
}

export function PersonIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="8" r="3" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></Icon>
}

export function UsersIcon(props: IconProps) {
  return <Icon {...props}><path d="M16 19a4 4 0 0 0-8 0" /><circle cx="12" cy="9" r="3" /><path d="M19 18a3.5 3.5 0 0 0-2.5-3.35M17 6.5a2.5 2.5 0 0 1 0 4.9M5 18a3.5 3.5 0 0 1 2.5-3.35M7 6.5a2.5 2.5 0 0 0 0 4.9" /></Icon>
}

export function GlobeIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></Icon>
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>
}

export function LocateIcon(props: IconProps) {
  return <Icon {...props}><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /><circle cx="12" cy="12" r="3" /></Icon>
}

export function RefreshIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 11a8 8 0 0 0-14.5-4L3 10" /><path d="M3 5v5h5M4 13a8 8 0 0 0 14.5 4L21 14" /><path d="M21 19v-5h-5" /></Icon>
}

export function CheckIcon(props: IconProps) {
  return <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>
}

export function MapPinIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></Icon>
}

export function ArrowLeftIcon(props: IconProps) {
  return <Icon {...props}><path d="m15 18-6-6 6-6M9 12h10" /></Icon>
}

export function DirectionsIcon(props: IconProps) {
  return <Icon {...props}><path d="m13 3 8 8-8 8-8-8 8-8Z" /><path d="M13 7v10M9 11h8M9 11l2-2M9 11l2 2" /></Icon>
}

export function CameraIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3" /></Icon>
}

export function PhotoIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4 17 4-4 3 3 2-2 5 5" /></Icon>
}

export function XIcon(props: IconProps) {
  return <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>
}
