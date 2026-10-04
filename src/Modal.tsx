import { type ReactNode, useId, useRef, useState } from "react";
import styles from "./Modal.module.css";
import ui from "./ui.module.css";

type ModalProps = {
  title: string;
  triggerClassName?: string;
  children: ReactNode | (() => ReactNode);
};

export function Modal({ title, triggerClassName, children }: ModalProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className={triggerClassName}
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialogRef.current?.showModal();
          setOpen(true);
        }}
      >
        {title}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        closedby="any"
        className={styles.modal}
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <h2 id={titleId}>{title}</h2>
          <form method="dialog">
            <button className={`${ui.button} ${ui.compact}`} type="submit">
              Close
            </button>
          </form>
        </header>
        {typeof children === "function" ? (open ? children() : null) : children}
      </dialog>
    </>
  );
}
