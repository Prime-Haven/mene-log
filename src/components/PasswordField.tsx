import React, { useState } from "react";
import { Check, X, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordChecks, passwordStrength } from "@/lib/password";

/** Standalone password input with eye toggle to view or hide the typed password */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input> & {
    showEyeToggle?: boolean;
  }
>(({ className = "", showEyeToggle = true, type = "password", ...props }, ref) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="relative flex items-center w-full">
      <Input
        ref={ref}
        type={showPassword ? "text" : "password"}
        className={`pr-10 ${className}`}
        {...props}
      />
      {showEyeToggle && (
        <button
          type="button"
          onClick={() => setShowPassword((prev) => !prev)}
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-3 flex items-center justify-center text-muted-foreground/70 hover:text-foreground transition-colors focus:outline-none"
        >
          {showPassword ? (
            <EyeOff className="size-4 shrink-0" />
          ) : (
            <Eye className="size-4 shrink-0" />
          )}
        </button>
      )}
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";

/** Password input with the shared Mene rules shown as a live checklist, plus eye visibility toggle. */
export function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  autoComplete = "new-password",
  maxLength = 64,
  required = true,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const checks = passwordChecks(value);
  const strength = passwordStrength(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        maxLength={maxLength}
      />
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${
            strength === 100 ? "bg-success" : strength >= 60 ? "bg-primary" : "bg-destructive"
          }`}
          style={{ width: `${strength}%` }}
        />
      </div>
      <ul className="grid gap-1 pt-1 text-xs sm:grid-cols-2">
        {checks.map((check) => (
          <li
            key={check.label}
            className={
              check.met
                ? "flex items-center gap-1.5 text-success"
                : "flex items-center gap-1.5 text-muted-foreground"
            }
          >
            {check.met ? <Check className="size-3" /> : <X className="size-3" />}
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
