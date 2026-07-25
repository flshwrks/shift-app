import { IconCalendar } from '@/components/icons';

const SIZE_MAP = {
  sm: { box: 'w-6 h-6 rounded-md', icon: 'w-3.5 h-3.5' },
  md: { box: 'w-10 h-10 rounded-lg', icon: 'w-5 h-5' },
  lg: { box: 'w-12 h-12 rounded-xl', icon: 'w-6 h-6' },
} as const;

export default function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const { box, icon } = SIZE_MAP[size];
  return (
    <span className={`${box} bg-blue-600 text-white flex items-center justify-center flex-shrink-0`}>
      <IconCalendar className={icon} strokeWidth={2} />
    </span>
  );
}
