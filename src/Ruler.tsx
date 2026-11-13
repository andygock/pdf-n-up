import {
  Fragment,
  type PointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Preview.module.css";
import {
  type RulerPoint,
  rulerMeasurement,
  rulerPoint,
  rulerTicks,
} from "./ruler.ts";

export interface RulerPage {
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
}

export function Ruler({
  page,
  hidden = false,
  statusContainer,
}: {
  page: RulerPage;
  hidden?: boolean;
  statusContainer?: HTMLElement | null;
}) {
  const [origin, setOrigin] = useState<RulerPoint>({ x: 0, y: 0 });
  const [pointer, setPointer] = useState<RulerPoint | null>(null);
  const [keyboardCursor, setKeyboardCursor] = useState<RulerPoint>({
    x: 0,
    y: 0,
  });
  const [keyboardCursorVisible, setKeyboardCursorVisible] = useState(false);
  const [mode, setMode] = useState<"measure" | "pan">("measure");
  const [line, setLine] = useState<{
    start: RulerPoint;
    end: RulerPoint;
  } | null>(null);
  const keyboardAnchor = useRef(false);
  const drag = useRef<{
    pointerId: number;
    start: RulerPoint;
    kind: "measure" | "origin";
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const clear = useCallback(() => {
    drag.current = null;
    keyboardAnchor.current = false;
    setLine(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key !== "Escape" ||
        (target instanceof window.HTMLElement &&
          (target.isContentEditable ||
            target.matches("input, textarea, select, [contenteditable]")))
      )
        return;
      clear();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clear]);

  const point = (event: PointerEvent<SVGSVGElement>, origin?: RulerPoint) =>
    rulerPoint(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      page,
      event.shiftKey ? origin : undefined,
    );
  const move = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current && event.pointerId !== drag.current.pointerId) return;
    setPointer(point(event));
    if (!drag.current) return;
    if (drag.current.kind === "origin") {
      setOrigin(point(event));
      return;
    }
    setLine({
      start: drag.current.start,
      end: point(event, drag.current.start),
    });
  };
  const measurement = line && rulerMeasurement(line.start, line.end);
  const radius = (4 * page.width) / page.displayWidth;
  const unit = page.width / page.displayWidth;
  const strip = 24 * unit;
  const coordinate = (points: number) =>
    `${Number(((points * 25.4) / 72).toFixed(2)).toFixed(2)} mm`;
  const startOrigin = (event: PointerEvent<SVGGElement>) => {
    if (mode === "pan" || event.button !== 0 || drag.current) return;
    event.stopPropagation();
    event.preventDefault();
    drag.current = {
      pointerId: event.pointerId,
      start: origin,
      kind: "origin",
    };
    svg.current?.setPointerCapture(event.pointerId);
  };
  const originKey = (event: ReactKeyboardEvent<SVGGElement>) => {
    const directions: Record<string, RulerPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      event.stopPropagation();
      const step = ((event.shiftKey ? 10 : 1) * 72) / 25.4;
      setOrigin((current) => ({
        x: Math.max(0, Math.min(page.width, current.x + direction.x * step)),
        y: Math.max(0, Math.min(page.height, current.y + direction.y * step)),
      }));
    } else if (["Enter", " ", "Home"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      setOrigin({ x: 0, y: 0 });
    }
  };
  const withinPage = (position: RulerPoint) => ({
    x: Math.max(0, Math.min(page.width, position.x)),
    y: Math.max(0, Math.min(page.height, position.y)),
  });
  const rulerKey = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    const directions: Record<string, RulerPoint> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      const step = ((event.shiftKey ? 10 : 1) * 72) / 25.4;
      const next = withinPage({
        x: keyboardCursor.x + direction.x * step,
        y: keyboardCursor.y + direction.y * step,
      });
      setKeyboardCursor(next);
      if (keyboardAnchor.current)
        setLine((current) => (current ? { ...current, end: next } : current));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (keyboardAnchor.current) {
        keyboardAnchor.current = false;
        setLine((current) =>
          current ? { ...current, end: keyboardCursor } : current,
        );
      } else {
        keyboardAnchor.current = true;
        setLine({ start: keyboardCursor, end: keyboardCursor });
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      clear();
    }
  };
  const endpointKey =
    (endpoint: "start" | "end") => (event: ReactKeyboardEvent<SVGGElement>) => {
      const directions: Record<string, RulerPoint> = {
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
      };
      const direction = directions[event.key];
      if (direction) {
        event.preventDefault();
        event.stopPropagation();
        const step = ((event.shiftKey ? 10 : 1) * 72) / 25.4;
        setLine((current) => {
          if (!current) return current;
          const moved = withinPage({
            x: current[endpoint].x + direction.x * step,
            y: current[endpoint].y + direction.y * step,
          });
          return endpoint === "start"
            ? { ...current, start: moved }
            : { ...current, end: moved };
        });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
    };

  const status = (
    <div className={styles.rulerReadout} aria-busy={hidden}>
      <output aria-label="Ruler coordinates" aria-live="off">
        <span>
          X: {!hidden && pointer ? coordinate(pointer.x - origin.x) : "—"}
        </span>
        <span>
          Y: {!hidden && pointer ? coordinate(pointer.y - origin.y) : "—"}
        </span>
      </output>
      <output
        aria-label="Ruler measurement"
        aria-live="polite"
        aria-atomic="true"
        title="Keyboard: focus the ruler, move the cursor with arrow keys, and press Space or Enter to set each endpoint. Focus an endpoint to adjust it."
      >
        <span>
          D:{" "}
          <strong>
            {!hidden && measurement
              ? `${measurement.distance.toFixed(2)} mm`
              : "—"}
          </strong>
        </span>
        <span>
          H:{" "}
          {!hidden && measurement ? `${measurement.width.toFixed(2)} mm` : "—"}
        </span>
        <span>
          V:{" "}
          {!hidden && measurement ? `${measurement.height.toFixed(2)} mm` : "—"}
        </span>
      </output>
      <fieldset className={styles.rulerModeControls} aria-label="Ruler mode">
        <button
          type="button"
          className={styles.rulerMode}
          aria-pressed={mode === "measure"}
          onClick={() => setMode("measure")}
        >
          Measure
        </button>
        <button
          type="button"
          className={styles.rulerMode}
          aria-pressed={mode === "pan"}
          onClick={() => setMode("pan")}
        >
          Pan
        </button>
      </fieldset>
      <button
        type="button"
        className={styles.rulerAction}
        disabled={hidden || (origin.x === 0 && origin.y === 0)}
        onClick={() => setOrigin({ x: 0, y: 0 })}
      >
        Reset origin
      </button>
      <button
        type="button"
        className={styles.rulerAction}
        disabled={hidden || !line}
        onClick={clear}
      >
        Clear measurement
      </button>
    </div>
  );

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: The ruler is an SVG group with keyboard controls in page coordinates. */}
      <svg
        ref={svg}
        className={styles.ruler}
        style={{
          width: page.displayWidth,
          height: page.displayHeight,
          display: hidden ? "none" : undefined,
          touchAction: mode === "measure" ? "none" : "pan-x pan-y",
          cursor: mode === "measure" ? "crosshair" : "grab",
        }}
        viewBox={`0 0 ${page.width} ${page.height}`}
        role="group"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard focus exposes the measurement cursor.
        tabIndex={0}
        aria-label="Ruler. Arrow keys move the keyboard cursor by 1 mm; Shift and an arrow move it by 10 mm. Press Space or Enter to set the start point, move to the end, and press Space or Enter again. Focus a measurement endpoint and use arrow keys to adjust it. Escape clears."
        onKeyDown={rulerKey}
        onFocus={() => setKeyboardCursorVisible(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setKeyboardCursorVisible(false);
        }}
        onPointerDown={(event) => {
          if (
            mode === "pan" ||
            event.button !== 0 ||
            drag.current ||
            (event.target instanceof window.Element &&
              event.target.closest("[data-ruler-endpoint]"))
          )
            return;
          event.preventDefault();
          const start = point(event);
          setPointer(start);
          keyboardAnchor.current = false;
          drag.current = { pointerId: event.pointerId, start, kind: "measure" };
          event.currentTarget.setPointerCapture(event.pointerId);
          setLine({ start, end: start });
        }}
        onPointerMove={move}
        onPointerEnter={move}
        onPointerLeave={() => {
          if (!drag.current) setPointer(null);
        }}
        onPointerUp={(event) => {
          if (event.pointerId !== drag.current?.pointerId) return;
          move(event);
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          keyboardAnchor.current = false;
          if (event.pointerType === "touch") setPointer(null);
        }}
        onPointerCancel={() => {
          if (drag.current) clear();
          setPointer(null);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <title>Measure the output sheet in millimetres</title>
        {keyboardCursorVisible && (
          <g
            className={styles.rulerKeyboardCursor}
            data-ruler-keyboard-cursor="true"
          >
            <path
              d={`M ${keyboardCursor.x - 8 * unit} ${keyboardCursor.y} h ${16 * unit} M ${keyboardCursor.x} ${keyboardCursor.y - 8 * unit} v ${16 * unit}`}
            />
            <circle cx={keyboardCursor.x} cy={keyboardCursor.y} r={4 * unit} />
          </g>
        )}
        <g className={styles.rulerScales} style={{ fontSize: 10 * unit }}>
          <rect x={0} y={-strip} width={page.width} height={strip} />
          <rect x={-strip} y={0} width={strip} height={page.height} />
          {rulerTicks(page.width, origin.x, page.displayWidth).map((tick) => (
            <g key={`x${tick.value}`}>
              <line
                x1={tick.position}
                x2={tick.position}
                y1={0}
                y2={-(tick.major ? 9 : 4) * unit}
              />
              {tick.major && (
                <text x={tick.position + 2 * unit} y={-11 * unit}>
                  {tick.value}
                </text>
              )}
            </g>
          ))}
          {rulerTicks(page.height, origin.y, page.displayHeight).map((tick) => (
            <g key={`y${tick.value}`}>
              <line
                y1={tick.position}
                y2={tick.position}
                x1={0}
                x2={-(tick.major ? 9 : 4) * unit}
              />
              {tick.major && (
                <text
                  transform={`translate(${-11 * unit}, ${tick.position - 2 * unit}) rotate(-90)`}
                >
                  {tick.value}
                </text>
              )}
            </g>
          ))}
        </g>
        {pointer && (
          <g className={styles.rulerHoverMarkers}>
            <line
              data-ruler-marker="x"
              x1={pointer.x}
              x2={pointer.x}
              y1={-strip}
              y2={0}
            />
            <path
              d={`M ${pointer.x - 4 * unit} ${-7 * unit} L ${pointer.x} 0 L ${pointer.x + 4 * unit} ${-7 * unit} Z`}
            />
            <line
              data-ruler-marker="y"
              y1={pointer.y}
              y2={pointer.y}
              x1={-strip}
              x2={0}
            />
            <path
              d={`M ${-7 * unit} ${pointer.y - 4 * unit} L 0 ${pointer.y} L ${-7 * unit} ${pointer.y + 4 * unit} Z`}
            />
          </g>
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: SVG origin controls share the ruler's coordinate system. */}
        <g
          className={styles.rulerOrigin}
          style={{ fontSize: 10 * unit }}
          role="button"
          tabIndex={0}
          aria-label="Ruler origin: drag to move zero. Arrow keys move by 1 mm, Shift by 10 mm. Enter resets."
          onPointerDown={startOrigin}
          onKeyDown={originKey}
          onDoubleClick={() => setOrigin({ x: 0, y: 0 })}
        >
          <title>Drag to move the ruler origin; double-click to reset</title>
          <rect x={-strip} y={-strip} width={strip} height={strip} />
          <text
            x={-strip / 2}
            y={-strip / 2}
            textAnchor="middle"
            dominantBaseline="central"
          >
            mm
          </text>
        </g>
        {(origin.x !== 0 || origin.y !== 0) && (
          <g className={styles.rulerGuides}>
            <line x1={origin.x} x2={origin.x} y1={0} y2={page.height} />
            <line y1={origin.y} y2={origin.y} x1={0} x2={page.width} />
          </g>
        )}
        {/* biome-ignore lint/a11y/useSemanticElements: SVG origin controls share the ruler's coordinate system. */}
        <g
          className={styles.rulerOrigin}
          role="button"
          tabIndex={0}
          aria-label="Move ruler zero point"
          onPointerDown={startOrigin}
          onKeyDown={originKey}
          onDoubleClick={() => setOrigin({ x: 0, y: 0 })}
        >
          <circle cx={origin.x} cy={origin.y} r={7 * unit} />
          <path
            d={`M ${origin.x - 10 * unit} ${origin.y} h ${20 * unit} M ${origin.x} ${origin.y - 10 * unit} v ${20 * unit}`}
          />
        </g>
        {line && (
          <g>
            <line
              className={styles.rulerHalo}
              data-measurement-line="true"
              x1={line.start.x}
              y1={line.start.y}
              x2={line.end.x}
              y2={line.end.y}
            />
            <line
              className={styles.rulerLine}
              x1={line.start.x}
              y1={line.start.y}
              x2={line.end.x}
              y2={line.end.y}
            />
            {(["start", "end"] as const).map((endpoint) => {
              const position = line[endpoint];
              return (
                <Fragment key={endpoint}>
                  {/* biome-ignore lint/a11y/useSemanticElements: The endpoint is a keyboard control drawn in the ruler's SVG coordinate system. */}
                  {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: The SVG endpoint group uses custom arrow-key controls and exposes its coordinates in the accessible label. */}
                  <g
                    className={styles.rulerEndpointHandle}
                    data-ruler-endpoint={endpoint}
                    role="group"
                    tabIndex={0}
                    aria-label={`Measurement ${endpoint} point, X ${coordinate(position.x)}, Y ${coordinate(position.y)}. Use arrow keys to adjust by 1 mm; Shift and an arrow moves it by 10 mm.`}
                    onKeyDown={endpointKey(endpoint)}
                  >
                    <circle
                      className={styles.rulerEndpoint}
                      cx={position.x}
                      cy={position.y}
                      r={radius}
                    />
                  </g>
                </Fragment>
              );
            })}
          </g>
        )}
      </svg>
      {statusContainer ? createPortal(status, statusContainer) : status}
    </>
  );
}
