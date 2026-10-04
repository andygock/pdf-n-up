import { useState } from "react";

interface SpacingInputProps {
  id: string;
  disabled: boolean;
  value: number;
  onCommit: (value: number) => void;
}

export function SpacingInput({
  id,
  disabled,
  value,
  onCommit,
}: SpacingInputProps) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    if (Number(draft) !== value) onCommit(Number(draft));
  };
  // Native change committed on blur. Keep an editable draft so typing a
  // multi-digit margin never starts conversion and disables the field midway.
  return (
    <input
      id={id}
      type="number"
      min="0"
      max="100"
      step="0.5"
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
