"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";

type GradeReport = {
  student: {
    fullName: string;
    avatar: string | null;
    section: { grade_level: number; section_name: string; academic_year: string };
    adviserName: string;
  };
  subjects: { id: string; subject: string; terms: (number | null)[]; finalGrade: number | null; updatedAt: string }[];
  availableSubjects: string[];
  assessments: { id: string; category: string; name: string; score: number; maxScore: number; assessedOn: string; updatedAt: string; subject: string | null; termNumber: number | null }[];
  teacherComment: string | null;
  commentUpdatedAt: string | null;
};

export function StudentGradeDashboard() {
  const router = useRouter();
  const [report, setReport] = useState<GradeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackConsent, setFeedbackConsent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function loadReport() {
      try {
        const response = await fetch("/api/students/session", { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 401) {
            router.replace("/student");
            return;
          }
          throw new Error(payload.error || "Grades could not be loaded.");
        }
        if (active) setReport(payload as GradeReport);
      } catch (error) {
        if (active) setLoadError(error instanceof Error ? error.message : "Grades could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadReport();
    return () => { active = false; };
  }, [router]);

  const finals = report?.subjects.map((subject) => subject.finalGrade).filter((grade): grade is number => grade !== null) ?? [];
  const average = finals.length ? Math.round(finals.reduce((sum, grade) => sum + grade, 0) / finals.length) : null;

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/students/logout", { method: "POST", cache: "no-store", credentials: "same-origin" });
    } finally {
      router.replace("/student");
      router.refresh();
    }
  }

  async function sendFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedbackBusy(true); setFeedbackError(""); setFeedbackNotice("");
    try {
      const response = await fetch("/api/students/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", credentials: "same-origin",
        body: JSON.stringify({ guardianName, subjectName: feedbackSubject, message: feedbackMessage, privacyConsent: feedbackConsent, privacyNoticeVersion: PRIVACY_NOTICE_VERSION })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Feedback could not be sent.");
      setFeedbackNotice(payload.message || "Feedback sent to the class adviser.");
      setGuardianName(""); setFeedbackSubject(""); setFeedbackMessage(""); setFeedbackConsent(false);
    } catch (error) {
      setFeedbackError(error instanceof Error ? error.message : "Feedback could not be sent.");
    } finally { setFeedbackBusy(false); }
  }

  function downloadGradeReport() {
    if (!report) return;
    const csvCell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["Student", report.student.fullName],
      ["Grade", report.student.section.grade_level],
      ["Section", report.student.section.section_name],
      ["Academic year", report.student.section.academic_year],
      ["Class adviser", report.student.adviserName],
      [],
      ["Subject", "Term 1", "Term 2", "Term 3", "Final"],
      ...report.subjects.map((subject) => [subject.subject, ...subject.terms, subject.finalGrade]),
    ];
    const csv = lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.student.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "student"}-grades.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const initials = useMemo(() => report?.student.fullName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() ?? "", [report?.student.fullName]);

  if (loading) return <main className="student-dashboard-page"><div className="student-dashboard-message">Loading grades…</div></main>;
  if (loadError) return <main className="student-dashboard-page"><div className="student-dashboard-message"><p>{loadError}</p><Link href="/student">Back to sign in</Link></div></main>;
  if (!report) return <main className="student-dashboard-page"><div className="student-dashboard-message">Loading grades…</div></main>;

  return (
    <main className="student-dashboard-page">
      <div className="student-dashboard-shell">
        <header className="student-dashboard-header">
          <Link className="student-dashboard-brand" href="/" aria-label="SNHS Gradebook home"><img src="/snhs-logo.webp" alt="" /><span>SNHS <small>GRADEBOOK</small></span></Link>
          <button className="student-logout-button" type="button" onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? "Signing out…" : "Log out"}</button>
        </header>

        <section className="student-dashboard-profile">
          {report.student.avatar ? <img className="student-dashboard-avatar" src={report.student.avatar} alt="" /> : <div className="student-dashboard-avatar student-dashboard-initials">{initials}</div>}
          <div className="student-dashboard-profile-copy">
            <p className="student-dashboard-kicker">MY GRADES</p>
            <h1>{report.student.fullName}</h1>
            <p>Grade {report.student.section.grade_level} · {report.student.section.section_name}</p>
            <p className="student-dashboard-muted">Adviser: {report.student.adviserName} · {report.student.section.academic_year}</p>
          </div>
        </section>

        <section className="student-dashboard-average" aria-label="Overall average">
          <span>Overall average</span>
          <strong>{average === null ? "—" : average}<small>{average === null ? "" : " / 100"}</small></strong>
        </section>

        <details className="student-dashboard-details" open>
          <summary><span>Subject grades</span><small>Term 1 · Term 2 · Term 3 · Final</small></summary>
          <div className="student-dashboard-table-wrap">
            <table className="student-dashboard-table">
              <thead><tr><th>Subject</th><th>Term 1</th><th>Term 2</th><th>Term 3</th><th>Final</th></tr></thead>
              <tbody>{report.subjects.map((subject) => <tr key={subject.id}>
                <td data-label="Subject">{subject.subject}</td>
                {subject.terms.map((term, index) => <td data-label={`Term ${index + 1}`} key={index}>{term ?? <span className="student-grade-empty">—</span>}</td>)}
                <td data-label="Final"><span className={`student-final-grade${subject.finalGrade !== null && subject.finalGrade >= 75 ? " is-passing" : ""}`}>{subject.finalGrade ?? "—"}</span></td>
              </tr>)}</tbody>
            </table>
            {!report.subjects.length && <p className="student-dashboard-empty">No grades have been posted yet.</p>}
          </div>
        </details>

        {report.teacherComment && <section className="student-dashboard-comment"><h2>Teacher feedback</h2><p>{report.teacherComment}</p>{report.commentUpdatedAt && <small>Updated {new Date(report.commentUpdatedAt).toLocaleDateString()}</small>}</section>}

        <details className="student-dashboard-details">
          <summary><span>Assessment scores</span><small>{report.assessments.length} recorded</small></summary>
          {report.assessments.length ? <div className="student-dashboard-table-wrap">
            <table className="student-dashboard-table student-assessment-table">
              <thead><tr><th>Subject</th><th>Term</th><th>Assessment</th><th>Score</th><th>Result</th></tr></thead>
              <tbody>{report.assessments.map((assessment) => <tr key={assessment.id}>
                <td data-label="Subject">{assessment.subject ?? "Other classwork"}</td>
                <td data-label="Term">{assessment.termNumber ? `Term ${assessment.termNumber}` : "—"}</td>
                <td data-label="Assessment">{assessment.name}<small className="student-assessment-kind">{assessment.category} · {new Date(`${assessment.assessedOn}T00:00:00`).toLocaleDateString()}</small></td>
                <td data-label="Score">{assessment.score} / {assessment.maxScore}</td>
                <td data-label="Result"><span className="student-final-grade">{Math.round(assessment.score / assessment.maxScore * 100)}%</span></td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="student-dashboard-empty">No assessment scores have been posted yet.</p>}
        </details>

        <details className="student-dashboard-details student-dashboard-feedback">
          <summary><span>Message class adviser</span><small>Parent / guardian feedback</small></summary>
          <form className="student-dashboard-feedback-form" onSubmit={sendFeedback}>
            <label>Parent or guardian name<input value={guardianName} onChange={(event) => setGuardianName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" /></label>
            <label>Subject (optional)<select value={feedbackSubject} onChange={(event) => setFeedbackSubject(event.target.value)}><option value="">General grade feedback</option>{report.availableSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
            <label>Message<textarea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value.slice(0, 2000))} required minLength={10} maxLength={2000} rows={3} placeholder="Write a question about grades or progress." /></label>
            <label className="student-dashboard-consent"><input type="checkbox" checked={feedbackConsent} onChange={(event) => setFeedbackConsent(event.target.checked)} required /><span>I agree to share this message with the class adviser under the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
            {feedbackError && <p className="student-dashboard-feedback-error" role="alert">{feedbackError}</p>}
            {feedbackNotice && <p className="student-dashboard-feedback-success" role="status">{feedbackNotice}</p>}
            <button className="student-dashboard-action" type="submit" disabled={feedbackBusy || !feedbackConsent}>{feedbackBusy ? "Sending…" : "Send feedback"}</button>
          </form>
        </details>

        <div className="student-dashboard-footer-actions"><button className="student-dashboard-download" type="button" onClick={downloadGradeReport} disabled={!report.subjects.length}>Download grades (CSV)</button></div>
      </div>
    </main>
  );
}
