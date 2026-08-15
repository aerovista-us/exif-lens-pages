"use client";

import { useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

function formatValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RiskBadge({ risk }) {
  return <span className={`risk risk-${risk || "low"}`}>{(risk || "low").toUpperCase()} RISK</span>;
}

function SummaryCard({ label, value }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong title={formatValue(value)}>{formatValue(value)}</strong>
    </div>
  );
}

export default function Home() {
  const pickerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rawOpen, setRawOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const filteredGroups = useMemo(() => {
    if (!data?.grouped) return [];
    const needle = query.trim().toLowerCase();
    return Object.entries(data.grouped)
      .map(([group, tags]) => [
        group,
        needle
          ? tags.filter((item) => `${item.key} ${formatValue(item.value)}`.toLowerCase().includes(needle))
          : tags,
      ])
      .filter(([, tags]) => tags.length > 0)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [data, query]);

  async function inspect(selected) {
    if (!selected) return;
    setFile(selected);
    setData(null);
    setError("");
    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", selected);
      const response = await fetch(`${API_BASE}/api/inspect`, { method: "POST", body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Inspection failed.");
      setData(payload);
    } catch (err) {
      setError(err.message || "Inspection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clean(profile) {
    if (!file) return;
    setCleaning(profile);
    setError("");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("profile", profile);
      const response = await fetch(`${API_BASE}/api/clean`, { method: "POST", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Clean operation failed.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const name = encoded ? decodeURIComponent(encoded) : `clean-${file.name}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Clean operation failed.");
    } finally {
      setCleaning("");
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    inspect(event.dataTransfer.files?.[0]);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">E</span><div><b>EXIF LENS</b><small>metadata inspector</small></div></div>
        <span className="local-pill">EXIFTOOL · SERVER-SIDE</span>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">SEE WHAT THE FILE REMEMBERS</p>
          <h1>Inspect metadata.<br /><em>Expose the quiet details.</em></h1>
          <p className="hero-copy">Drop a photo, video, PDF, audio file, or other ExifTool-supported file. We surface useful metadata, flag privacy-sensitive fields, and let you make a cleaned copy.</p>
        </div>
        <div className="hero-orbit" aria-hidden="true"><div className="orbital-core">EXIF</div></div>
      </section>

      <section
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => pickerRef.current?.click()}
      >
        <input ref={pickerRef} type="file" hidden onChange={(e) => inspect(e.target.files?.[0])} />
        <div className="drop-icon">＋</div>
        <div>
          <strong>{file ? file.name : "Drop a file here"}</strong>
          <span>{busy ? "Reading metadata…" : file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · click to replace` : "or click to choose one"}</span>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      {data && (
        <>
          <section className="section-head">
            <div><span className="section-number">01</span><h2>File overview</h2></div>
            <RiskBadge risk={data.privacy?.risk} />
          </section>

          <section className="summary-grid">
            <SummaryCard label="TYPE" value={data.summary?.mimeType || data.summary?.fileType} />
            <SummaryCard label="DIMENSIONS" value={data.summary?.width && data.summary?.height ? `${data.summary.width} × ${data.summary.height}` : null} />
            <SummaryCard label="DEVICE" value={[data.summary?.make, data.summary?.model].filter(Boolean).join(" ") || null} />
            <SummaryCard label="CAPTURED" value={data.summary?.capturedAt} />
            <SummaryCard label="SOFTWARE" value={data.summary?.software} />
            <SummaryCard label="ALTITUDE" value={data.summary?.gpsAltitude} />
          </section>

          <section className="privacy-panel">
            <div className="privacy-title">
              <div><span className="section-number">02</span><h2>Privacy scan</h2></div>
              <span>{data.privacy?.findings?.length || 0} flagged fields</span>
            </div>

            {data.privacy?.findings?.length ? (
              <div className="finding-list">
                {data.privacy.findings.slice(0, 12).map((finding) => (
                  <div className="finding" key={finding.key}>
                    <span className={`severity severity-${finding.severity}`}>{finding.severity}</span>
                    <div><b>{finding.reason}</b><small>{finding.key}</small></div>
                    <code>{formatValue(finding.value)}</code>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No obvious location, serial-number, owner, or host metadata was detected.</p>
            )}

            <div className="clean-actions">
              <div><b>Make a share-safe copy</b><span>Your original file is never modified.</span></div>
              <button onClick={() => clean("privacy")} disabled={!!cleaning}>{cleaning === "privacy" ? "Cleaning…" : "Remove privacy metadata"}</button>
              <button className="ghost" onClick={() => clean("all")} disabled={!!cleaning}>{cleaning === "all" ? "Cleaning…" : "Strip all metadata"}</button>
            </div>
          </section>

          <section className="metadata-section">
            <div className="metadata-toolbar">
              <div><span className="section-number">03</span><h2>Metadata explorer</h2></div>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tags or values…" />
            </div>

            <div className="groups">
              {filteredGroups.map(([group, tags]) => (
                <details key={group} open={["EXIF", "File", "System", "Composite"].includes(group)}>
                  <summary><span>{group}</span><small>{tags.length} tags</small></summary>
                  <div className="tag-table">
                    {tags.map((item) => (
                      <div className="tag-row" key={item.key}>
                        <code>{item.tag}</code>
                        <span>{formatValue(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="raw-section">
            <button className="raw-toggle" onClick={() => setRawOpen(!rawOpen)}>{rawOpen ? "Hide raw JSON" : "Show raw JSON"}</button>
            {rawOpen && <pre>{JSON.stringify(data.raw, null, 2)}</pre>}
          </section>
        </>
      )}

      <footer><span>EXIF LENS</span><p>Files are processed temporarily by the API and removed after the request.</p></footer>
    </main>
  );
}
