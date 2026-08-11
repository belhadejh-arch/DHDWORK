import React, { useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, User, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmployeeOption {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  officeName?: string | null;
}

interface EmployeeSelectorProps {
  value: string | number;
  onChange: (value: string) => void;
  employees: EmployeeOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function EmployeeSelector({
  value,
  onChange,
  employees,
  placeholder = 'اختر موظفاً (جميع الموظفين)...',
  disabled = false,
  className,
}: EmployeeSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedEmp = employees.find((e) => String(e.id) === String(value));

  const filtered = employees.filter((e) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
    const email = (e.email || '').toLowerCase();
    const phone = e.phone || '';
    return fullName.includes(q) || email.includes(q) || phone.includes(q);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between text-right font-normal h-10', className)}
        >
          {selectedEmp ? (
            <span className="truncate flex items-center gap-2">
              <User className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium">{selectedEmp.firstName} {selectedEmp.lastName}</span>
              {selectedEmp.position && (
                <span className="text-xs text-muted-foreground">({selectedEmp.position})</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] sm:w-[380px] p-2 shadow-md" align="start">
        {/* Search Input */}
        <div className="relative mb-2">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بـ: الاسم، البريد، أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-8 text-xs h-9"
          />
        </div>

        {/* Employee List */}
        <div className="max-h-[220px] sm:max-h-[260px] overflow-y-auto space-y-1">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              لا يوجد موظف يطابق البحث
            </div>
          ) : (
            filtered.map((emp) => {
              const isSelected = String(emp.id) === String(value);
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    onChange(String(emp.id));
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-right px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between',
                    isSelected
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <div className="flex flex-col gap-0.5 truncate pr-1">
                    <span className="font-medium text-sm truncate">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {emp.position || 'موظف'} {emp.phone ? `• ${emp.phone}` : ''} {emp.email ? `• ${emp.email}` : ''}
                    </span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
