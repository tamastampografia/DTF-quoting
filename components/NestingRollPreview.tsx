"use client";

import React from "react";
import type { SVGColumnData, NestingResult } from "@/lib/nesting";
import { ROLL_WIDTH_CM, ROLL_MAX_LENGTH_CM, GAP_CM } from "@/lib/nesting";
import { getSubjectColor } from "@/lib/utils";

interface Props {
  result: NestingResult;
  subjectNames?: string[];
}

const MAX_SCALE = 4;        // max px per cm (for short rolls)
const MIN_SCALE = 0.5;      // min px per cm (for very long rolls)
const TARGET_HEIGHT = 1400; // target SVG height in px
const LABEL_AREA_HEIGHT = 30;
const PADDING = 16;

export default function NestingRollPreview({ result, subjectNames }: Props) {
  if (!result || result.subjects.length === 0) return null;

  const rollLengthCm = result.totalRollMeters * 100;
  // Auto-scale: shrink for long rolls so the preview stays usable
  const SCALE = Math.max(MIN_SCALE, Math.min(MAX_SCALE, TARGET_HEIGHT / Math.max(1, rollLengthCm)));
  const svgWidth = ROLL_WIDTH_CM * SCALE + PADDING * 2 + 40; // +40 for section labels
  const svgHeight = rollLengthCm * SCALE + LABEL_AREA_HEIGHT + PADDING * 2;

  // Build column data from result
  const cols = result.svgPreviewData;

  return (
    <div className="overflow-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        style={{ fontFamily: "sans-serif" }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background */}
        <rect
          x={PADDING}
          y={LABEL_AREA_HEIGHT + PADDING}
          width={ROLL_WIDTH_CM * SCALE}
          height={rollLengthCm * SCALE}
          fill="#f8f8f8"
          stroke="#ccc"
          strokeWidth={1}
        />

        {/* Grid lines every 10cm */}
        {Array.from({ length: Math.floor(rollLengthCm / 10) + 1 }, (_, i) => i * 10).map(cm => (
          <g key={cm}>
            <line
              x1={PADDING}
              y1={LABEL_AREA_HEIGHT + PADDING + cm * SCALE}
              x2={PADDING + ROLL_WIDTH_CM * SCALE}
              y2={LABEL_AREA_HEIGHT + PADDING + cm * SCALE}
              stroke="#e0e0e0"
              strokeWidth={1}
              strokeDasharray="2,4"
            />
            <text
              x={PADDING - 4}
              y={LABEL_AREA_HEIGHT + PADDING + cm * SCALE + 4}
              fontSize={9}
              fill="#aaa"
              textAnchor="end"
            >
              {cm}cm
            </text>
          </g>
        ))}

        {/* Column rectangles — one rect per piece */}
        {cols.map((col, ci) => {
          const color = getSubjectColor(col.subjectIndex);
          const colX = PADDING + col.x * SCALE;
          const colW = col.colWidth * SCALE;

          return col.segments.map((seg, si) => {
            const pieceH = seg.height * SCALE;
            const gapH = GAP_CM * SCALE;
            const segOriginY = LABEL_AREA_HEIGHT + PADDING + seg.y * SCALE;
            const totalSegH = seg.count * pieceH + (seg.count - 1) * gapH;
            // Only draw individual pieces when they are tall enough to be visible (>= 3px)
            const drawIndividual = pieceH >= 3;

            return (
              <g key={`${ci}-${si}`}>
                {drawIndividual
                  ? Array.from({ length: seg.count }, (_, k) => (
                      <rect
                        key={k}
                        x={colX}
                        y={segOriginY + k * (pieceH + gapH)}
                        width={colW}
                        height={pieceH}
                        fill={color}
                        fillOpacity={0.65}
                        stroke={color}
                        strokeWidth={0.5}
                      />
                    ))
                  : /* Too small to draw individually — merge into a single block */
                    <rect
                      x={colX}
                      y={segOriginY}
                      width={colW}
                      height={totalSegH}
                      fill={color}
                      fillOpacity={0.65}
                      stroke={color}
                      strokeWidth={0.5}
                    />
                }
                {/* Label on first piece (if big enough) */}
                {pieceH >= 14 && (
                  <text
                    x={colX + colW / 2}
                    y={segOriginY + pieceH / 2}
                    fontSize={9}
                    fill="#fff"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontWeight="bold"
                  >
                    {col.subjectName} ×{seg.count}
                  </text>
                )}
              </g>
            );
          });
        })}

        {/* Section boundary lines every ROLL_MAX_LENGTH_CM cm */}
        {Array.from(
          { length: Math.floor(rollLengthCm / ROLL_MAX_LENGTH_CM) },
          (_, i) => (i + 1) * ROLL_MAX_LENGTH_CM
        ).map(cm => (
          <g key={`sec-${cm}`}>
            <line
              x1={PADDING}
              y1={LABEL_AREA_HEIGHT + PADDING + cm * SCALE}
              x2={PADDING + ROLL_WIDTH_CM * SCALE}
              y2={LABEL_AREA_HEIGHT + PADDING + cm * SCALE}
              stroke="#3B82F6"
              strokeWidth={1.5}
              strokeDasharray="6,3"
            />
            <text
              x={PADDING + ROLL_WIDTH_CM * SCALE + 4}
              y={LABEL_AREA_HEIGHT + PADDING + cm * SCALE + 4}
              fontSize={8}
              fill="#3B82F6"
            >
              {cm / 100} m
            </text>
          </g>
        ))}

        {/* Column width markers at top */}
        {Array.from(new Set(cols.map(c => c.x))).map(x => {
          const col = cols.find(c => c.x === x);
          if (!col) return null;
          const colX = PADDING + x * SCALE;
          const colW = col.colWidth * SCALE;
          return (
            <g key={x}>
              <line
                x1={colX}
                y1={PADDING + LABEL_AREA_HEIGHT - 6}
                x2={colX + colW}
                y2={PADDING + LABEL_AREA_HEIGHT - 6}
                stroke={getSubjectColor(col.subjectIndex)}
                strokeWidth={2}
                markerStart="url(#arrow)"
                markerEnd="url(#arrow)"
              />
              <text
                x={colX + colW / 2}
                y={PADDING + LABEL_AREA_HEIGHT - 10}
                fontSize={9}
                fill={getSubjectColor(col.subjectIndex)}
                textAnchor="middle"
              >
                {col.colWidth}cm
              </text>
            </g>
          );
        })}

        {/* Roll width label */}
        <text
          x={PADDING + (ROLL_WIDTH_CM * SCALE) / 2}
          y={12}
          fontSize={11}
          fill="#555"
          textAnchor="middle"
          fontWeight="bold"
        >
          Rullo: {ROLL_WIDTH_CM} cm × {rollLengthCm.toFixed(1)} cm ({result.totalRollMeters.toFixed(2)} m)
        </text>

        {/* Legend */}
        <g transform={`translate(${PADDING + ROLL_WIDTH_CM * SCALE + 10}, ${LABEL_AREA_HEIGHT + PADDING})`}>
          {result.subjects.map((s, i) => (
            <g key={i} transform={`translate(0, ${i * 20})`}>
              <rect x={0} y={0} width={12} height={12} fill={getSubjectColor(i)} fillOpacity={0.7} rx={2} />
              <text x={16} y={10} fontSize={10} fill="#555">
                {s.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
