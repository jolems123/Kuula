import { useId, useRef, type InputHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { uiText } from "../../i18n/ui-text";

/** The app owns its button text; the device still owns the file/camera dialog. */
export function LocalizedFileInput({ fieldLabel, ...props }: InputHTMLAttributes<HTMLInputElement> & { fieldLabel?: string }) {
  useTranslation("ui");
  const input = useRef<HTMLInputElement>(null);
  const generatedId = useId();
  const action = uiText(props.accept?.startsWith("image/") ? "Take or choose photo" : "Choose file");
  const label = fieldLabel || props["aria-label"];
  return <span className="kuula-local-file-input">
    <input {...props} id={props.id || generatedId} type="file" ref={input} style={{ ...props.style, display: "none" }} />
    <button type="button" className="kuula-local-file-button" disabled={props.disabled} aria-label={label ? `${action}: ${label}` : action} aria-describedby={props["aria-describedby"]} onClick={() => input.current?.click()}>{action}</button>
  </span>;
}
