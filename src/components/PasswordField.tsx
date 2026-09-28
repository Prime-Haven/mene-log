import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordChecks, passwordStrength } from "@/lib/password";

/** Password input with the shared Mene rules shown as a live checklist. */
export function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const checks = passwordChecks(value);
  const strength = passwordStrength(value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={16}
      />
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${strength === 100 ? "bg-success" : strength >= 60 ? "bg-primary" : "bg-destructive"}`}
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
