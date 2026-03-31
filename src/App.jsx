import { useState, useRef, useEffect } from "react";

// ── PDF renderer ─────────────────────────────────────────────────
async function renderPDF(file) {
  const base64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });

  const pdfjsLib = window["pdfjs-dist/build/pdf"];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdfData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }

  let orderId = null;
  let date = "";
  try {
    const page1 = await pdf.getPage(1);
    const content = await page1.getTextContent();
    const text = content.items.map(i => i.str).join(" ");
    const mId = text.match(/(PO\d{6,})/);
    if (mId) orderId = mId[1];
    const mDate = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (mDate) date = mDate[1];
  } catch (e) {}

  if (!orderId) {
    try {
      const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "What is the Order ID (PO number) in this document? Reply with ONLY the PO number, nothing else. Example: PO0000050491" }
            ]
          }]
        })
      });
      const aiData = await aiResp.json();
      const block = aiData?.content?.find(b => b.type === "text");
      if (block) {
        const m = block.text.match(/(PO\d{6,})/);
        if (m) orderId = m[1];
      }
    } catch (e) {}
  }

  if (!orderId) orderId = file.name.replace(/\.pdf$/i, "");
  return { orderId, date, pages, filename: file.name };
}

// ── Clip decoration ───────────────────────────────────────────────
function Clip() {
  return (
    <div style={{ position: "relative", height: 48, display: "flex", justifyContent: "center", alignItems: "flex-end", marginBottom: 8 }}>
      <div style={{ width: 90, height: 54, background: "linear-gradient(180deg,#ccc,#888 60%,#aaa)", borderRadius: "6px 6px 0 0", position: "absolute", top: -6, zIndex: 2, boxShadow: "0 4px 10px rgba(0,0,0,0.4)", border: "1px solid #777" }}>
        {[10, 22].map(t => (
          <div key={t} style={{ position: "absolute", top: t, left: 8, right: 8, height: 6, background: "linear-gradient(90deg,#999,#fff,#999)", borderRadius: 3 }} />
        ))}
        <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", width: 14, height: 14, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#eee,#888)", border: "1px solid #666" }} />
      </div>
    </div>
  );
}

// ── HOME ──────────────────────────────────────────────────────────
function HomeScreen({ orders, onSelect, onAddMore, onRemove }) {
  const inputRef = useRef();
  const [loading, setLoading] = useState(false);
  const [loadingFile, setLoadingFile] = useState("");
  const [errors, setErrors] = useState([]);

  const handleFiles = async (files) => {
    setLoading(true); setErrors([]);
    const results = [], errs = [];
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".pdf")) continue;
      setLoadingFile(file.name);
      try { results.push(await renderPDF(file)); }
      catch (e) { errs.push(file.name + ": " + e.message); }
    }
    setLoading(false); setLoadingFile(""); setErrors(errs);
    if (results.length > 0) onAddMore(results);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#9e9e9e", backgroundImage: "repeating-linear-gradient(45deg,rgba(0,0,0,0.04) 0,rgba(0,0,0,0.04) 1px,transparent 0,transparent 50%)", backgroundSize: "8px 8px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "linear-gradient(160deg,#c8a96e,#a0784a)", borderRadius: 14, padding: "0 18px 20px", boxShadow: "0 10px 40px rgba(0,0,0,0.45)", width: "100%", maxWidth: 420 }}>
        <Clip />
        <div style={{ background: "#fff", borderRadius: 4, padding: 20, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.1)" }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e293b", marginBottom: 2 }}>Warehouse Clipboard</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>Upload PDFs to scan barcodes</div>

          {orders.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              {orders.map((o, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <button onClick={() => onSelect(o)}
                    style={{ flex: 1, textAlign: "left", padding: "12px 14px", borderRadius: 8, border: "2px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#f5a623"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{o.orderId}</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{o.pages.length} page(s) · {o.date || o.filename}</div>
                  </button>
                  <button onClick={() => onRemove(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#fee2e2", color: "#dc2626", fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>x</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0", color: "#94a3b8", fontSize: 13, marginBottom: 12 }}>No orders loaded yet</div>
          )}

          <div onClick={() => !loading && inputRef.current.click()}
            style={{ border: "2.5px dashed #f5a623", borderRadius: 12, padding: "20px 16px", textAlign: "center", cursor: loading ? "default" : "pointer", background: "#fffbeb", marginBottom: 8 }}>
            {loading ? (
              <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>Loading {loadingFile}...</div>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 4 }}>+</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e" }}>Upload PDF(s)</div>
                <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>Tap to browse · any PDF</div>
              </>
            )}
          </div>
          <input ref={inputRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />

          {errors.map((e, i) => (
            <div key={i} style={{ marginTop: 8, padding: 10, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, color: "#dc2626", fontSize: 11, wordBreak: "break-word" }}>{e}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── SLIDER VIEWER ─────────────────────────────────────────────────
function SliderViewer({ order, onBack }) {
  const [pageIdx, setPageIdx] = useState(0);
  const [windowActive, setWindowActive] = useState(false);
  const [sliderY, setSliderY] = useState(0.25);
  const [dragging, setDragging] = useState(false);
  const [imgHeight, setImgHeight] = useState(0);

  const imgRef = useRef();
  const dragStartY = useRef(0);
  const dragStartSlider = useRef(0);

  const WINDOW_FRAC = 0.05;
  const totalPages = order.pages.length;

  useEffect(() => {
    const update = () => { if (imgRef.current) setImgHeight(imgRef.current.clientHeight); };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [pageIdx]);

  const windowH = imgHeight * WINDOW_FRAC;
  const maxTop = Math.max(1, imgHeight - windowH);
  const windowTop = sliderY * maxTop;

  const startDrag = (clientY) => {
    dragStartY.current = clientY;
    dragStartSlider.current = sliderY;
    setDragging(true);
  };

  useEffect(() => {
    const onMove = (clientY) => {
      if (!dragging) return;
      const dy = clientY - dragStartY.current;
      const delta = dy / maxTop;
      setSliderY(Math.min(1, Math.max(0, dragStartSlider.current + delta)));
    };
    const onUp = () => setDragging(false);
    const mm = e => onMove(e.clientY);
    const tm = e => { e.preventDefault(); onMove(e.touches[0].clientY); };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, maxTop]);

  const nudge = (dir) => setSliderY(y => Math.min(1, Math.max(0, y + dir * 0.05)));

  const changePage = (newIdx) => {
    setPageIdx(newIdx);
    setSliderY(0.25);
    setImgHeight(0);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#222", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI',sans-serif", userSelect: "none" }}>

      {/* Top bar */}
      <div style={{ background: "#1e293b", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,0.4)", flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#f5a623", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
          &#8592; Orders
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>{order.orderId}</div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>{order.date || order.filename}</div>
        </div>
        {totalPages > 1 ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => changePage(Math.max(0, pageIdx - 1))} disabled={pageIdx === 0}
              style={{ background: "none", border: "1px solid #475569", color: pageIdx === 0 ? "#475569" : "#f5a623", borderRadius: 6, padding: "4px 8px", cursor: pageIdx === 0 ? "default" : "pointer", fontSize: 13 }}>&#8678;</button>
            <span style={{ color: "#94a3b8", fontSize: 11 }}>{pageIdx + 1}/{totalPages}</span>
            <button onClick={() => changePage(Math.min(totalPages - 1, pageIdx + 1))} disabled={pageIdx === totalPages - 1}
              style={{ background: "none", border: "1px solid #475569", color: pageIdx === totalPages - 1 ? "#475569" : "#f5a623", borderRadius: 6, padding: "4px 8px", cursor: pageIdx === totalPages - 1 ? "default" : "pointer", fontSize: 13 }}>&#8680;</button>
          </div>
        ) : <div style={{ width: 60 }} />}
      </div>

      {/* Page image */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: windowActive ? 120 : 80 }}>
        <div style={{ position: "relative", width: "100%" }}>
          <img
            ref={imgRef}
            src={order.pages[pageIdx]}
            alt="pdf page"
            style={{ width: "100%", display: "block" }}
            onLoad={() => { if (imgRef.current) setImgHeight(imgRef.current.clientHeight); }}
          />
          {windowActive && imgHeight > 0 && (
            <>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: windowTop, background: "rgba(0,0,0,0.80)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: windowTop, height: windowH, pointerEvents: "none", boxShadow: "0 0 0 3px #f5a623, 0 0 0 6px rgba(245,166,35,0.25)", zIndex: 2 }} />
              <div style={{ position: "absolute", left: 0, right: 0, top: windowTop + windowH, bottom: 0, background: "rgba(0,0,0,0.80)", pointerEvents: "none" }} />
              <div
                style={{ position: "absolute", right: -24, top: windowTop + windowH / 2 - 20, width: 46, height: 40, background: "linear-gradient(180deg,#ffe082,#f5a623)", border: "2px solid #c47d0e", borderRadius: 8, boxShadow: "0 3px 10px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: dragging ? "grabbing" : "grab", zIndex: 10, touchAction: "none" }}
                onMouseDown={e => { e.preventDefault(); startDrag(e.clientY); }}
                onTouchStart={e => { e.preventDefault(); startDrag(e.touches[0].clientY); }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 22, height: 2, background: "#c47d0e", borderRadius: 1 }} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 51, background: "#1e293b", boxShadow: "0 -4px 16px rgba(0,0,0,0.4)" }}>
        {windowActive && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #334155" }}>
            <button onClick={() => nudge(-1)} style={{ width: 48, height: 44, borderRadius: 8, border: "none", background: "#334155", color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>&#8679;</button>
            <div style={{ flex: 1 }}>
              <div style={{ background: "#334155", borderRadius: 99, height: 8 }}>
                <div style={{ background: "#f5a623", borderRadius: 99, height: 8, width: (sliderY * 100) + "%", transition: "width 0.1s" }} />
              </div>
            </div>
            <button onClick={() => nudge(1)} style={{ width: 48, height: 44, borderRadius: 8, border: "none", background: "#334155", color: "#fff", fontSize: 20, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>&#8681;</button>
          </div>
        )}
        <div style={{ padding: "10px 16px" }}>
          <button onClick={() => setWindowActive(w => !w)} style={{ width: "100%", padding: "13px 0", borderRadius: 8, border: "none", background: windowActive ? "#dc2626" : "#f5a623", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            {windowActive ? "✕ Disable Scan Window" : "▣ Enable Scan Window"}
          </button>
        </div>
      </div>

    </div>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────
export default function App() {
  const [orders, setOrders] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window["pdfjs-dist/build/pdf"].GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    };
    document.head.appendChild(s);
  }, []);

  const addOrders = (list) => setOrders(prev => {
    const ids = new Set(prev.map(o => o.orderId));
    return [...prev, ...list.filter(o => !ids.has(o.orderId))];
  });

  if (active) return <SliderViewer order={active} onBack={() => setActive(null)} />;
  return <HomeScreen orders={orders} onSelect={setActive} onAddMore={addOrders} onRemove={i => setOrders(p => p.filter((_, idx) => idx !== i))} />;
}
