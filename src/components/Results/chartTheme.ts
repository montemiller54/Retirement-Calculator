// Shared chart styling so all Results charts read as one product.
export const GRID_STROKE = 'rgba(100, 116, 139, 0.18)';
export const AXIS_TICK_FILL = 'rgba(100, 116, 139, 0.85)';
export const AXIS_LINE_STROKE = 'rgba(100, 116, 139, 0.25)';

export const RETIREMENT_MARKER_STROKE = '#64748b';
export const RETIREMENT_MARKER_FILL = '#64748b';

export const FAN_BAND_COLOR = '#3b82f6';
// Middle 50% (p25–p75): lighter, broader "typical range"
export const FAN_BAND_MIDDLE_OPACITY = 0.18;
// Tail band (p10–p25): a touch more present so worst-case tail reads
export const FAN_BAND_TAIL_OPACITY = 0.28;
export const FAN_MEDIAN_STROKE = '#f59e0b';

export const FAILURE_BAR_FILL = '#f47c79';

export const TOOLTIP_STYLE: React.CSSProperties = {
  fontSize: 11,
  background: 'rgba(255,255,255,0.98)',
  border: '1px solid rgba(100,116,139,0.25)',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};
