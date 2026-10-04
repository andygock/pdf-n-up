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
  const commit = () => {
    if (Number(draft) !== value) onCommit(Number(draft));
  };
  // Native change committed on blur. Keep an editable draft so typing a
  // multi-digit margin never starts conversion and disables the field midway.
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
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}
