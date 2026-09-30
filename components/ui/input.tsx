import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "glass-inset h-11 w-full rounded-md px-3 text-body text-text placeholder:text-textSecondary",
        "transition-all duration-150 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/15",
        "disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "glass-inset min-h-[80px] w-full rounded-md px-3 py-2.5 text-body text-text placeholder:text-textSecondary",
      "transition-all duration-150 focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/15",
      "disabled:opacity-40 resize-y",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
