"use client";

import { useRef, useState } from "react";
import { ZERO_HASH, hashFile, shortHash } from "~~/utils/taskEscrow";

/**
 * Picks a local file and reports its keccak256 hash. The file itself never
 * leaves the browser; only the 32-byte digest is ever put on-chain.
 */
export const FileHashInput = ({
  value,
  onChange,
  disabled,
}: {
  value: `0x${string}` | "";
  onChange: (hash: `0x${string}` | "") => void;
  disabled?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const hash = await hashFile(file);
      setFileName(file.name);
      onChange(hash === ZERO_HASH ? "" : hash);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setFileName("");
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        className="field-c py-2"
        disabled={disabled || busy}
        onChange={e => handleFile(e.target.files?.[0])}
      />
      {busy ? <span className="label-c">Hashing…</span> : null}
      {value ? (
        <span className="text-xs flex items-center gap-2 flex-wrap">
          <span className="text-[var(--color-muted)]">{fileName}</span>
          <code className="font-mono">{shortHash(value)}</code>
          <button type="button" className="btn-c btn-c--card btn-c--sm" onClick={clear} disabled={disabled}>
            clear
          </button>
        </span>
      ) : (
        <span className="label-c">The file stays on your machine. Only its keccak256 hash is sent.</span>
      )}
    </div>
  );
};
