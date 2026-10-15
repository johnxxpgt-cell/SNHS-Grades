"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { ClassScorebook } from "@/components/class-scorebook";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toWebpBlob } from "@/lib/student-images";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import { PRIVACY_NOTICE_VERSION } from "@/lib/constants";
import Link from "next/link";

type TeacherUser = { id: string; email?: string };
type SchoolSection = { id: string; teacher_id: string; grade_level: number; section_name: string; academic_year: string; is_active: boolean };
type GradeRow = {
  id: string;
  subject_name: string;
  semester_1: number | string | null;
  semester_2: number | string | null;
  semester_3: number | string | null;
  updated_by: string;
};
type AssessmentRow = { id: string; category: "Quiz" | "Activity" | "Exam"; assessment_name: string; score: number | string; max_score: number | string; assessed_on: string; updated_by: string; updated_at: string };
type StudentCommentRow = { comment: string; updated_by: string; updated_at: string };
type StudentRow = { id: string; full_name: string; gender: string; avatar_url: string | null; registered_at: string; subject_grades: GradeRow[]; student_assessments: AssessmentRow[]; student_teacher_comments: StudentCommentRow[] | StudentCommentRow | null };
type GradeDraft = { subjectName: string; semesters: [string, string, string] };

function teacherCommentFor(student?: StudentRow) {
  const relation = student?.student_teacher_comments;
  const row = Array.isArray(relation) ? relation[0] : relation;
  return row?.comment ?? "";
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function academicYear() {
  return getCurrentAcademicYear();
}

function teacherConfirmationUrl() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || window.location.origin;
  return new URL("/auth/callback?next=/teacher", configuredOrigin).toString();
}

function averageFor(rows: GradeRow[]) {
  const averages = rows.map((row) => {
    const values = [row.semester_1, row.semester_2, row.semester_3].filter((value) => value !== null).map(Number);
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  }).filter((value): value is number => value !== null);
  return averages.length ? Math.round(averages.reduce((total, value) => total + value, 0) / averages.length) : null;
}

function gradesToDrafts(grades: GradeRow[]): GradeDraft[] {
  return grades.length ? grades.map((row) => ({
    subjectName: row.subject_name,
    semesters: [row.semester_1, row.semester_2, row.semester_3].map((value) => value === null ? "" : String(value)) as GradeDraft["semesters"]
  })) : [{ subjectName: "", semesters: ["", "", ""] }];
}

export function TeacherPortal() {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<TeacherUser | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [teacherGender, setTeacherGender] = useState("Prefer not to say");
  const [profileName, setProfileName] = useState("");
  const [profileGender, setProfileGender] = useState("Prefer not to say");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileAvatarPath, setProfileAvatarPath] = useState<string | null>(null);
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [drafts, setDrafts] = useState<GradeDraft[]>([]);
  const [assessmentCategory, setAssessmentCategory] = useState<AssessmentRow["category"]>("Quiz");
  const [assessmentName, setAssessmentName] = useState("");
  const [assessmentScore, setAssessmentScore] = useState("");
  const [assessmentMaxScore, setAssessmentMaxScore] = useState("100");
  const [assessmentDate, setAssessmentDate] = useState(localDate);
  const [commentDraft, setCommentDraft] = useState("");
  const [search, setSearch] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [showClassScorebook, setShowClassScorebook] = useState(false);
  const [newGradeLevel, setNewGradeLevel] = useState("7");
  const [newSectionName, setNewSectionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newParentFeedbackCount, setNewParentFeedbackCount] = useState(0);

  useEffect(() => {
    if (!supabase) { setLoadingDashboard(false); return; }
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (!session) { setSections([]); setStudents([]); setSelectedStudentId(""); }
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("confirmed") !== "1") return;
    setNotice("Email confirmed. Your teacher account is ready. Add a class section to open registration for students.");
    url.searchParams.delete("confirmed");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const loadDashboard = useCallback(async (teacherId: string) => {
    if (!supabase) return;
    setLoadingDashboard(true); setError("");
    const [{ data: profile, error: profileError }, { data: classRows, error: classError }] = await Promise.all([
      supabase.from("teacher_profiles").select("full_name, gender, avatar_path, avatar_webp_data_url").eq("id", teacherId).maybeSingle(),
      supabase.from("teacher_sections").select("id, teacher_id, grade_level, section_name, academic_year, is_active").eq("teacher_id", teacherId).order("grade_level").order("section_name")
    ]);
    if (profileError || classError) setError("We couldn’t load your class data. Check that the Supabase schema has been installed.");
    setProfileName(profile?.full_name ?? "Teacher");
    setProfileGender(profile?.gender ?? "Prefer not to say");
    setProfileAvatarPath(profile?.avatar_path ?? null);
    if (profile?.avatar_path) {
      const { data: signedPhoto } = await supabase.storage.from("profile-photos").createSignedUrl(profile.avatar_path, 3600);
      setProfileAvatar(signedPhoto?.signedUrl ?? profile.avatar_webp_data_url ?? null);
    } else {
      setProfileAvatar(profile?.avatar_webp_data_url ?? null);
    }
    let rows = (classRows ?? []) as SchoolSection[];
    const inactiveIds = rows.filter((row) => !row.is_active).map((row) => row.id);
    if (inactiveIds.length) {
      await supabase.from("teacher_sections").update({ is_active: true }).in("id", inactiveIds).eq("teacher_id", teacherId);
      rows = rows.map((row) => ({ ...row, is_active: true }));
    }
    setSections(rows);
    setSelectedSectionId((previous) => rows.some((row) => row.id === previous) ? previous : rows[0]?.id ?? "");
    setLoadingDashboard(false);
  }, [supabase]);

  useEffect(() => { if (user) void loadDashboard(user.id); else setLoadingDashboard(false); }, [user, loadDashboard]);

  useEffect(() => {
    const teacherId = user?.id;
    // Capture and narrow the client before declaring the callback. The async
    // arrow below preserves this narrowing in TypeScript's closure analysis.
    const client = supabase;
    if (!client || !teacherId) { setNewParentFeedbackCount(0); return; }
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshFeedbackCount = async () => {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { if (active) setNewParentFeedbackCount(0); return; }
      try {
        const response = await fetch("/api/parent-feedback?summary=1", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store"
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setNewParentFeedbackCount(Number.isFinite(payload.unreadCount) ? Math.max(0, payload.unreadCount) : 0);
      } catch {
        // Keep the last count if the network is briefly unavailable.
      }
    };
    void refreshFeedbackCount();
    timer = setInterval(() => { void refreshFeedbackCount(); }, 60_000);
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [supabase, user?.id]);

  const loadRoster = useCallback(async (classId: string) => {
    if (!supabase || !classId) { setStudents([]); return; }
    setLoadingRoster(true); setError("");
    const { data, error: rosterError } = await supabase
      .from("students")
      .select("id, full_name, gender, avatar_path, avatar_webp_data_url, registered_at, subject_grades(id, subject_name, semester_1, semester_2, semester_3, updated_by), student_assessments(id, category, assessment_name, score, max_score, assessed_on, updated_by, updated_at), student_teacher_comments(comment, updated_by, updated_at)")
      .eq("section_id", classId)
      .order("full_name");
    if (rosterError) console.error("[teacher-portal] Roster query failed:", rosterError);
    if (rosterError) setError("We couldn’t load this class roster. Please refresh and try again.");
    const rows = (data ?? []) as (Omit<StudentRow, "avatar_url"> & { avatar_path: string | null; avatar_webp_data_url: string | null })[];
    const photoPaths = rows.flatMap((row) => row.avatar_path ? [row.avatar_path] : []);
    const signedPhotos = photoPaths.length
      ? await supabase.storage.from("profile-photos").createSignedUrls(photoPaths, 3600)
      : { data: [] };
    const signedByPath = new Map((signedPhotos.data ?? []).flatMap((photo) => photo.signedUrl ? [[photo.path, photo.signedUrl] as const] : []));
    setStudents(rows.map((row) => ({ ...row, avatar_url: row.avatar_path ? signedByPath.get(row.avatar_path) ?? null : row.avatar_webp_data_url })) as StudentRow[]);
    setLoadingRoster(false);
  }, [supabase]);

  useEffect(() => { if (selectedSectionId) void loadRoster(selectedSectionId); }, [selectedSectionId, loadRoster]);

  useEffect(() => {
    const selected = students.find((student) => student.id === selectedStudentId);
    setDrafts(selected ? gradesToDrafts(selected.subject_grades ?? []) : []);
    setCommentDraft(teacherCommentFor(selected));
  }, [selectedStudentId, students]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!supabase) { setError("Add your Supabase URL and publishable key to the environment settings first."); setBusy(false); return; }
    try {
      if (authMode === "register") {
        if (!privacyConsent) throw new Error("Please read the Privacy Policy and consent before creating an account.");
        if (password !== confirmPassword) throw new Error("Your passwords don’t match.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: {
            emailRedirectTo: teacherConfirmationUrl(),
            data: {
              full_name: fullName.trim(),
              gender: teacherGender,
              privacy_notice_version: PRIVACY_NOTICE_VERSION,
              privacy_notice_acknowledged_at: new Date().toISOString()
            }
          }
        });
        if (signUpError) throw signUpError;
        if (data.session && data.user) {
          setUser({ id: data.user.id, email: data.user.email });
          setNotice("Your teacher account is ready. Add your first class section to open student registration.");
        } else {
          setNotice("Account created. Open the confirmation link in your email to finish setup, then sign in and add your first class section.");
          setAuthMode("signin");
          setPassword(""); setConfirmPassword("");
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        if (data.user) setUser({ id: data.user.id, email: data.user.email });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t complete that request.");
    } finally { setBusy(false); }
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut(); setUser(null); setNotice("You’ve signed out securely.");
  }

  async function handleTeacherPhoto(file?: File) {
    if (!file || !supabase || !user) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const photo = await toWebpBlob(file);
      const path = `teachers/${user.id}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, photo, { contentType: "image/webp", cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data: signedPhoto, error: signError } = await supabase.storage.from("profile-photos").createSignedUrl(path, 3600);
      if (signError || !signedPhoto) {
        await supabase.storage.from("profile-photos").remove([path]);
        throw signError ?? new Error("The uploaded photo could not be opened.");
      }
      const { error: photoError } = await supabase.from("teacher_profiles").update({ avatar_path: path, avatar_webp_data_url: null }).eq("id", user.id);
      if (photoError) {
        await supabase.storage.from("profile-photos").remove([path]);
        throw photoError;
      }
      if (profileAvatarPath) await supabase.storage.from("profile-photos").remove([profileAvatarPath]);
      setProfileAvatarPath(path); setProfileAvatar(signedPhoto.signedUrl); setNotice("Your profile photo is saved as a WebP file.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your profile photo could not be saved.");
    } finally { setBusy(false); }
  }

  async function handleAddSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !user) return;
    setBusy(true); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.from("teacher_sections").insert({
      teacher_id: user.id, grade_level: Number(newGradeLevel), section_name: newSectionName.trim(), academic_year: academicYear(), is_active: true
    }).select("id, teacher_id, grade_level, section_name, academic_year, is_active").single();
    if (insertError) setError(insertError.code === "23505" ? "That section is already listed for this school year." : "We couldn’t add that class section.");
    else {
      setSections((previous) => [...previous, data as SchoolSection].sort((a, b) => a.grade_level - b.grade_level || a.section_name.localeCompare(b.section_name)));
      setSelectedSectionId(data.id); setNewSectionName(""); setShowAddSection(false); setNotice("Class section added and opened for registration.");
    }
    setBusy(false);
  }

  async function handleSaveGrades(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !selectedStudentId) return;
    setBusy(true); setError(""); setNotice("");
    const cleaned: { student_id: string; subject_name: string; semester_1: number | null; semester_2: number | null; semester_3: number | null; updated_by: string; updated_at: string }[] = [];
    for (const draft of drafts) {
      const subjectName = draft.subjectName.trim().replace(/\s+/g, " ");
      const rawValues = draft.semesters.map((value) => value.trim());
      if (!subjectName && rawValues.every((value) => !value)) continue;
      if (subjectName.length < 2) { setError("Enter a subject name for each row with grades."); setBusy(false); return; }
      const parsed: (number | null)[] = rawValues.map((value) => value === "" ? null : Number(value));
      if (parsed.some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))) {
        setError("Semester grades must be between 0 and 100."); setBusy(false); return;
      }
      if (parsed.every((value) => value === null)) { setError(`Add at least one semester grade for ${subjectName}.`); setBusy(false); return; }
      cleaned.push({ student_id: selectedStudentId, subject_name: subjectName, semester_1: parsed[0], semester_2: parsed[1], semester_3: parsed[2], updated_by: user.id, updated_at: new Date().toISOString() });
    }
    if (!cleaned.length) { setError("Enter at least one subject and grade before saving."); setBusy(false); return; }
    const { error: saveError } = await supabase.from("subject_grades").upsert(cleaned, { onConflict: "student_id,subject_name" });
    if (saveError) setError("Grades could not be saved. Check each value and try again.");
    else {
      await loadRoster(selectedSectionId);
      setNotice("Grade record saved.");
    }
    setBusy(false);
  }

  async function handleAddAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !selectedStudentId) return;
    setBusy(true); setError(""); setNotice("");
    const name = assessmentName.trim().replace(/\s+/g, " ");
    const score = Number(assessmentScore);
    const maxScore = Number(assessmentMaxScore);
    if (name.length < 2 || name.length > 100) { setError("Enter an assessment name between 2 and 100 characters."); setBusy(false); return; }
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore || maxScore > 100000) {
      setError("Enter a score from 0 up to the maximum points. Maximum points must be greater than 0."); setBusy(false); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) || Number.isNaN(new Date(`${assessmentDate}T00:00:00`).getTime())) {
      setError("Choose a valid assessment date."); setBusy(false); return;
    }
    const { error: insertError } = await supabase.from("student_assessments").insert({
      student_id: selectedStudentId,
      category: assessmentCategory,
      assessment_name: name,
      score,
      max_score: maxScore,
      assessed_on: assessmentDate,
      updated_by: user.id
    });
    if (insertError) setError("The assessment score could not be saved. Check the score and try again.");
    else {
      setAssessmentName(""); setAssessmentScore(""); setAssessmentDate(localDate());
      await loadRoster(selectedSectionId);
      setNotice("Assessment score saved and shared with the student.");
    }
    setBusy(false);
  }

  async function handleDeleteAssessment(assessmentId: string) {
    if (!supabase || !selectedStudentId) return;
    setBusy(true); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("student_assessments").delete().eq("id", assessmentId).eq("student_id", selectedStudentId);
    if (deleteError) setError("That assessment could not be removed.");
    else {
      await loadRoster(selectedSectionId);
      setNotice("Assessment removed from the student record.");
    }
    setBusy(false);
  }

  async function handleSaveComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !selectedStudentId) return;
    const comment = commentDraft.trim();
    if (comment.length > 1000) { setError("Keep the teacher comment to 1,000 characters or fewer."); return; }
    setBusy(true); setError(""); setNotice("");
    const result = comment
      ? await supabase.from("student_teacher_comments").upsert({ student_id: selectedStudentId, comment, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "student_id" })
      : await supabase.from("student_teacher_comments").delete().eq("student_id", selectedStudentId);
    if (result.error) setError("The teacher comment could not be saved.");
    else {
      await loadRoster(selectedSectionId);
      setNotice(comment ? "Teacher comment saved and shared with the student." : "Teacher comment removed from the student record.");
    }
    setBusy(false);
  }

  const selectedSection = sections.find((section) => section.id === selectedSectionId);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const hasTeacherComment = Boolean(teacherCommentFor(selectedStudent));
  const visibleStudents = useMemo(() => students.filter((student) => student.full_name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())), [students, search]);
  const classAverage = useMemo(() => {
    const values = students.map((student) => averageFor(student.subject_grades ?? [])).filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [students]);

  return (
    <main className="portal-page teacher-portal-page">
      <div className="portal-shell">
        <PortalHeader breadcrumbs={[{ label: "Home", href: "/" }, { label: "Teacher portal"}]} />
        {!supabase ? (
          <section className="setup-message"><span className="section-kicker">TEACHER SERVICES</span><h1>Set up your secure<br /><em>teacher workspace.</em></h1><p>Connect the Supabase project to enable teacher registration and class records.</p><div className="setup-code">NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY<br />SUPABASE_SECRET_KEY<br />SUPABASE_LRN_HMAC_SECRET<br />SUPABASE_DATA_ENCRYPTION_KEY<br />SUPABASE_CONTACT_ENCRYPTION_KEY</div><a href="/" className="text-link">← Return to home</a></section>
        ) : user ? (
          <section className="teacher-dashboard">
            <div className="dashboard-heading"><div><span className="section-kicker">TEACHER WORKSPACE</span><h1>Welcome back, <em>{profileName.split(" ")[0]}.</em></h1><p>Your class records, ready when you are.</p></div><div className="dashboard-account"><label className="account-photo-control" title="Upload profile photo">{profileAvatar ? <img src={profileAvatar} alt="Teacher profile" loading="lazy" decoding="async" /> : <span className="teacher-avatar">{profileName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<input type="file" accept="image/*" aria-label="Upload teacher profile photo" onChange={(event) => void handleTeacherPhoto(event.target.files?.[0])} /></label><div><b>{profileName}</b><small>{profileGender} · {user.email}</small></div><button className="signout-button" type="button" onClick={() => void handleSignOut()}>Sign out</button></div></div>
            {error && <p className="form-alert error-alert" role="alert">{error}</p>}
            {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
            <div className="dashboard-toolbar"><div><label htmlFor="teacher-section-select">CLASS SECTION</label><select id="teacher-section-select" value={selectedSectionId} onChange={(event) => { setSelectedSectionId(event.target.value); setSelectedStudentId(""); }} disabled={!sections.length}><option value="">{sections.length ? "Choose a section" : "No sections yet"}</option>{sections.map((section) => <option value={section.id} key={section.id}>Grade {section.grade_level} — {section.section_name} · {section.academic_year}</option>)}</select></div><div className="dashboard-toolbar-actions"><button type="button" className="button button-outline" onClick={() => setShowClassScorebook((value) => !value)} disabled={!selectedSectionId}>{showClassScorebook ? "Back to roster" : "Open class scorebook"}</button><Link href="/teacher/feedback" className="button button-outline feedback-inbox-link">Parent feedback inbox{newParentFeedbackCount > 0 ? <span className="feedback-count-badge">{newParentFeedbackCount} new</span> : null}</Link><button type="button" className="button button-outline" onClick={() => setShowAddSection((value) => !value)}>{showAddSection ? "Close" : "+ Add a section"}</button></div></div>
            {showAddSection && <form className="add-section-panel" onSubmit={handleAddSection}><div><span className="form-overline">NEW CLASS</span><h2>Open another section</h2><p>Students can register as soon as it’s added.</p></div><label className="field"><span>Grade level</span><select value={newGradeLevel} onChange={(event) => setNewGradeLevel(event.target.value)}>{[7, 8, 9, 10, 11, 12].map((grade) => <option value={grade} key={grade}>Grade {grade}</option>)}</select></label><label className="field"><span>Section name</span><input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} maxLength={40} required placeholder="e.g. Rizal" /></label><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add section"}</button></form>}
            {loadingDashboard ? <div className="dashboard-loading"><span className="spinner" /> Loading your workspace…</div> : sections.length ? (
              <>
                <div className="dashboard-stats"><div><span>CLASS ROSTER</span><b>{students.length.toString().padStart(2, "0")}<small> students</small></b></div><div><span>SUBJECT RECORDS</span><b>{students.reduce((sum, student) => sum + (student.subject_grades?.length ?? 0), 0).toString().padStart(2, "0")}<small> entered</small></b></div><div><span>CLASS AVERAGE</span><b>{classAverage ?? "—"}<small>{classAverage === null ? " no grades" : " / 100"}</small></b></div><div className="stats-school-year"><span>ACADEMIC YEAR</span><b>{selectedSection?.academic_year ?? academicYear()}</b></div></div>
                {showClassScorebook ? (selectedSection ? <ClassScorebook sectionId={selectedSection.id} sectionLabel={`Grade ${selectedSection.grade_level} — ${selectedSection.section_name}`} academicYear={selectedSection.academic_year} students={students.map((student) => ({ id: student.id, full_name: student.full_name }))} userId={user.id} /> : null) : <div className="teacher-workgrid">
                  <section className="roster-panel"><div className="panel-heading"><div><span className="form-overline">GRADE {selectedSection?.grade_level} · {selectedSection?.section_name}</span><h2>Class roster</h2></div><label className="roster-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student" aria-label="Find a student" /></label></div>
                    <div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>STUDENT</th><th>SUBJECTS</th><th>AVERAGE</th><th>RECORD</th></tr></thead><tbody>
                      {loadingRoster ? <tr><td colSpan={4} className="table-message"><span className="spinner" /> Loading roster…</td></tr> : visibleStudents.map((student) => {
                        const avg = averageFor(student.subject_grades ?? []);
                        return <tr key={student.id} className={selectedStudentId === student.id ? "selected-row" : ""}><td><div className="roster-person">{student.avatar_url ? <img src={student.avatar_url} alt="" loading="lazy" decoding="async" /> : <span className="roster-initials">{student.full_name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<span><b>{student.full_name}</b><small>{student.gender}</small></span></div></td><td>{student.subject_grades?.length ?? 0}</td><td>{avg === null ? <span className="unreported">—</span> : <span className={avg >= 75 ? "grade-pill pass" : "grade-pill"}>{avg}</span>}</td><td><button type="button" className="table-action" onClick={() => { setSelectedStudentId(student.id); setError(""); setNotice(""); }}>{selectedStudentId === student.id ? "Selected" : "Enter grades →"}</button></td></tr>;
                      })}
                      {!loadingRoster && !students.length && <tr><td colSpan={4} className="table-empty"><div className="empty-icon">✳</div><b>No students registered yet</b><p>Share the student portal with your class. Students can select Grade {selectedSection?.grade_level} — {selectedSection?.section_name} when they register.</p></td></tr>}
                      {!loadingRoster && students.length > 0 && !visibleStudents.length && <tr><td colSpan={4} className="table-message">No students match “{search}”.</td></tr>}
                    </tbody></table></div>
                    <div className="roster-footer"><span>{students.length} students in this section</span><span>Sorted alphabetically</span></div>
                  </section>
                  <section className="grade-editor-panel">
                    {selectedStudent ? <>
                      <div className="editor-heading"><div><span className="form-overline">GRADE ENTRY</span><h2>{selectedStudent.full_name}</h2><p>Enter grades from 0 to 100.</p></div><button type="button" aria-label="Close grade editor" className="editor-close" onClick={() => setSelectedStudentId("")}>×</button></div>
                      <form onSubmit={handleSaveGrades}>
                        <div className="grade-draft-heading"><span>SUBJECT</span><span>SEM 1</span><span>SEM 2</span><span>SEM 3</span></div>
                        <div className="grade-draft-list">{drafts.map((draft, index) => <div className="grade-draft-row" key={index}>
                          <input aria-label={`Subject ${index + 1}`} value={draft.subjectName} onChange={(event) => setDrafts((previous) => previous.map((item, row) => row === index ? { ...item, subjectName: event.target.value } : item))} maxLength={80} placeholder="Subject name" />
                          {draft.semesters.map((semester, semesterIndex) => <input key={semesterIndex} aria-label={`${draft.subjectName || `Subject ${index + 1}`} semester ${semesterIndex + 1}`} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={semester} onChange={(event) => setDrafts((previous) => previous.map((item, row) => row === index ? { ...item, semesters: item.semesters.map((value, s) => s === semesterIndex ? event.target.value : value) as GradeDraft["semesters"] } : item))} placeholder="—" />)}
                          {drafts.length > 1 && <button className="remove-draft" type="button" aria-label={`Remove subject row ${index + 1}`} onClick={() => setDrafts((previous) => previous.filter((_, row) => row !== index))}>×</button>}
                        </div>)}</div>
                        <button className="add-subject" type="button" onClick={() => setDrafts((previous) => [...previous, { subjectName: "", semesters: ["", "", ""] }])}>+ Add subject</button>
                        <button className="button button-primary editor-save" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Saving…</> : <>Save grade record <span aria-hidden="true">→</span></>}</button>
                      </form>
                      {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                      {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                      <p className="editor-note"><span className="mini-shield">✓</span> Only teachers assigned to this section can edit these records.</p>
                      <section className="assessment-editor">
                        <div className="assessment-section-heading"><span className="form-overline">CLASSWORK & TESTS</span><h3>Add an assessment score</h3><p>Scores are visible in the student portal as soon as they are saved.</p></div>
                        <form className="assessment-form" onSubmit={handleAddAssessment}>
                          <div className="field-row"><label className="field"><span>Type</span><select value={assessmentCategory} onChange={(event) => setAssessmentCategory(event.target.value as AssessmentRow["category"])}><option>Quiz</option><option>Activity</option><option>Exam</option></select></label><label className="field"><span>Date</span><input type="date" value={assessmentDate} onChange={(event) => setAssessmentDate(event.target.value)} required /></label></div>
                          <label className="field"><span>Assessment name</span><input value={assessmentName} onChange={(event) => setAssessmentName(event.target.value)} required minLength={2} maxLength={100} placeholder="e.g. Fractions quiz" /></label>
                          <div className="assessment-points-row"><label className="field"><span>Score</span><input type="number" inputMode="decimal" value={assessmentScore} onChange={(event) => setAssessmentScore(event.target.value)} required min="0" max="100000" step="0.01" placeholder="0" /></label><span className="points-divider">out of</span><label className="field"><span>Maximum points</span><input type="number" inputMode="decimal" value={assessmentMaxScore} onChange={(event) => setAssessmentMaxScore(event.target.value)} required min="0.01" max="100000" step="0.01" /></label></div>
                          <button className="button button-primary editor-save" type="submit" disabled={busy}>{busy ? "Saving…" : "Add score"}</button>
                        </form>
                        <div className="assessment-list" aria-label="Saved assessment scores">
                          {selectedStudent.student_assessments?.length ? selectedStudent.student_assessments.map((assessment) => <div className="assessment-list-row" key={assessment.id}><div className="assessment-list-detail"><span className={`assessment-kind ${assessment.category.toLowerCase()}`}>{assessment.category}</span><b>{assessment.assessment_name}</b><small>{assessment.assessed_on}</small></div><strong>{Number(assessment.score)}<small> / {Number(assessment.max_score)}</small></strong><button type="button" className="assessment-delete" onClick={() => { if (window.confirm(`Remove “${assessment.assessment_name}” from this student’s record?`)) void handleDeleteAssessment(assessment.id); }} disabled={busy} aria-label={`Remove ${assessment.assessment_name}`}>×</button></div>) : <p className="assessment-empty">No quiz, activity, or exam scores yet.</p>}
                        </div>
                      </section>
                      <section className="teacher-comment-editor">
                        <div className="assessment-section-heading"><span className="form-overline">TEACHER FEEDBACK</span><h3>Comment for this student</h3><p>This private teacher note appears on the student’s grade report.</p></div>
                        <form onSubmit={handleSaveComment}><label className="field"><span>Comment <small>{commentDraft.length}/1,000</small></span><textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value.slice(0, 1000))} maxLength={1000} rows={4} placeholder="Write a helpful note about progress, effort, or next steps…" /></label><button className="button button-outline editor-save" type="submit" disabled={busy}>{busy ? "Saving…" : hasTeacherComment ? (commentDraft.trim() ? "Update comment" : "Remove comment") : "Share comment"}</button></form>
                      </section>
                    </> : <div className="editor-empty"><span className="editor-empty-icon">✎</span><span className="form-overline">GRADE ENTRY</span><h2>Select a student<br />to get started.</h2><p>Choose a student from your roster to add or update their subject grades.</p></div>}
                  </section>
                </div>}
              </>
            ) : <div className="no-classes-panel"><div className="empty-icon">✳</div><h2>Your teacher account is ready.</h2><p>Add your grade level and section when you are ready to open student registration.</p><button className="button button-primary" type="button" onClick={() => setShowAddSection(true)}>+ Add your first section</button></div>}
          </section>
        ) : (
          <div className="teacher-auth-layout">
            <section className="teacher-auth-main"><div className="portal-intro"><span className="section-kicker">TEACHER SERVICES</span><h1>Good records make<br /><em>room to teach.</em></h1><p>Sign in to manage your class roster, semester grades, assessment scores, and feedback.</p></div>
              <div className="portal-workspace teacher-auth-workspace"><div className="portal-tabs" role="tablist" aria-label="Teacher account options"><button className={authMode === "signin" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={authMode === "signin"} onClick={() => { setAuthMode("signin"); setError(""); setNotice(""); }}>Sign in <span>01</span></button><button className={authMode === "register" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={authMode === "register"} onClick={() => { setAuthMode("register"); setError(""); setNotice(""); }}>Create teacher account <span>02</span></button></div>
                <div className="form-panel"><div className="form-heading"><div><span className="form-overline">{authMode === "signin" ? "WELCOME BACK" : "TEACHER REGISTRATION"}</span><h2>{authMode === "signin" ? "Sign in to your class" : "Create your teacher account"}</h2></div><span className="round-icon" aria-hidden="true">{authMode === "signin" ? "↗" : "＋"}</span></div>
                  <p className="form-description">{authMode === "signin" ? "Use the email address and password linked to your teacher account." : "Create your secure teacher login first. You can add a class section after signing in."}</p>
                  <form className="form-stack" onSubmit={handleAuth}>
                    {authMode === "register" && <><label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={3} maxLength={120} autoComplete="name" placeholder="Your name" /></label></>}
                    {authMode === "register" ? <div className="field-row"><label className="field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@school.edu.ph" /></label><label className="field"><span>Gender <small>Optional</small></span><select value={teacherGender} onChange={(event) => setTeacherGender(event.target.value)}><option>Prefer not to say</option><option>Female</option><option>Male</option></select></label></div> : <label className="field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@school.edu.ph" /></label>}
                    <label className="field"><span>Password {authMode === "register" && <small>At least 12 characters</small>}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={authMode === "register" ? 12 : 1} autoComplete={authMode === "signin" ? "current-password" : "new-password"} placeholder="Enter your password" /></label>
                    {authMode === "register" && <label className="field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} autoComplete="new-password" placeholder="Enter your password again" /></label>}
                    {authMode === "register" && <label className="consent-row"><input type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} required /><span>I have read the <Link href="/privacy" target="_blank">Privacy Policy</Link> and authorize processing of my account details to provide teacher services.</span></label>}
                    <button className="button button-primary form-submit" type="submit" disabled={busy || (authMode === "register" && !privacyConsent)}>{busy ? <><span className="spinner" /> Please wait…</> : <>{authMode === "signin" ? "Sign in securely" : "Create teacher account"} <span aria-hidden="true">→</span></>}</button>
                  </form>
                  {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                  {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                  <div className="privacy-note"><span aria-hidden="true">⌑</span><p><b>Your class data stays in your section.</b> Access is controlled by your signed-in teacher account.</p></div>
                </div>
              </div>
            </section>
            <aside className="teacher-auth-aside"><div className="aside-emblem"><img src="/snhs-logo.webp" alt="Salvacion National High School seal" /></div><span className="section-kicker">FOR TEACHERS</span><h2>Classroom records,<br /><em>kept together.</em></h2><p>Organize your students in one class roster and enter grades by subject and semester.</p><div className="aside-rule" /><div className="teacher-feature"><span>01</span><p><b>Create your account</b><br />Sign up with your school email.</p></div><div className="teacher-feature"><span>02</span><p><b>Register your class</b><br />Choose your grade and section inside the portal.</p></div><div className="teacher-feature"><span>03</span><p><b>Record each semester</b><br />Save subject marks in a clear grade table.</p></div></aside>
          </div>
        )}
        <footer className="portal-footer"><span>© {new Date().getFullYear()} SNHS Gradebook</span><span>Salvacion National High School · Busuanga, Palawan</span><nav className="portal-legal-links" aria-label="Footer links"><Link href="/">Home</Link><Link href="/teacher/messages">Contact inbox</Link><Link href="/teacher/feedback">Parent feedback</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
      </div>
    </main>
  );
}
