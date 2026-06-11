import type { StaffUser } from "@carshow/carshow-components";
import {
  ArrowRight,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Images,
  Lightbulb,
  Printer,
  QrCode,
  Search,
  ShieldCheck,
  Tags,
  Trophy,
  UserRoundCheck,
  Users,
  Vote,
} from "lucide-react";
import { useState } from "react";
import type { View } from "../App";

type Chapter = "start" | "registration" | "media" | "voting";

const chapters: Array<{ id: Chapter; number: string; label: string; shortLabel: string }> = [
  { id: "start", number: "01", label: "Get event-ready", shortLabel: "Start" },
  { id: "registration", number: "02", label: "Welcome vehicles", shortLabel: "Register" },
  { id: "media", number: "03", label: "QR & photos", shortLabel: "QR + Photos" },
  { id: "voting", number: "04", label: "Voting & results", shortLabel: "Vote" },
];

export function HelpView({
  staff,
  onNavigate,
}: {
  staff: StaffUser;
  onNavigate: (view: View) => void;
}) {
  const [chapter, setChapter] = useState<Chapter>("start");
  const chapterIndex = chapters.findIndex((item) => item.id === chapter);

  function moveChapter(direction: -1 | 1) {
    const next = chapters[chapterIndex + direction];
    if (next) {
      setChapter(next.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <section className="help-view">
      <header className="help-hero">
        <div className="help-hero-copy">
          <p className="eyebrow">Admin Field Guide · 2026 Event</p>
          <h1>Keep the show moving.</h1>
          <p>
            A visual guide for setup, check-in, QR cards, photo review, and voting. Pick the chapter
            that matches the job in front of you.
          </p>
          <div className="help-role-chip">
            <ShieldCheck size={18} />
            Signed in as <strong>{staff.role === "ADMIN" ? "Admin" : "Registrar"}</strong>
          </div>
        </div>
        <div className="help-hero-mark" aria-hidden="true">
          <span>FIELD</span>
          <strong>GUIDE</strong>
          <div><Car size={76} /></div>
        </div>
      </header>

      <nav className="help-chapter-nav" aria-label="Guide chapters">
        {chapters.map((item) => (
          <button
            type="button"
            className={chapter === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setChapter(item.id)}
          >
            <span>{item.number}</span>
            <strong>{item.label}</strong>
          </button>
        ))}
      </nav>

      {chapter === "start" ? <StartChapter onNavigate={onNavigate} /> : null}
      {chapter === "registration" ? <RegistrationChapter onNavigate={onNavigate} /> : null}
      {chapter === "media" ? <MediaChapter onNavigate={onNavigate} /> : null}
      {chapter === "voting" ? <VotingChapter staff={staff} onNavigate={onNavigate} /> : null}

      <footer className="help-pagination">
        <button type="button" disabled={chapterIndex === 0} onClick={() => moveChapter(-1)}>
          <ChevronLeft size={20} />
          Previous
        </button>
        <span>{chapterIndex + 1} / {chapters.length}</span>
        <button type="button" disabled={chapterIndex === chapters.length - 1} onClick={() => moveChapter(1)}>
          Next
          <ChevronRight size={20} />
        </button>
      </footer>
    </section>
  );
}

function StartChapter({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="help-chapter">
      <ChapterHeading
        kicker="Before doors open"
        title="A smooth event starts here"
        description="Complete these checks in order. The first three are admin setup; the final check is for the whole team."
      />
      <div className="help-flow help-flow-four">
        <FlowStep number="1" icon={<Tags />} title="Build categories" text="Add classes, matching rules, and special awards." action="Open Categories" onClick={() => onNavigate("categories")} />
        <FlowStep number="2" icon={<QrCode />} title="Prepare QR cards" text="Generate enough cards, filter to Available, then print." action="Open QR Cards" onClick={() => onNavigate("qr-cards")} />
        <FlowStep number="3" icon={<Vote />} title="Set voting" text="Confirm voting windows and enable the ballots you need." action="Open Voting" onClick={() => onNavigate("voting")} />
        <FlowStep number="4" icon={<ClipboardCheck />} title="Run a rehearsal" text="Create one test entry, assign a QR, and confirm the public page." />
      </div>
      <div className="help-split">
        <InfoCard tone="dark" eyebrow="Event-day rhythm" title="One vehicle. Five quick moves.">
          <ol className="help-number-list">
            <li><span>01</span><div><strong>Find or create</strong><p>Search before adding a new owner.</p></div></li>
            <li><span>02</span><div><strong>Confirm details</strong><p>Category, vehicle, waiver, and contact info.</p></div></li>
            <li><span>03</span><div><strong>Check in</strong><p>Mark the vehicle present after details are correct.</p></div></li>
            <li><span>04</span><div><strong>Assign QR</strong><p>Scan a printed card and hand it to the owner.</p></div></li>
            <li><span>05</span><div><strong>Take a photo</strong><p>Upload a clear image, then approve it.</p></div></li>
          </ol>
        </InfoCard>
        <div className="help-stack">
          <InfoCard tone="red" eyebrow="Golden rule" title="Search first.">
            <p>Before creating an owner or registration, search by name, phone, plate, entry number, or QR code. This prevents duplicates.</p>
          </InfoCard>
          <InfoCard eyebrow="Know your access" title="Admin vs. Registrar">
            <div className="help-role-grid">
              <div><ShieldCheck /><strong>Admin</strong><span>Can change event setup and voting controls.</span></div>
              <div><Users /><strong>Registrar</strong><span>Can register, check in, assign QR cards, and view results.</span></div>
            </div>
          </InfoCard>
        </div>
      </div>
    </div>
  );
}

function RegistrationChapter({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="help-chapter">
      <ChapterHeading kicker="At the welcome table" title="From arrival to checked in" description="Use the Registrations page as your home base. Every vehicle should leave the table with correct details and an assigned QR card." />
      <div className="help-flow help-flow-three">
        <FlowStep number="1" icon={<Search />} title="Search" text="Look for the owner, phone, plate, entry, or QR before creating anything." />
        <FlowStep number="2" icon={<Car />} title="Open or add" text="Select an existing row, or choose New. Reuse an existing owner when possible." />
        <FlowStep number="3" icon={<UserRoundCheck />} title="Save & check in" text="Confirm the waiver and vehicle category, save, then mark the vehicle checked in." />
      </div>
      <button type="button" className="help-jump-button" onClick={() => onNavigate("registrations")}>
        Go to Registrations <ArrowRight size={20} />
      </button>
      <div className="help-split help-split-balanced">
        <InfoCard eyebrow="New registration" title="What to confirm">
          <ul className="help-check-list">
            <li><Check /> Correct owner and mobile number</li>
            <li><Check /> Waiver has been accepted</li>
            <li><Check /> Year, make, model, and category</li>
            <li><Check /> Plate and nickname when available</li>
            <li><Check /> Public-name preference is correct</li>
          </ul>
        </InfoCard>
        <InfoCard tone="yellow" eyebrow="Multiple vehicles" title="Keep one owner record">
          <p>When an owner brings another vehicle, choose <strong>New</strong>, search for that owner, and select them before entering the vehicle.</p>
          <div className="help-mini-flow"><span>New</span><ArrowRight /><span>Find owner</span><ArrowRight /><span>Add vehicle</span></div>
        </InfoCard>
      </div>
      <TroubleStrip items={[
        ["Can’t find an entry?", "Clear the search and try the phone number or plate."],
        ["Wrong details?", "Open the registration row, edit the fields, and save again."],
        ["Imported registrations?", "Preview the CSV, resolve every unmatched category, then confirm."],
      ]} />
    </div>
  );
}

function MediaChapter({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="help-chapter">
      <ChapterHeading kicker="Connect every car" title="QR cards & photo review" description="The QR card connects a physical vehicle to its public voting page. A clear approved photo helps guests recognize it." />
      <div className="help-dual-lanes">
        <section className="help-lane">
          <div className="help-lane-title"><QrCode /><div><span>Lane A</span><h2>Assign the QR</h2></div></div>
          <ol>
            <li><strong>Open the registration.</strong><span>Use the Registrations search.</span></li>
            <li><strong>Scan a printed card.</strong><span>Allow camera access, or type its visible code.</span></li>
            <li><strong>Select Assign.</strong><span>The audit trail confirms who linked it.</span></li>
            <li><strong>Hand it to the owner.</strong><span>Ask them to test the public page.</span></li>
          </ol>
          <button type="button" onClick={() => onNavigate("registrations")}>Assign in Registrations <ArrowRight size={18} /></button>
        </section>
        <section className="help-lane help-lane-red">
          <div className="help-lane-title"><Images /><div><span>Lane B</span><h2>Approve the photo</h2></div></div>
          <ol>
            <li><strong>Upload a clear image.</strong><span>Use the vehicle editor or owner page.</span></li>
            <li><strong>Open Needs Review.</strong><span>Check the vehicle and image match.</span></li>
            <li><strong>Approve or reject.</strong><span>Only approved images appear publicly.</span></li>
            <li><strong>Choose the hero image.</strong><span>Use the clearest approved photo.</span></li>
          </ol>
          <button type="button" onClick={() => onNavigate("photo-review")}>Open Photo Review <ArrowRight size={18} /></button>
        </section>
      </div>
      <div className="help-callout-row">
        <InfoCard eyebrow="Camera not working?" title="Use the visible code">
          <Camera size={34} />
          <p>QR scanning requires camera permission and HTTPS. You can always type the short code printed on the card.</p>
        </InfoCard>
        <InfoCard eyebrow="Card already assigned?" title="Stop and verify">
          <CircleAlert size={34} />
          <p>Confirm the vehicle and owner before replacing a QR. Reassignments are recorded in the audit trail.</p>
        </InfoCard>
        <InfoCard eyebrow="Need more cards?" title="Generate, then print">
          <Printer size={34} />
          <p>Use QR Cards to generate inventory. Filter to Available before printing so assigned cards are not reused.</p>
        </InfoCard>
      </div>
    </div>
  );
}

function VotingChapter({ staff, onNavigate }: { staff: StaffUser; onNavigate: (view: View) => void }) {
  return (
    <div className="help-chapter">
      <ChapterHeading kicker="Finish strong" title="Open voting. Watch results. Close cleanly." description="Admins control voting settings. Registrars can monitor progress and help guests find the right vehicle." />
      <div className="help-timeline">
        <TimelineStep icon={<CheckCircle2 />} label="Before voting" title="Confirm the ballot" text="Verify categories, special awards, cutoff time, and which voting modes are enabled." />
        <TimelineStep icon={<Vote />} label="During voting" title="Monitor, don’t steer" text="Watch tallies and judge completion. Help with access issues without influencing choices." />
        <TimelineStep icon={<Trophy />} label="At cutoff" title="Finalize carefully" text="Close voting, confirm judge completion, review ties, then finalize winners." />
      </div>
      <div className="help-split">
        <InfoCard tone="dark" eyebrow="Current access" title={staff.role === "ADMIN" ? "You can manage voting" : "You have view-only voting access"}>
          <p>{staff.role === "ADMIN" ? "You can update settings, initialize the event, set the cutoff, and finalize winners. Make changes deliberately and tell the event lead." : "You can view tallies and judge completion. Ask an admin to change settings, initialize the event, or finalize winners."}</p>
          <button type="button" className="help-card-button" onClick={() => onNavigate("voting")}>Open Voting <ArrowRight size={18} /></button>
        </InfoCard>
        <InfoCard tone="red" eyebrow="Before announcing" title="The final check">
          <ul className="help-check-list">
            <li><Check /> Voting is closed</li>
            <li><Check /> All judges have submitted</li>
            <li><Check /> Ties or overrides are documented</li>
            <li><Check /> Winner vehicle and entry number match</li>
          </ul>
        </InfoCard>
      </div>
      <TroubleStrip items={[
        ["No voting controls?", "The event may need to be initialized by an admin."],
        ["Judge not complete?", "Use the completion panel to identify the missing category."],
        ["Result looks wrong?", "Refresh first, then verify cutoff and enabled voting modes."],
      ]} />
    </div>
  );
}

function ChapterHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div className="help-chapter-heading"><p>{kicker}</p><h2>{title}</h2><span>{description}</span></div>;
}

function FlowStep({ number, icon, title, text, action, onClick }: { number: string; icon: React.ReactNode; title: string; text: string; action?: string; onClick?: () => void }) {
  return <article className="help-flow-step"><div className="help-step-top"><span>{number}</span>{icon}</div><h3>{title}</h3><p>{text}</p>{action ? <button type="button" onClick={onClick}>{action}<ArrowRight size={16} /></button> : null}</article>;
}

function InfoCard({ tone = "light", eyebrow, title, children }: { tone?: "light" | "dark" | "red" | "yellow"; eyebrow: string; title: string; children: React.ReactNode }) {
  return <article className={`help-info-card help-info-${tone}`}><p className="help-info-eyebrow">{eyebrow}</p><h3>{title}</h3><div className="help-info-body">{children}</div></article>;
}

function TroubleStrip({ items }: { items: string[][] }) {
  return <section className="help-trouble"><div className="help-trouble-heading"><Lightbulb /><strong>Quick fixes</strong></div>{items.map(([title, text]) => <div key={title}><strong>{title}</strong><span>{text}</span></div>)}</section>;
}

function TimelineStep({ icon, label, title, text }: { icon: React.ReactNode; label: string; title: string; text: string }) {
  return <article><div className="help-timeline-icon">{icon}</div><span>{label}</span><h3>{title}</h3><p>{text}</p></article>;
}
