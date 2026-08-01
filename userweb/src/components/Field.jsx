// Labelled form field.
//
// Placeholders are not labels: they vanish the moment the field has a value,
// so a filled form became a column of anonymous boxes — the user could not
// tell first name from surname from nickname. This keeps the label visible at
// all times, matching the Flutter app's InputDecoration.
import React from 'react';

export default function Field({
  label, value, onChange, type = 'text', hint, inputMode, disabled,
}) {
  return (
    <label className="field">
      <span className="fieldLabel">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        placeholder={hint || label}
        onChange={e => onChange(e.target.value)}
      />
      {hint && <small className="fieldHint">{hint}</small>}
    </label>
  );
}
