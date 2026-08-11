import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EmployeeProfile } from '../auth';

const AVATAR_KEY = 'employee_avatar';
const AVATAR_EVENT = 'employee-avatar-updated';

function initials(employee: EmployeeProfile | null) {
  return `${employee?.firstName?.[0] ?? ''}${employee?.lastName?.[0] ?? ''}`.toUpperCase();
}

export function EmployeeAvatar({
  employee,
  editable = false,
  size = 'md',
}: {
  employee: EmployeeProfile | null;
  editable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(() => localStorage.getItem(AVATAR_KEY));

  useEffect(() => {
    const sync = () => setSrc(localStorage.getItem(AVATAR_KEY));
    window.addEventListener(AVATAR_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(AVATAR_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result);
      localStorage.setItem(AVATAR_KEY, value);
      setSrc(value);
      window.dispatchEvent(new Event(AVATAR_EVENT));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const sizeClass = size === 'lg' ? 'h-24 w-24 text-2xl' : size === 'sm' ? 'h-10 w-10 text-sm' : 'h-14 w-14 text-lg';

  return (
    <div className="relative shrink-0">
      <div className={cn('flex items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground font-bold ring-4 ring-primary/10', sizeClass)}>
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(employee)}
      </div>
      {editable && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md transition-transform hover:scale-105"
            aria-label="تغيير صورة البروفايل"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
        </>
      )}
    </div>
  );
}