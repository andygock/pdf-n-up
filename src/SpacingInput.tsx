import { useEffect, useState } from "react";
import ui from "./ui.module.css";

interface SpacingInputProps {
  id: string;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
  value: number;
  onCommit: (value: number) => void;
}

export function SpacingInput({
  id,
  min = 0,
  max = 100,
  step = 0.5,
  disabled,
  value,
  onCommit,
}: SpacingInputProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const number = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isFinite(number) &&
    number >= min &&
    number <= max &&
    (step !== 1 || Number.isInteger(number));

  useEffect(() => {
    if (disabled || !valid || number === value) return;

    // Allow multi-digit edits and keep pending drafts until conversion is idle.
    // Avoid blur commits: they can disable the next control before its click.
    const timer = setTimeout(() => onCommit(number), 350);
    return () => clearTimeout(timer);
  }, [number, valid, disabled, value, onCommit]);

  return (
    <input
      className={ui.control}
      id={id}
      type="number"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={draft}
      aria-invalid={!valid}
      title={`Enter ${step === 1 ? "a whole number" : "a number"} from ${min} to ${max}. Updates automatically.`}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
