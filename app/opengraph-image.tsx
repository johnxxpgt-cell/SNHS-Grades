import { ImageResponse } from "next/og";

export const alt = "SNHS Gradebook — Salvacion National High School";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", padding: "64px 76px", background: "#f6f6f2", color: "#0c2048",
        fontFamily: "Georgia, serif", position: "relative"
      }}>
        <div style={{ position: "absolute", right: -80, top: -150, width: 560, height: 560, borderRadius: 280, border: "1px solid #d7dccc", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "Arial, sans-serif", fontSize: 24, letterSpacing: 5, fontWeight: 700 }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, background: "#112a59", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, letterSpacing: 0 }}>SNHS</div>
          <div style={{ display: "flex", flexDirection: "column" }}><span>SNHS</span><span style={{ fontSize: 13, letterSpacing: 4, color: "#667487", marginTop: 4 }}>GRADEBOOK</span></div>
        </div>
        <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontFamily: "Arial, sans-serif", color: "#657285", fontSize: 20, letterSpacing: 4 }}>SALVACION NATIONAL HIGH SCHOOL</div>
          <div style={{ fontSize: 68, lineHeight: 1.03, letterSpacing: -2 }}>School records,<br />made clear.</div>
          <div style={{ fontFamily: "Arial, sans-serif", fontSize: 24, color: "#58677a", maxWidth: 750 }}>A clear, secure grade portal for students and teachers in Busuanga, Palawan.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Arial, sans-serif", fontSize: 15, color: "#667487", letterSpacing: 3 }}>
          <span>STUDENT GRADE RECORDS</span><span>BUSUANGA · PALAWAN</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
