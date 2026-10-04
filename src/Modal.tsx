import { type ReactNode, useId, useRef } from "react";
import styles from "./Modal.module.css";
import ui from "./ui.module.css";

type ModalProps = {
  title: string;
  triggerClassName?: string;
  children: ReactNode;
};

export function Modal({ title, triggerClassName, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  return (
    <>
      <button
        className={triggerClassName}
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogRef.current?.showModal()}
      >
        {title}
      </button>
      <dialog
        ref={dialogRef}
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
        {children}
      </dialog>
    </>
  );
}
