import {
  type PointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  const [line, setLine] = useState<{
    start: RulerPoint;
    end: RulerPoint;
  } | null>(null);
  const drag = useRef<{
    pointerId: number;
    start: RulerPoint;
    kind: "measure" | "origin";
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const clear = () => {
    drag.current = null;
    setLine(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        drag.current = null;
        setLine(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
    if (event.button !== 0 || drag.current) return;
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
      const step = ((event.shiftKey ? 10 : 1) * 72) / 25.4;
      setOrigin((current) => ({
        x: Math.max(0, Math.min(page.width, current.x + direction.x * step)),
        y: Math.max(0, Math.min(page.height, current.y + direction.y * step)),
      }));
    } else if (["Enter", " ", "Home"].includes(event.key)) {
      event.preventDefault();
      setOrigin({ x: 0, y: 0 });
    }
  };

  const status = (
    <div
      className={styles.rulerReadout}
      aria-busy={hidden}
      title="Click and drag to measure. Shift constrains the angle; Escape clears. Drag the mm corner to move zero."
    >
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
      {/* biome-ignore lint/a11y/useSemanticElements: The ruler is an SVG group with controls in page coordinates. */}
      <svg
        ref={svg}
        className={styles.ruler}
        style={{
          width: page.displayWidth,
          height: page.displayHeight,
          display: hidden ? "none" : undefined,
        }}
        viewBox={`0 0 ${page.width} ${page.height}`}
        role="group"
        aria-label="Ruler: click and drag to measure. Hold Shift for 45-degree angles. Press Escape to clear."
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          const start = point(event);
          setPointer(start);
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
          if (event.pointerType === "touch") setPointer(null);
        }}
        onPointerCancel={() => {
          clear();
          setPointer(null);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <title>Measure the output sheet in millimetres</title>
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
            {[line.start, line.end].map((end, index) => (
              <circle
                key={index === 0 ? "start" : "end"}
                className={styles.rulerEndpoint}
                cx={end.x}
                cy={end.y}
                r={radius}
              />
            ))}
          </g>
        )}
      </svg>
      {statusContainer ? createPortal(status, statusContainer) : status}
    </>
  );
}
