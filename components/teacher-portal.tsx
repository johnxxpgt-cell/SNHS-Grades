"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PortalHeader } from "@/components/brand";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { toWebpDataUrl } from "@/lib/student-images";
import { getCurrentAcademicYear } from "@/lib/academic-year";

type TeacherUser = { id: string; email?: string };
type SchoolSection = { id: string; teacher_id: string; grade_level: number; section_name: string; academic_year: string; is_active: boolean };
type GradeRow = {
  id: string;
  subject_name: string;
  quarter_1: number | string | null;
  quarter_2: number | string | null;
  quarter_3: number | string | null;
  quarter_4: number | string | null;
  updated_by: string;
};
type StudentRow = { id: string; full_name: string; gender: string; avatar_webp_data_url: string | null; registered_at: string; subject_grades: GradeRow[] };
type GradeDraft = { subjectName: string; quarters: [string, string, string, string] };

function academicYear() {
  return getCurrentAcademicYear();
}

function averageFor(rows: GradeRow[]) {
  const averages = rows.map((row) => {
    const values = [row.quarter_1, row.quarter_2, row.quarter_3, row.quarter_4].filter((value) => value !== null).map(Number);
    return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
  }).filter((value): value is number => value !== null);
  return averages.length ? Math.round(averages.reduce((total, value) => total + value, 0) / averages.length) : null;
}

function gradesToDrafts(grades: GradeRow[]): GradeDraft[] {
  return grades.length ? grades.map((row) => ({
    subjectName: row.subject_name,
    quarters: [row.quarter_1, row.quarter_2, row.quarter_3, row.quarter_4].map((value) => value === null ? "" : String(value)) as GradeDraft["quarters"]
  })) : [{ subjectName: "", quarters: ["", "", "", ""] }];
}

export function TeacherPortal() {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<TeacherUser | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [teacherGender, setTeacherGender] = useState("Prefer not to say");
  const [gradeLevel, setGradeLevel] = useState("7");
  const [sectionName, setSectionName] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileGender, setProfileGender] = useState("Prefer not to say");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [drafts, setDrafts] = useState<GradeDraft[]>([]);
  const [search, setSearch] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);
  const [newGradeLevel, setNewGradeLevel] = useState("7");
  const [newSectionName, setNewSectionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) { setLoadingDashboard(false); return; }
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
      if (!session) { setSections([]); setStudents([]); setSelectedStudentId(""); }
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const loadDashboard = useCallback(async (teacherId: string) => {
    if (!supabase) return;
    setLoadingDashboard(true); setError("");
    const [{ data: profile, error: profileError }, { data: classRows, error: classError }] = await Promise.all([
      supabase.from("teacher_profiles").select("full_name, gender, avatar_webp_data_url").eq("id", teacherId).maybeSingle(),
      supabase.from("teacher_sections").select("id, teacher_id, grade_level, section_name, academic_year, is_active").eq("teacher_id", teacherId).order("grade_level").order("section_name")
    ]);
    if (profileError || classError) setError("We couldn’t load your class data. Check that the Supabase schema has been installed.");
    setProfileName(profile?.full_name ?? "Teacher");
    setProfileGender(profile?.gender ?? "Prefer not to say");
    setProfileAvatar(profile?.avatar_webp_data_url ?? null);
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

  const loadRoster = useCallback(async (classId: string) => {
    if (!supabase || !classId) { setStudents([]); return; }
    setLoadingRoster(true); setError("");
    const { data, error: rosterError } = await supabase
      .from("students")
      .select("id, full_name, gender, avatar_webp_data_url, registered_at, subject_grades(id, subject_name, quarter_1, quarter_2, quarter_3, quarter_4, updated_by)")
      .eq("section_id", classId)
      .order("full_name");
    if (rosterError) setError("We couldn’t load this class roster. Please refresh and try again.");
    setStudents((data ?? []) as StudentRow[]);
    setLoadingRoster(false);
  }, [supabase]);

  useEffect(() => { if (selectedSectionId) void loadRoster(selectedSectionId); }, [selectedSectionId, loadRoster]);

  useEffect(() => {
    const selected = students.find((student) => student.id === selectedStudentId);
    setDrafts(selected ? gradesToDrafts(selected.subject_grades ?? []) : []);
  }, [selectedStudentId, students]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    if (!supabase) { setError("Add your Supabase URL and publishable key to the environment settings first."); setBusy(false); return; }
    try {
      if (authMode === "register") {
        if (password !== confirmPassword) throw new Error("Your passwords don’t match.");
        if (sectionName.trim().length < 1) throw new Error("Enter your class section name.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim(), gender: teacherGender, grade_level: gradeLevel, section_name: sectionName.trim(), academic_year: academicYear() } }
        });
        if (signUpError) throw signUpError;
        if (data.session && data.user) {
          setUser({ id: data.user.id, email: data.user.email });
          setNotice("Your teacher account is ready. Your class section has been opened for student registration.");
        } else {
          setNotice("Account created. Check your email to confirm your address, then sign in to open your section for student registration.");
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
      const avatar = await toWebpDataUrl(file);
      const { error: photoError } = await supabase.from("teacher_profiles").update({ avatar_webp_data_url: avatar }).eq("id", user.id);
      if (photoError) throw photoError;
      setProfileAvatar(avatar); setNotice("Your profile photo has been saved as a WebP image.");
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
    const cleaned: { student_id: string; subject_name: string; quarter_1: number | null; quarter_2: number | null; quarter_3: number | null; quarter_4: number | null; updated_by: string; updated_at: string }[] = [];
    for (const draft of drafts) {
      const subjectName = draft.subjectName.trim().replace(/\s+/g, " ");
      const rawValues = draft.quarters.map((value) => value.trim());
      if (!subjectName && rawValues.every((value) => !value)) continue;
      if (subjectName.length < 2) { setError("Enter a subject name for each row with grades."); setBusy(false); return; }
      const parsed: (number | null)[] = rawValues.map((value) => value === "" ? null : Number(value));
      if (parsed.some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))) {
        setError("Quarter grades must be between 0 and 100."); setBusy(false); return;
      }
      if (parsed.every((value) => value === null)) { setError(`Add at least one quarter grade for ${subjectName}.`); setBusy(false); return; }
      cleaned.push({ student_id: selectedStudentId, subject_name: subjectName, quarter_1: parsed[0], quarter_2: parsed[1], quarter_3: parsed[2], quarter_4: parsed[3], updated_by: user.id, updated_at: new Date().toISOString() });
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

  const selectedSection = sections.find((section) => section.id === selectedSectionId);
  const selectedStudent = students.find((student) => student.id === selectedStudentId);
  const visibleStudents = useMemo(() => students.filter((student) => student.full_name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())), [students, search]);
  const classAverage = useMemo(() => {
    const values = students.map((student) => averageFor(student.subject_grades ?? [])).filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  }, [students]);

  return (
    <main className="portal-page teacher-portal-page">
      <div className="portal-shell">
        <PortalHeader />
        {!supabase ? (
          <section className="setup-message"><span className="section-kicker">TEACHER SERVICES</span><h1>Set up your secure<br /><em>teacher workspace.</em></h1><p>Connect the Supabase project to enable teacher registration and class records.</p><div className="setup-code">NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY<br />SUPABASE_SECRET_KEY<br />SUPABASE_LRN_HMAC_SECRET<br />SUPABASE_DATA_ENCRYPTION_KEY</div><a href="/" className="text-link">← Return to home</a></section>
        ) : user ? (
          <section className="teacher-dashboard">
            <div className="dashboard-heading"><div><span className="section-kicker">TEACHER WORKSPACE</span><h1>Welcome back, <em>{profileName.split(" ")[0]}.</em></h1><p>Your class records, ready when you are.</p></div><div className="dashboard-account"><label className="account-photo-control" title="Upload profile photo">{profileAvatar ? <img src={profileAvatar} alt="Teacher profile" /> : <span className="teacher-avatar">{profileName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<input type="file" accept="image/*" aria-label="Upload teacher profile photo" onChange={(event) => void handleTeacherPhoto(event.target.files?.[0])} /></label><div><b>{profileName}</b><small>{profileGender} · {user.email}</small></div><button className="signout-button" type="button" onClick={() => void handleSignOut()}>Sign out</button></div></div>
            {error && <p className="form-alert error-alert" role="alert">{error}</p>}
            {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
            <div className="dashboard-toolbar"><div><label htmlFor="teacher-section-select">CLASS SECTION</label><select id="teacher-section-select" value={selectedSectionId} onChange={(event) => { setSelectedSectionId(event.target.value); setSelectedStudentId(""); }} disabled={!sections.length}><option value="">{sections.length ? "Choose a section" : "No sections yet"}</option>{sections.map((section) => <option value={section.id} key={section.id}>Grade {section.grade_level} — {section.section_name} · {section.academic_year}</option>)}</select></div><button type="button" className="button button-outline" onClick={() => setShowAddSection((value) => !value)}>{showAddSection ? "Close" : "+ Add a section"}</button></div>
            {showAddSection && <form className="add-section-panel" onSubmit={handleAddSection}><div><span className="form-overline">NEW CLASS</span><h2>Open another section</h2><p>Students can register as soon as it’s added.</p></div><label className="field"><span>Grade level</span><select value={newGradeLevel} onChange={(event) => setNewGradeLevel(event.target.value)}>{[7, 8, 9, 10, 11, 12].map((grade) => <option value={grade} key={grade}>Grade {grade}</option>)}</select></label><label className="field"><span>Section name</span><input value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} maxLength={40} required placeholder="e.g. Rizal" /></label><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add section"}</button></form>}
            {loadingDashboard ? <div className="dashboard-loading"><span className="spinner" /> Loading your workspace…</div> : sections.length ? (
              <>
                <div className="dashboard-stats"><div><span>CLASS ROSTER</span><b>{students.length.toString().padStart(2, "0")}<small> students</small></b></div><div><span>SUBJECT RECORDS</span><b>{students.reduce((sum, student) => sum + (student.subject_grades?.length ?? 0), 0).toString().padStart(2, "0")}<small> entered</small></b></div><div><span>CLASS AVERAGE</span><b>{classAverage ?? "—"}<small>{classAverage === null ? " no grades" : " / 100"}</small></b></div><div className="stats-school-year"><span>ACADEMIC YEAR</span><b>{selectedSection?.academic_year ?? academicYear()}</b></div></div>
                <div className="teacher-workgrid">
                  <section className="roster-panel"><div className="panel-heading"><div><span className="form-overline">GRADE {selectedSection?.grade_level} · {selectedSection?.section_name}</span><h2>Class roster</h2></div><label className="roster-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a student" aria-label="Find a student" /></label></div>
                    <div className="roster-table-wrap"><table className="roster-table"><thead><tr><th>STUDENT</th><th>SUBJECTS</th><th>AVERAGE</th><th>RECORD</th></tr></thead><tbody>
                      {loadingRoster ? <tr><td colSpan={4} className="table-message"><span className="spinner" /> Loading roster…</td></tr> : visibleStudents.map((student) => {
                        const avg = averageFor(student.subject_grades ?? []);
                        return <tr key={student.id} className={selectedStudentId === student.id ? "selected-row" : ""}><td><div className="roster-person">{student.avatar_webp_data_url ? <img src={student.avatar_webp_data_url} alt="" /> : <span className="roster-initials">{student.full_name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>}<span><b>{student.full_name}</b><small>{student.gender}</small></span></div></td><td>{student.subject_grades?.length ?? 0}</td><td>{avg === null ? <span className="unreported">—</span> : <span className={avg >= 75 ? "grade-pill pass" : "grade-pill"}>{avg}</span>}</td><td><button type="button" className="table-action" onClick={() => { setSelectedStudentId(student.id); setError(""); setNotice(""); }}>{selectedStudentId === student.id ? "Selected" : "Enter grades →"}</button></td></tr>;
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
                        <div className="grade-draft-heading"><span>SUBJECT</span><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></div>
                        <div className="grade-draft-list">{drafts.map((draft, index) => <div className="grade-draft-row" key={index}>
                          <input aria-label={`Subject ${index + 1}`} value={draft.subjectName} onChange={(event) => setDrafts((previous) => previous.map((item, row) => row === index ? { ...item, subjectName: event.target.value } : item))} maxLength={80} placeholder="Subject name" />
                          {draft.quarters.map((quarter, quarterIndex) => <input key={quarterIndex} aria-label={`${draft.subjectName || `Subject ${index + 1}`} quarter ${quarterIndex + 1}`} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={quarter} onChange={(event) => setDrafts((previous) => previous.map((item, row) => row === index ? { ...item, quarters: item.quarters.map((value, q) => q === quarterIndex ? event.target.value : value) as GradeDraft["quarters"] } : item))} placeholder="—" />)}
                          {drafts.length > 1 && <button className="remove-draft" type="button" aria-label={`Remove subject row ${index + 1}`} onClick={() => setDrafts((previous) => previous.filter((_, row) => row !== index))}>×</button>}
                        </div>)}</div>
                        <button className="add-subject" type="button" onClick={() => setDrafts((previous) => [...previous, { subjectName: "", quarters: ["", "", "", ""] }])}>+ Add subject</button>
                        <button className="button button-primary editor-save" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Saving…</> : <>Save grade record <span aria-hidden="true">→</span></>}</button>
                      </form>
                      {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                      {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                      <p className="editor-note"><span className="mini-shield">✓</span> Only teachers assigned to this section can edit these records.</p>
                    </> : <div className="editor-empty"><span className="editor-empty-icon">✎</span><span className="form-overline">GRADE ENTRY</span><h2>Select a student<br />to get started.</h2><p>Choose a student from your roster to add or update their subject grades.</p></div>}
                  </section>
                </div>
              </>
            ) : <div className="no-classes-panel"><div className="empty-icon">✳</div><h2>Your first class is ready to go.</h2><p>There isn’t a class section on this account yet. Add your grade and section to open registration for students.</p><button className="button button-primary" type="button" onClick={() => setShowAddSection(true)}>+ Add a section</button></div>}
          </section>
        ) : (
          <div className="teacher-auth-layout">
            <section className="teacher-auth-main"><div className="portal-intro"><span className="section-kicker">TEACHER SERVICES</span><h1>Good records make<br /><em>room to teach.</em></h1><p>Sign in to manage your class roster and record quarterly grades.</p></div>
              <div className="portal-workspace teacher-auth-workspace"><div className="portal-tabs" role="tablist" aria-label="Teacher account options"><button className={authMode === "signin" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={authMode === "signin"} onClick={() => { setAuthMode("signin"); setError(""); setNotice(""); }}>Sign in <span>01</span></button><button className={authMode === "register" ? "portal-tab active" : "portal-tab"} type="button" role="tab" aria-selected={authMode === "register"} onClick={() => { setAuthMode("register"); setError(""); setNotice(""); }}>Create teacher account <span>02</span></button></div>
                <div className="form-panel"><div className="form-heading"><div><span className="form-overline">{authMode === "signin" ? "WELCOME BACK" : "TEACHER REGISTRATION"}</span><h2>{authMode === "signin" ? "Sign in to your class" : "Set up your classroom"}</h2></div><span className="round-icon" aria-hidden="true">{authMode === "signin" ? "↗" : "＋"}</span></div>
                  <p className="form-description">{authMode === "signin" ? "Use the email address and password linked to your teacher account." : "Your class section will be created with your account. Students who select it are automatically placed in your grade level."}</p>
                  <form className="form-stack" onSubmit={handleAuth}>
                    {authMode === "register" && <><label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={3} maxLength={120} autoComplete="name" placeholder="Your name" /></label></>}
                    {authMode === "register" ? <div className="field-row"><label className="field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@school.edu.ph" /></label><label className="field"><span>Gender <small>Optional</small></span><select value={teacherGender} onChange={(event) => setTeacherGender(event.target.value)}><option>Prefer not to say</option><option>Female</option><option>Male</option></select></label></div> : <label className="field"><span>School email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="you@school.edu.ph" /></label>}
                    {authMode === "register" && <div className="field-row"><label className="field"><span>Grade level</span><select value={gradeLevel} onChange={(event) => setGradeLevel(event.target.value)}>{[7, 8, 9, 10, 11, 12].map((grade) => <option value={grade} key={grade}>Grade {grade}</option>)}</select></label><label className="field"><span>Section name</span><input value={sectionName} onChange={(event) => setSectionName(event.target.value)} required maxLength={40} placeholder="e.g. Rizal" /></label></div>}
                    <label className="field"><span>Password {authMode === "register" && <small>At least 12 characters</small>}</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={authMode === "register" ? 12 : 1} autoComplete={authMode === "signin" ? "current-password" : "new-password"} placeholder="Enter your password" /></label>
                    {authMode === "register" && <label className="field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} autoComplete="new-password" placeholder="Enter your password again" /></label>}
                    <button className="button button-primary form-submit" type="submit" disabled={busy}>{busy ? <><span className="spinner" /> Please wait…</> : <>{authMode === "signin" ? "Sign in securely" : "Create teacher account"} <span aria-hidden="true">→</span></>}</button>
                  </form>
                  {error && <p className="form-alert error-alert" role="alert">{error}</p>}
                  {notice && <p className="form-alert success-alert" role="status">{notice}</p>}
                  <div className="privacy-note"><span aria-hidden="true">⌑</span><p><b>Your class data stays in your section.</b> Access is controlled by your signed-in teacher account.</p></div>
                </div>
              </div>
            </section>
            <aside className="teacher-auth-aside"><div className="aside-emblem"><img src="/snhs-logo.webp" alt="Salvacion National High School seal" /></div><span className="section-kicker">FOR TEACHERS</span><h2>Classroom records,<br /><em>kept together.</em></h2><p>Organize your students in one class roster and enter grades by subject and quarter.</p><div className="aside-rule" /><div className="teacher-feature"><span>01</span><p><b>Register your class</b><br />Set your grade level and section name.</p></div><div className="teacher-feature"><span>02</span><p><b>Students find your class</b><br />The section list sets their grade automatically.</p></div><div className="teacher-feature"><span>03</span><p><b>Record each quarter</b><br />Save subject marks with clear grade tables.</p></div></aside>
          </div>
        )}
        <footer className="portal-footer"><span>© {new Date().getFullYear()} SNHS Gradebook</span><span>Salvacion National High School · Busuanga, Palawan</span><a href="/">Home</a></footer>
      </div>
    </main>
  );
}
