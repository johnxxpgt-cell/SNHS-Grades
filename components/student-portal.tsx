"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { toWebpBlob } from "@/lib/student-images";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

type SchoolSection = { id: string; grade_level: number; section_name: string; academic_year: string; adviserName: string };
type Subject = { id: string; subject: string; terms: (number | null)[]; finalGrade: number | null; updatedAt: string };
type Assessment = { id: string; category: "Quiz" | "Activity" | "Exam" | "Written Works" | "Performance Tasks" | "Summative Test/Exam"; name: string; score: number; maxScore: number; assessedOn: string; updatedAt: string; subject: string | null; termNumber: number | null; source: "legacy" | "scorebook" };
type LookupResult = {
  student: {
    fullName: string;
    avatar: string | null;
    section: { grade_level: number; section_name: string; academic_year: string };
    adviserName: string;
  };
  subjects: Subject[];
  availableSubjects: string[];
  assessments: Assessment[];
  teacherComment: string | null;
  commentUpdatedAt: string | null;
};

export function StudentPortal() {
  const [mode, setMode] = useState<"lookup" | "register">("lookup");
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [lrn, setLrn] = useState("");
  const [pin, setPin] = useState("");
  const [lookupPrivacyConsent, setLookupPrivacyConsent] = useState(false);
  const [registrationPrivacyConsent, setRegistrationPrivacyConsent] = useState(false);
  const [birthday, setBirthday] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [gender, setGender] = useState("Prefer not to say");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarName, setAvatarName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [feedbackGuardianName, setFeedbackGuardianName] = useState("");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackConsent, setFeedbackConsent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState("");

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
  useEffect(() => () => { if (avatar) URL.revokeObjectURL(avatar); }, [avatar]);
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
        body: JSON.stringify({
          fullName, lrn, pin,
          privacyConsent: lookupPrivacyConsent,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "We couldn’t retrieve those grades.");
      setResult(payload as LookupResult);
      setPin("");
      setFeedbackGuardianName(""); setFeedbackSubject(""); setFeedbackMessage(""); setFeedbackConsent(false); setFeedbackError(""); setFeedbackNotice("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t retrieve those grades.");
    } finally {
      setBusy(false);
    }
  }

  async function handleParentFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result) return;
    setFeedbackBusy(true); setFeedbackError(""); setFeedbackNotice("");
    try {
      const response = await fetch("/api/students/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          guardianName: feedbackGuardianName,
          subjectName: feedbackSubject,
          message: feedbackMessage,
          privacyConsent: feedbackConsent,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        const reference = typeof payload.requestId === "string" ? ` Reference ID: ${payload.requestId}.` : "";
        throw new Error(`${payload.error || "Feedback could not be sent."}${reference}`);
      }
      setFeedbackNotice(payload.message || `Your message was delivered to ${result.student.adviserName}.`);
      setFeedbackGuardianName(""); setFeedbackSubject(""); setFeedbackMessage(""); setFeedbackConsent(false);
    } catch (caught) {
      setFeedbackError(caught instanceof Error ? caught.message : "Feedback could not be sent.");
    } finally { setFeedbackBusy(false); }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("fullName", fullName);
      form.set("lrn", lrn);
      form.set("pin", pin);
      form.set("birthday", birthday);
      form.set("sectionId", sectionId);
      form.set("gender", gender);
      form.set("privacyConsent", registrationPrivacyConsent ? "accepted" : "");
      form.set("privacyNoticeVersion", PRIVACY_NOTICE_VERSION);
      if (avatarFile) form.set("photo", avatarFile, avatarFile.name);
      const response = await fetch("/api/students/register", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Registration could not be completed.");
      setNotice(`${payload.message} You’re registered for Grade ${payload.gradeLevel} — ${payload.sectionName}. Class adviser: ${payload.adviserName || "Class adviser not listed"}.`);
      setFullName(""); setLrn(""); setPin(""); setBirthday(""); setSectionId(""); setGender("Prefer not to say"); setAvatar(null); setAvatarFile(null); setAvatarName(""); setRegistrationPrivacyConsent(false);
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
      const blob = await toWebpBlob(file);
      setAvatar(URL.createObjectURL(blob));
      setAvatarFile(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "student-photo"}.webp`, { type: "image/webp" }));
      setAvatarName(file.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not process this photo.");
    }
  }

  const reportedFinals = result?.subjects.map((subject) => subject.finalGrade).filter((grade): grade is number => grade !== null) ?? [];
  const average = reportedFinals.length
    ? Math.round(reportedFinals.reduce((sum, grade) => sum + grade, 0) / reportedFinals.length)
    : null;

  async function downloadGradeReport() {
    if (!result || !result.subjects.length) return;
    setDownloadingReport(true);
    setDownloadError("");
    try {
      const width = 1200;
      const padding = 64;
      const tableTop = 410;
      const rowHeight = 68;
      const height = tableTop + 78 + result.subjects.length * rowHeight + 92;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not prepare the grade report image.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      const logo = new Image();
      logo.src = "/snhs-logo.webp";
      await logo.decode();
      context.save();
      context.beginPath();
      context.arc(padding + 46, 100, 46, 0, Math.PI * 2);
      context.clip();
      context.drawImage(logo, padding, 54, 92, 92);
      context.restore();

      context.fillStyle = "#17243c";
      context.font = "700 26px Arial, sans-serif";
      context.fillText("SALVACION NATIONAL HIGH SCHOOL", padding + 118, 91);
      context.fillStyle = "#7c8796";
      context.font = "500 17px Arial, sans-serif";
      context.fillText("BUSUANGA, PALAWAN", padding + 118, 122);
      context.textAlign = "right";
      context.fillStyle = "#17243c";
      context.font = "700 18px Arial, sans-serif";
      context.fillText("STUDENT GRADE REPORT", width - padding, 80);
      context.fillStyle = "#7c8796";
      context.font = "500 15px Arial, sans-serif";
      context.fillText(result.student.section.academic_year, width - padding, 108);
      context.textAlign = "left";

      context.strokeStyle = "#e4e8ed";
      context.lineWidth = 2;
      context.beginPath(); context.moveTo(padding, 174); context.lineTo(width - padding, 174); context.stroke();
      context.fillStyle = "#17243c";
      context.font = "700 27px Arial, sans-serif";
      context.fillText(result.student.fullName, padding, 224);
      context.fillStyle = "#697586";
      context.font = "500 18px Arial, sans-serif";
      context.fillText(`Grade ${result.student.section.grade_level} · ${result.student.section.section_name}`, padding, 257);

      context.fillStyle = "#17243c";
      context.fillRect(padding, 292, width - padding * 2, 78);
      context.fillStyle = "#cbd4e2";
      context.font = "700 14px Arial, sans-serif";
      context.fillText("OVERALL AVERAGE", padding + 24, 324);
      context.fillStyle = "#ffffff";
      context.font = "700 31px Arial, sans-serif";
      context.fillText(average === null ? "—" : `${average} / 100`, padding + 24, 353);
      context.textAlign = "right";
      context.fillStyle = "#cbd4e2";
      context.font = "500 14px Arial, sans-serif";
      context.fillText("GRADES BY SUBJECT AND TERM", width - padding - 24, 337);
      context.textAlign = "left";

      const columns = [padding, 570, 700, 830, 960, width - padding];
      const headerY = tableTop;
      context.fillStyle = "#f3f5f7";
      context.fillRect(padding, headerY, width - padding * 2, 64);
      context.fillStyle = "#667386";
      context.font = "700 15px Arial, sans-serif";
      context.fillText("SUBJECT", columns[0] + 15, headerY + 39);
      ["TERM 1", "TERM 2", "TERM 3", "FINAL"].forEach((label, index) => {
        context.textAlign = "center";
        context.fillText(label, (columns[index + 1] + columns[index + 2]) / 2, headerY + 39);
      });
      result.subjects.forEach((subject, index) => {
        const y = headerY + 64 + index * rowHeight;
        context.fillStyle = index % 2 === 0 ? "#ffffff" : "#fafbfc";
        context.fillRect(padding, y, width - padding * 2, rowHeight);
        context.strokeStyle = "#e8ebef";
        context.lineWidth = 1;
        context.beginPath(); context.moveTo(padding, y + rowHeight); context.lineTo(width - padding, y + rowHeight); context.stroke();
        context.textAlign = "left";
        context.fillStyle = "#354258";
        context.font = "600 17px Arial, sans-serif";
        let subjectName = subject.subject;
        while (subjectName.length > 3 && context.measureText(subjectName).width > columns[1] - columns[0] - 30) subjectName = `${subjectName.slice(0, -4)}…`;
        context.fillText(subjectName, columns[0] + 15, y + 42);
        subject.terms.forEach((grade, termIndex) => {
          context.textAlign = "center";
          context.fillStyle = grade === null ? "#aab2bd" : "#536176";
          context.font = "500 17px Arial, sans-serif";
          context.fillText(grade === null ? "—" : String(grade), (columns[termIndex + 1] + columns[termIndex + 2]) / 2, y + 42);
        });
        context.fillStyle = subject.finalGrade === null ? "#aab2bd" : subject.finalGrade >= 75 ? "#3f7352" : "#8a5148";
        context.font = "700 18px Arial, sans-serif";
        context.fillText(subject.finalGrade === null ? "—" : String(subject.finalGrade), (columns[4] + columns[5]) / 2, y + 42);
      });
      context.textAlign = "left";
      context.fillStyle = "#87919f";
      context.font = "500 13px Arial, sans-serif";
      context.fillText("For questions about a grade, please contact your subject teacher.", padding, height - 40);

      const imageBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!imageBlob) throw new Error("The grade report image could not be generated.");
      const url = URL.createObjectURL(imageBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${result.student.fullName.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "student"}-grade-report.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setDownloadError(caught instanceof Error ? caught.message : "The grade report image could not be downloaded.");
    } finally {
      setDownloadingReport(false);
    }
  }

  return (
    <main className="portal-page student-portal-page">
      <div className="portal-shell">
        <PortalHeader breadcrumbs={[{ label: "Home", href: "/" }, { label: "Student portal"}]} />
        <div className="portal-layout">
          <section className="portal-main-column">
            <div className="portal-intro">
              <span className="section-kicker">STUDENT SERVICES</span>
              <h1>Your school record,<br /><em>right at hand.</em></h1>
              <p>Use your full name, LRN, and private 4-digit PIN to view grades and teacher feedback.</p>
            </div>
            <div className="portal-workspace">
              <div className="student-mode-picker" aria-label="Choose a student service">
                <button className={mode === "lookup" ? "student-mode-choice active" : "student-mode-choice"} type="button" aria-pressed={mode === "lookup"} onClick={() => switchMode("lookup")}>
                  <span className="student-mode-kicker">ALREADY REGISTERED</span><strong>View my grades</strong><small>Use your name, LRN, and 4-digit PIN.</small><span className="student-mode-arrow" aria-hidden="true">→</span>
                </button>
                <button className={mode === "register" ? "student-mode-choice active" : "student-mode-choice"} type="button" aria-pressed={mode === "register"} onClick={() => switchMode("register")}>
                  <span className="student-mode-kicker">NEW STUDENT?</span><strong>Register here</strong><small>Join a class section opened by your teacher.</small><span className="student-mode-arrow" aria-hidden="true">＋</span>
                </button>
              </div>

              {mode === "lookup" ? (
                <div className="form-panel">
                  <div className="form-heading"><div><span className="form-overline">STUDENT ACCESS</span><h2>Find your grades</h2></div><span className="round-icon" aria-hidden="true">⌕</span></div>
                  <p className="form-description">Enter your registered name, LRN, and 4-digit PIN. Your LRN and PIN stay private and are never shown on the report.</p>
                  <form className="form-stack" onSubmit={handleLookup}>
                    <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required minLength={3} maxLength={120} placeholder="e.g. Juan Dela Cruz" /></label>
                    <label className="field"><span>Learner Reference Number <small>LRN</small></span><input value={lrn} onChange={(event) => setLrn(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" autoComplete="off" required minLength={8} maxLength={20} placeholder="Enter your LRN" /></label>
                    <label className="field"><span>4-digit PIN</span><input type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" required minLength={4} maxLength={4} placeholder="Enter your PIN" /><small className="field-help">If your record existed before PINs were added, your first successful lookup saves the PIN you enter.</small></label>
                    <label className="consent-row"><input type="checkbox" checked={lookupPrivacyConsent} onChange={(event) => setLookupPrivacyConsent(event.target.checked)} required /><span>I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link> and acknowledge that my details will be processed to verify and display my school record.</span></label>
                    <button className="button button-primary form-submit" type="submit" disabled={busy || !lookupPrivacyConsent}>{busy ? <><span className="spinner" /> Looking up grades…</> : <>View my grades <span aria-hidden="true">→</span></>}</button>
                  </form>
                  {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                  {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                  <div className="privacy-note"><span aria-hidden="true">⌑</span><p><b>Your details are protected.</b> Grade lookups are private and monitored to prevent repeated guessing.</p></div>
                </div>
              ) : (
                <div className="form-panel">
                  <div className="form-heading"><div><span className="form-overline">NEW STUDENT</span><h2>Join your class</h2></div><span className="round-icon" aria-hidden="true">＋</span></div>
                  <p className="form-description">Complete these steps once to join your class. Choose the section your teacher gave you; your grade level and class adviser will be assigned automatically.</p>
                  <ol className="registration-steps"><li>Enter your school-record details</li><li>Choose your Grade and Section</li><li>Review consent and register</li></ol>
                  <form className="form-stack" onSubmit={handleRegister}>
                    <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required minLength={3} maxLength={120} placeholder="As shown on your school record" /></label>
                    <div className="field-row">
                      <label className="field"><span>LRN</span><input value={lrn} onChange={(event) => setLrn(event.target.value.replace(/\D/g, "").slice(0, 20))} inputMode="numeric" autoComplete="off" required minLength={8} maxLength={20} placeholder="8–20 digits" /></label>
                      <label className="field"><span>Birthday</span><input type="date" value={birthday} onChange={(event) => setBirthday(event.target.value)} autoComplete="bday" required max={new Date().toISOString().slice(0, 10)} /></label>
                    </div>
                    <label className="field"><span>Create a 4-digit PIN</span><input type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" required minLength={4} maxLength={4} placeholder="Choose a private PIN" /><small className="field-help">Use this PIN with your name and LRN whenever you view your record.</small></label>
                    <label className="field"><span>Class section <small>Grade level is assigned automatically</small></span>
                      <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} required disabled={sectionLoading || !sections.length}>
                        <option value="">{sectionLoading ? "Loading open sections…" : sections.length ? "Choose your section" : "No sections open for registration"}</option>
                        {sections.map((section) => <option key={section.id} value={section.id}>Grade {section.grade_level} — {section.section_name} · {section.academic_year} · Adviser: {section.adviserName}</option>)}
                      </select>
                    </label>
                    {!sectionLoading && !sections.length && <p className="inline-hint">No sections are open yet. Ask your teacher to add a class section. Teachers can <Link href="/teacher">sign in or register here</Link>, then open their section for students.</p>}
                    <div className="field-row">
                      <label className="field"><span>Gender <small>Optional</small></span><select value={gender} onChange={(event) => setGender(event.target.value)}><option>Prefer not to say</option><option>Female</option><option>Male</option></select></label>
                      <label className="field"><span>Profile photo <small>Optional</small></span><span className="photo-control"><input type="file" accept="image/*" onChange={(event) => void handlePhoto(event.target.files?.[0])} /><span className="photo-faux">{avatar ? "Photo ready · WebP" : "Choose a photo"}</span></span></label>
                    </div>
                    {avatar && <div className="photo-preview"><img src={avatar} alt="Selected student profile preview" loading="lazy" decoding="async" /><span>{avatarName} <small>converted to WebP and stored securely</small></span><button type="button" onClick={() => { setAvatar(null); setAvatarFile(null); setAvatarName(""); }}>Remove</button></div>}
                    <label className="consent-row"><input type="checkbox" checked={registrationPrivacyConsent} onChange={(event) => setRegistrationPrivacyConsent(event.target.checked)} required /><span>I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link> and authorize processing of these details for student registration and school-record access. If registering a minor, I confirm that I am the student or have appropriate parent/guardian authority.</span></label>
                    <button className="button button-primary form-submit" type="submit" disabled={busy || sectionLoading || !sections.length || !registrationPrivacyConsent}>{busy ? <><span className="spinner" /> Registering…</> : <>Register student <span aria-hidden="true">→</span></>}</button>
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
                  {result.student.avatar ? <img className="result-avatar" src={result.student.avatar} alt="" loading="lazy" decoding="async" /> : <div className="result-avatar initials-avatar">{result.student.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div>}
                  <div><h2>{result.student.fullName}</h2><p>Grade {result.student.section.grade_level} · {result.student.section.section_name}<br /><small>Class adviser: {result.student.adviserName}</small></p></div>
                </div>
                <div className="result-average"><div><span>OVERALL AVERAGE</span><small>{result.student.section.academic_year}</small></div><strong>{average ?? "—"}<small>{average === null ? "" : "/ 100"}</small></strong></div>
                <div className="report-download-row"><button className="button button-outline report-download-button" type="button" onClick={() => void downloadGradeReport()} disabled={!result.subjects.length || downloadingReport}>{downloadingReport ? "Preparing image…" : "Download grade report image"}</button><span>Includes term and final grades only.</span></div>
                {downloadError && <p className="form-alert error-alert report-download-error" role="alert">{downloadError}</p>}
                <div className="grades-table-wrap">
                  <table className="grades-table"><thead><tr><th>Subject</th><th>Term 1</th><th>Term 2</th><th>Term 3</th><th>Final</th></tr></thead>
                    <tbody>{result.subjects.map((subject) => <tr key={subject.id}><td data-label="Subject">{subject.subject}</td>{subject.terms.map((term, index) => <td data-label={`Term ${index + 1}`} key={index}>{term ?? <span className="unreported">—</span>}</td>)}<td data-label="Final"><span className={subject.finalGrade !== null && subject.finalGrade >= 75 ? "grade-pill pass" : "grade-pill"}>{subject.finalGrade ?? "—"}</span></td></tr>)}</tbody>
                  </table>
                  {!result.subjects.length && <div className="empty-report"><span>✳</span><b>No grades posted yet</b><p>Your teacher hasn’t entered grades for this record. Check back later.</p></div>}
                </div>
                {result.subjects.length > 0 && <div className="report-legend"><span><i className="legend-pass" /> Passing</span><span><i /> Grade not yet posted</span></div>}
                {result.assessments.length > 0 && <section className="assessment-report"><div className="assessment-report-heading"><div><span className="form-overline">CLASSWORK & TESTS</span><h3>Assessment scores</h3></div><span>{result.assessments.length} recorded</span></div><div className="assessment-report-table-wrap"><table className="assessment-report-table"><thead><tr><th>SUBJECT</th><th>TERM</th><th>TYPE</th><th>ASSESSMENT</th><th>DATE</th><th>SCORE</th><th>RESULT</th></tr></thead><tbody>{result.assessments.map((assessment) => <tr key={assessment.id}><td data-label="Subject">{assessment.subject ?? "Other classwork"}</td><td data-label="Term">{assessment.termNumber ? `Term ${assessment.termNumber}` : "—"}</td><td data-label="Type"><span className={`assessment-kind ${assessment.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{assessment.category}</span></td><td data-label="Assessment">{assessment.name}</td><td data-label="Date">{new Date(`${assessment.assessedOn}T00:00:00`).toLocaleDateString()}</td><td data-label="Score">{assessment.score} / {assessment.maxScore}</td><td data-label="Result"><span className="grade-pill">{Math.round((assessment.score / assessment.maxScore) * 100)}%</span></td></tr>)}</tbody></table></div></section>}
                {result.teacherComment && <section className="student-teacher-comment"><div><span className="form-overline">A NOTE FROM YOUR TEACHER</span>{result.commentUpdatedAt && <small>Updated {new Date(result.commentUpdatedAt).toLocaleDateString()}</small>}</div><p>{result.teacherComment}</p></section>}
                <section className="student-teacher-comment parent-feedback-panel">
                  <div><span className="form-overline">PARENT / GUARDIAN SERVICES</span><h3>Send feedback to the class adviser</h3><p>Your message will be routed to <strong>{result.student.adviserName}</strong>, the teacher responsible for this registered section. Message contents are encrypted while stored.</p></div>
                  <form className="form-stack parent-feedback-fields" onSubmit={handleParentFeedback}>
                    <label className="field"><span>Parent or guardian name</span><input value={feedbackGuardianName} onChange={(event) => setFeedbackGuardianName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" placeholder="Enter your name" /></label>
                    <label className="field"><span>Subject (optional)</span><select value={feedbackSubject} onChange={(event) => setFeedbackSubject(event.target.value)}><option value="">General grade feedback</option>{result.availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                    <label className="field"><span>Message for the class adviser</span><textarea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value.slice(0, 2000))} required minLength={10} maxLength={2000} rows={4} placeholder="Ask a question or share feedback about the student's grades or progress…" /></label>
                    <label className="consent-row"><input type="checkbox" checked={feedbackConsent} onChange={(event) => setFeedbackConsent(event.target.checked)} required /><span>I consent to this message and my name being processed and shared with the student's assigned class adviser for school-related follow-up. See the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
                    {feedbackError && <p className="form-alert error-alert" role="alert">{feedbackError}</p>}
                    {feedbackNotice && <p className="form-alert success-alert" role="status">{feedbackNotice}</p>}
                    <button className="button button-primary form-submit" type="submit" disabled={feedbackBusy || !feedbackConsent}>{feedbackBusy ? "Sending securely…" : "Send feedback to adviser"}</button>
                  </form>
                </section>
                <p className="report-footnote">For questions about a grade, contact the assigned class adviser. Feedback can be sent from this verified grade report for 15 minutes after lookup.</p>
              </section>
            ) : (
              <div className="student-aside-card">
                <div className="aside-emblem"><img src="/snhs-logo.webp" alt="Salvacion National High School seal" /></div>
                <span className="section-kicker">YOUR STUDENT PORTAL</span>
                <h2>See each subject,<br /><em>one term at a time.</em></h2>
                <p>Your report keeps all three terms together, with the final average clearly marked.</p>
                <div className="aside-rule" />
                <div className="aside-steps"><div><span>01</span><p>Enter your name, LRN, and PIN</p></div><div><span>02</span><p>Review grades and teacher feedback</p></div></div>
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
