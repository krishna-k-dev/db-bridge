import * as React from "react"

import { cn } from "@/lib/utils"

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("grid gap-2", className)}
        {...props}
      />
    )
  }
)
RadioGroup.displayName = "RadioGroup"

export interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, onChange, ...props }, ref) => {
    return (
      <div className="flex items-center space-x-2">
        <input
          type="radio"
          ref={ref}
          value={value}
          className={cn(
            "h-4 w-4 border border-gray-300 text-blue-600 focus:ring-blue-500",
            className
          )}
          onChange={onChange}
          {...props}
        />
        {props.children && (
          <label htmlFor={props.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {props.children}
          </label>
        )}
      </div>
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }