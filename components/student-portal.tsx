"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { toWebpDataUrl } from "@/lib/student-images";

type SchoolSection = { id: string; grade_level: number; section_name: string; academic_year: string };
type Subject = { id: string; subject: string; quarters: (number | null)[]; finalGrade: number | null; updatedAt: string };
type LookupResult = {
  student: {
    fullName: string;
    avatar: string | null;
    section: { grade_level: number; section_name: string; academic_year: string };
  };
  subjects: Subject[];
};

export function StudentPortal() {
  const [mode, setMode] = useState<"lookup" | "register">("lookup");
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [lrn, setLrn] = useState("");
  const [birthday, setBirthday] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [gender, setGender] = useState("Prefer not to say");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);

  const loadSections = useCallback(async () => {
    setSectionLoading(true);
    try {
      const response = await fetch("/api/sections", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sections could not be loaded.");
      setSections(payload.sections ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sections could not be loaded.");
    } finally {
      setSectionLoading(false);
    }
  }, []);

  useEffect(() => { void loadSections(); }, [loadSections]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "register") setMode("register");
  }, []);

  function switchMode(next: "lookup" | "register") {
    setMode(next);
    setError("");
    setNotice("");
    setResult(null);
    if (next === "register" && !sections.length) void loadSections();
  }

  async function handleLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice(""); setResult(null);
    try {
      const response = await fetch("/api/students/lookup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, lrn })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We couldn’t retrieve those grades.");
      setResult(payload as LookupResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t retrieve those grades.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/students/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, lrn, birthday, sectionId, gender, avatar })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Registration could not be completed.");
      setNotice(`${payload.message} You’re registered for Grade ${payload.gradeLevel} — ${payload.sectionName}.`);
      setFullName(""); setLrn(""); setBirthday(""); setSectionId(""); setGender("Prefer not to say"); setAvatar(null); setAvatarName("");
      setMode("lookup");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto(file?: File) {
    if (!file) return;
    setError("");
    try {
      setAvatar(await toWebpDataUrl(file));
      setAvatarName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not process this photo.");
    }
  }

  const reportedFinals = result?.subjects.map((subject) => subject.finalGrade).filter((grade): grade is number => grade !== null) ?? [];
  const average = reportedFinals.length
    ? Math.round(reportedFinals.reduce((sum, grade) => sum + grade, 0) / reportedFinals.length)
    : null;

  return (
    <main className="portal-page student-portal-page">
      <div className="portal-shell">
        <PortalHeader />
        <div className="portal-layout">
          <section className="portal-main-column">
            <div className="portal-intro">
              <span className="section-kicker">STUDENT SERVICES</span>
              <h1>Your school record,<br /><em>right at hand.</em></h1>
              <p>Use your full name and LRN to view the grades recorded by your teacher.</p>
            </div>
            <div className="portal-workspace">
              <div className="portal-tabs" role="tablist" aria-label="Student options">
                <button className={mode === "lookup" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={mode === "lookup"} onClick={() => switchMode("lookup")}>View my grades <span>01</span></button>
                <button className={mode === "register" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={mode === "register"} onClick={() => switchMode("register")}>Register as a student <span>02</span></button>
              </div>

              {mode === "lookup" ? (
                <div className="form-panel">
                  <div className="form-heading"><div><span className="form-overline">STUDENT ACCESS</span><h2>Find your grades</h2></div><span className="round-icon" aria-hidden="true">⌕</span></div>
                  <p className="form-description">Enter your details exactly as they were registered. Your LRN stays private and is never shown on the report.</p>
                  <form className="form-stack" onSubmit={handleLookup}>
                    <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required minLength={3} maxLength={120} placeholder="e.g. Juan Dela Cruz" /></label>
                    <label className="field"><span>Learner Reference Number <small>LRN</small></span><input value={lrn} onChange={(event) => setLrn(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" autoComplete="off" required minLength={8} maxLength={20} placeholder="Enter your LRN" /></label>
                    <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Looking up grades…</> : <>View my grades <span aria-hidden="true">→</span></>}</button>
                  </form>
                  {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                  {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                  <div className="privacy-note"><span aria-hidden="true">⌑</span><p><b>Your details are protected.</b> Grade lookups are private and monitored to prevent repeated guessing.</p></div>
                </div>
              ) : (
                <div className="form-panel">
                  <div className="form-heading"><div><span className="form-overline">NEW STUDENT</span><h2>Join your class</h2></div><span className="round-icon" aria-hidden="true">＋</span></div>
                  <p className="form-description">Register with your student details. Your grade level is assigned from the class section your teacher has opened.</p>
                  <form className="form-stack" onSubmit={handleRegister}>
                    <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required minLength={3} maxLength={120} placeholder="As shown on your school record" /></label>
                    <div className="field-row">
                      <label className="field"><span>LRN</span><input value={lrn} onChange={(event) => setLrn(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" autoComplete="off" required minLength={8} maxLength={20} placeholder="8–20 digits" /></label>
                      <label className="field"><span>Birthday</span><input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} autoComplete="bday" required max={new Date().toISOString().slice(0, 10)} /></label>
                    </div>
                    <label className="field"><span>Class section <small>Grade level is assigned automatically</small></span>
                      <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} required disabled={sectionLoading || !sections.length}>
                        <option value="">{sectionLoading ? "Loading open sections…" : sections.length ? "Choose your section" : "No sections open for registration"}</option>
                        {sections.map((section) => <option key={section.id} value={section.id}>Grade {section.grade_level} — {section.section_name} · {section.academic_year}</option>)}
                      </select>
                    </label>
                    {!sectionLoading && !sections.length && <p className="inline-hint">Ask your teacher to open student registration for their class.</p>}
                    <div className="field-row">
                      <label className="field"><span>Gender <small>Optional</small></span><select value={gender} onChange={(event) => setGender(event.target.value)}><option>Prefer not to say</option><option>Female</option><option>Male</option></select></label>
                      <label className="field"><span>Profile photo <small>Optional</small></span><span className="photo-control"><input type="file" accept="image/*" onChange={(event) => void handlePhoto(event.target.files?.[0])} /><span className="photo-faux">{avatar ? "Photo ready · WebP" : "Choose a photo"}</span></span></label>
                    </div>
                    {avatar && <div className="photo-preview"><img src={avatar} alt="Selected student profile preview" /><span>{avatarName} <small>converted to WebP</small></span><button type="button" onClick={() => { setAvatar(null); setAvatarName(""); }}>Remove</button></div>}
                    <button className="button button-primary form-submit" type="submit" disabled={busy || sectionLoading || !sections.length}>{busy ? <><span className="spinner" /> Registering…</> : <>Register student <span aria-hidden="true">→</span></>}</button>
                  </form>
                  {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                  <div className="privacy-note"><span aria-hidden="true">⌑</span><p><b>Check your details before submitting.</b> LRNs can only be registered once. For corrections, ask your teacher.</p></div>
                </div>
              )}
            </div>
          </section>

          <aside className="portal-side-column">
            {result ? (
              <section className="student-result-card">
                <div className="result-topline"><span className="result-badge"><i /> VERIFIED RECORD</span><button className="result-close" type="button" aria-label="Close grade report" onClick={() => setResult(null)}>×</button></div>
                <div className="result-student">
                  {result.student.avatar ? <img className="result-avatar" src={result.student.avatar} alt="" /> : <div className="result-avatar initials-avatar">{result.student.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>}
                  <div><h2>{result.student.fullName}</h2><p>Grade {result.student.section.grade_level} · {result.student.section.section_name}</p></div>
                </div>
                <div className="result-average"><div><span>OVERALL AVERAGE</span><small>{result.student.section.academic_year}</small></div><strong>{average ?? "—"}<small>{average === null ? "" : "/ 100"}</small></strong></div>
                <div className="grades-table-wrap">
                  <table className="grades-table"><thead><tr><th>Subject</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Final</th></tr></thead>
                    <tbody>{result.subjects.map((subject) => <tr key={subject.id}><td>{subject.subject}</td>{subject.quarters.map((quarter, index) => <td key={index}>{quarter ?? <span className="unreported">—</span>}</td>)}<td><span className={subject.finalGrade !== null && subject.finalGrade >= 75 ? "grade-pill pass" : "grade-pill"}>{subject.finalGrade ?? "—"}</span></td></tr>)}</tbody>
                  </table>
                  {!result.subjects.length && <div className="empty-report"><span>✳</span><b>No grades posted yet</b><p>Your teacher hasn’t entered grades for this record. Check back later.</p></div>}
                </div>
                {result.subjects.length > 0 && <div className="report-legend"><span><i className="legend-pass" /> Passing</span><span><i /> Grade not yet posted</span></div>}
                <p className="report-footnote">For questions about a grade, please contact your subject teacher.</p>
              </section>
            ) : (
              <div className="student-aside-card">
                <div className="aside-emblem"><img src="/snhs-logo.webp" alt="Salvacion National High School seal" /></div>
                <span className="section-kicker">YOUR STUDENT PORTAL</span>
                <h2>See each subject,<br /><em>one term at a time.</em></h2>
                <p>Your report keeps every subject and quarter together, with the final average clearly marked.</p>
                <div className="aside-rule" />
                <div className="aside-steps"><div><span>01</span><p>Enter your name and LRN</p></div><div><span>02</span><p>Review your latest grades</p></div></div>
                <div className="aside-bottom"><span className="mini-shield">✓</span> Protected student records</div>
              </div>
            )}
            <p className="side-help">Need help? <Link href="/teacher">Contact your teacher <span aria-hidden="true">↗</span></Link></p>
          </aside>
        </div>
        <footer className="portal-footer"><span>© {new Date().getFullYear()} SNHS Gradebook</span><span>Salvacion National High School · Busuanga, Palawan</span><Link href="/">Home</Link></footer>
      </div>
    </main>
  );
}
