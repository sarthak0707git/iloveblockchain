"use client";

import { useMemo, useState } from "react";
import { STATUS_LABEL, Task, ZERO_HASH, hashFile, shortHash } from "~~/utils/taskEscrow";

/**
 * Anyone can check a delivered file against what the contract recorded:
 * hash the file locally, compare it to the task's on-chain workHash.
 */
export const VerifyWork = ({ tasks }: { tasks: (Task & { id: bigint })[] }) => {
  const withWork = useMemo(() => tasks.filter(t => t.workHash && t.workHash !== ZERO_HASH), [tasks]);

  const [selectedId, setSelectedId] = useState<string>("");
  const [fileHash, setFileHash] = useState<`0x${string}` | "">("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = withWork.find(t => t.id.toString() === selectedId);
  const match = selected && fileHash ? selected.workHash.toLowerCase() === fileHash.toLowerCase() : undefined;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      setFileHash(await hashFile(file));
      setFileName(file.name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stock">
      <div className="p-5 flex flex-col gap-3">
        <h2 className="font-bold">Verify work</h2>
        <p className="label-c">
          Drop the delivered file here. It is hashed in your browser and compared with the hash stored on-chain —
          nothing is uploaded.
        </p>

        {withWork.length === 0 ? (
          <p className="text-[var(--color-muted)]">No work has been submitted yet.</p>
        ) : (
          <>
            <select className="field-c" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">Pick a task…</option>
              {withWork.map(t => (
                <option key={t.id.toString()} value={t.id.toString()}>
                  #{t.id.toString()} — {t.title || "(untitled)"} ({STATUS_LABEL[t.status]})
                </option>
              ))}
            </select>

            {selected ? (
              <div className="text-xs">
                <span className="text-[var(--color-muted)]">On-chain hash</span>
                <div className="font-mono break-all">{selected.workHash}</div>
              </div>
            ) : null}

            <input
              type="file"
              className="field-c py-2"
              disabled={!selected || busy}
              onChange={e => handleFile(e.target.files?.[0])}
            />

            {busy ? <span className="label-c">Hashing…</span> : null}

            {fileHash ? (
              <div className="text-xs flex flex-col gap-1">
                <span className="text-[var(--color-muted)]">{fileName}</span>
                <code className="font-mono break-all">{shortHash(fileHash)}</code>
              </div>
            ) : null}

            {match === true ? (
              <div className="stock p-3 text-sm">
                <span>Match. This is exactly the file that was submitted.</span>
              </div>
            ) : null}
            {match === false ? (
              <div className="p-3 text-sm border border-[var(--color-error)] rounded-[var(--radius-input)]">
                <span>No match. This file is not the one recorded on-chain.</span>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
};
