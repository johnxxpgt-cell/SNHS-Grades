import Link from "next/link";
import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const metadata: Metadata = {
  title: "Student grade portal",
  description: "Access posted grades, register for a class section, and keep track of school progress with SNHS Gradebook.",
  alternates: { canonical: "/" },
  openGraph: { title: "Student grade portal", description: "Access posted grades and school progress with SNHS Gradebook.", url: "/", images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SNHS Gradebook — Salvacion National High School" }] }
};

export default function HomePage() {
  const schoolYear = getCurrentAcademicYear();

  return (
    <main className="home-page">
      <nav className="site-nav page-wrap" aria-label="Main navigation">
        <Brand />
        <div className="nav-actions">
          <span className="nav-school-year">
            <span className="status-dot" /> Academic year {schoolYear}
          </span>
          <Link href="/student" className="nav-student">
            Student portal <span aria-hidden="true">→</span>
          </Link>
          <Link href="/teacher" className="nav-teacher">
            Teacher sign in
          </Link>
        </div>
      </nav>

      <section className="hero page-wrap">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" /> SALVACION NATIONAL HIGH SCHOOL ·
            BUSUANGA
          </div>
          <h1>
            Stay connected
            <br />
            <em>to your progress.</em>
          </h1>
          <p className="hero-lede">
            See your grades across all three terms and keep your school
            record close in one clear, secure student portal.
          </p>
          <div className="hero-actions">
            <Link href="/student" className="button button-primary">
              View my grades <span aria-hidden="true">→</span>
            </Link>
            <Link href="/student?mode=register" className="button button-outline hero-register-button">
              Register as a student
            </Link>
            <span className="hero-action-note">
              Returning student? View grades. New student? Register here.
            </span>
          </div>
          <div className="hero-footnote">
            <span className="mini-shield" aria-hidden="true">
              ✓
            </span>{" "}
            Private access to your school record, wherever you are.
          </div>
        </div>

        <div className="hero-art" aria-label="Sample student grade report">
          <div className="hero-orbit orbit-one" />
          <div className="hero-orbit orbit-two" />
          <div className="art-note note-top">
            <span className="note-icon" aria-hidden="true"></span>
            <span>
              School records
              <br />
              <b>made clear</b>
            </span>
          </div>
          <article className="report-preview">
            <div className="report-topline">
              <span>SAMPLE REPORT</span>
              <span className="report-period">{schoolYear}</span>
            </div>
            <div className="report-school">
              <img src="/snhs-logo.webp" alt="" />
              <div>
                <b>SNHS</b>
                <small>GRADE SUMMARY</small>
              </div>
            </div>
            <div className="report-separator" />
            <div className="report-student">
              <span>LEARNER</span>
              <b>Student name</b>
              <small>Grade &amp; section</small>
            </div>
            <div className="report-grade-head">
              <span>SUBJECT</span>
              <span>T1</span>
              <span>T2</span>
              <span>T3</span>
              <span>FINAL</span>
            </div>
            <div className="report-row">
              <span>Mathematics</span>
              <b>92</b>
              <b>89</b>
              <b>91</b>
              <strong>91</strong>
            </div>
            <div className="report-row">
              <span>Science</span>
              <b>88</b>
              <b>93</b>
              <b>91</b>
              <strong>91</strong>
            </div>
            <div className="report-row">
              <span>English</span>
              <b>90</b>
              <b>92</b>
              <b>91</b>
              <strong>91</strong>
            </div>
            <div className="report-bottom">
              <span>
                <i /> Sample grade layout
              </span>
              <b>••••••••••</b>
            </div>
          </article>
          <div className="art-note note-bottom">
            <span className="note-check" aria-hidden="true">
              ✓
            </span>
            <span>
              <b>All terms together</b>
              <br />
              in one student view
            </span>
          </div>
          <div className="art-index">
            01 / 01 <span>•</span> STUDENT RECORDS
          </div>
        </div>
      </section>

      <section
        className="portal-band page-wrap"
        aria-label="Student portal guide"
      >
        <div className="student-guide">
          <div className="student-guide-copy">
            <span className="section-kicker">MADE FOR SNHS STUDENTS</span>
            <h2>
              One student portal.
              <br />
              <em>Two ways to get started.</em>
            </h2>
            <p>
              Look up a posted report with your full name and LRN, or register
              once to join your class section.
            </p>
            <Link href="/student" className="student-guide-link">
              Go to student portal <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="student-paths">
            <Link href="/student" className="student-path student-path-link">
              <span>
                01 <i /> RETURNING STUDENT
              </span>
              <h3>View your grades</h3>
              <p>
                Enter the full name and LRN on your school record to view posted
                grades by subject and term.
              </p>
            </Link>
            <Link
              href="/student?mode=register"
              className="student-path student-path-link"
            >
              <span>
                02 <i /> FIRST-TIME STUDENT
              </span>
              <h3>Register your profile</h3>
              <p>
                Add your student details and select your class section. Your
                grade level is set automatically.
              </p>
            </Link>
          </div>
        </div>
      </section>

      <footer className="site-footer page-wrap">
        <Brand />
        <p>
          Salvacion National High School <span>·</span> Busuanga, Palawan
        </p>
        <p>
         <span>|</span><a href="https://darrenbardelas.xyz/">Made by Libarrium</a>
        </p>
        <nav className="footer-links" aria-label="Helpful links">
          <Link href="/student?mode=register">Student registration</Link>
          <Link href="/teacher">Teacher sign in / register</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
        <span className="footer-mark">STUDENT GRADE RECORDS</span>
      </footer>
    </main>
  );
}
