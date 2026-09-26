import React, { memo } from 'react'

/**
 * RangeSlider — a range input with a correctly proportioned colored fill.
 * Fixes the "half-colored track" bug caused by bare <input type="range">
 * having no dynamic background. Computes percentage fill inline so the
 * blue portion always matches the thumb position exactly.
 */
const RangeSlider = memo(function RangeSlider({
  value, min = 0, max = 100, step = 1,
  onChange, color = '#4F8EF7', trackColor = '#e2e4ef',
  disabled = false, style = {},
}) {
  const pct = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={e => onChange?.(+e.target.value)}
      style={{
        width: '100%',
        height: 5,
        borderRadius: 3,
        outline: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .4 : 1,
        WebkitAppearance: 'none',
        appearance: 'none',
        background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, ${trackColor} ${pct}%, ${trackColor} 100%)`,
        touchAction: 'pan-x',
        ...style,
      }}
      className="rs-thumb"
    />
  )
})

export default RangeSlider
