import { type ReactNode, useId, useRef, useState } from "react";
import styles from "./Modal.module.css";
import ui from "./ui.module.css";

type ModalProps = {
  title: string;
  triggerClassName?: string;
  trigger?: (open: () => void) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
};

export function Modal({
  title,
  triggerClassName,
  trigger,
  children,
}: ModalProps) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const show = () => {
    dialogRef.current?.showModal();
    setOpen(true);
  };
  const close = () => {
    dialogRef.current?.close();
    setOpen(false);
  };

  return (
    <>
      {trigger ? (
        trigger(show)
      ) : (
        <button
          className={triggerClassName}
          type="button"
          aria-haspopup="dialog"
          onClick={show}
        >
          {title}
        </button>
      )}
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
        {typeof children === "function"
          ? open
            ? children(close)
            : null
          : children}
      </dialog>
    </>
  );
}
