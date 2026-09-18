// Ported 1:1 from the TraumaSense AI Claude Design export (project/TraumaSense AI.dc.html)
// All pages are wired to the real Node/Express + Prisma backend. The constants
// remaining below are either navigation/config, static workflow diagrams, or
// content for victim-portal pages that legitimately do not have a dynamic
// backend equivalent (contact directories, FAQ copy, resource listings).

export const NAV = [
  { key: 'dashboard', label: 'Dashboard Overview', builtIn: true },
  { key: 'complaints', label: 'Complaints', builtIn: true },
  { key: 'assessment', label: 'Victim Assessment', builtIn: true },
  { key: 'voice', label: 'Voice Analysis', builtIn: true },
  { key: 'nlp', label: 'NLP Analysis', builtIn: true },
  { key: 'risk', label: 'Risk Intelligence', builtIn: true },
  { key: 'reco', label: 'AI Recommendations', builtIn: true },
  { key: 'emergency', label: 'Emergency Center' },
  { key: 'geo', label: 'Geographic Intelligence' },
  { key: 'counsellor', label: 'Counsellor Workspace' },
  { key: 'realtime', label: 'Real-Time Assessment' },
  { key: 'journey', label: 'Victim Journey Timeline' },
  { key: 'aimodels', label: 'AI Model Monitoring' },
  { key: 'privacy', label: 'Privacy & Ethics Center' },
  { key: 'assistant', label: 'AI Support Assistant' },
  { key: 'channels', label: 'Channel Monitoring' },
  { key: 'command', label: 'Intervention Command Center' },
  { key: 'executive', label: 'Executive Dashboard' },
  { key: 'xai', label: 'Explainable AI Center' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'settings', label: 'Settings' },
];

export const PAGE_TITLES = {
  dashboard: 'Dashboard Overview',
  complaints: 'Complaints',
  assessment: 'Victim Assessment',
  voice: 'Voice Analysis',
  nlp: 'NLP Analysis',
  risk: 'Risk Intelligence',
  reco: 'AI Recommendation Center',
  emergency: 'Emergency Response Center',
  geo: 'Geographic Intelligence',
  counsellor: 'Counsellor Workspace',
  realtime: 'Real-Time Assessment Center',
  journey: 'Victim Journey Timeline',
  aimodels: 'AI Model Monitoring',
  privacy: 'Privacy, Consent & Ethics Center',
  assistant: 'AI Support Assistant',
  channels: 'IVRS & Mobile Channel View',
  command: 'Intervention Command Center',
  executive: 'National Command & Executive Dashboard',
  xai: 'Explainable AI Center',
  reports: 'Reports & Analytics',
  settings: 'Settings & Admin',
};

export const LANGS = [
  'English', 'Hindi', 'Marathi', 'Gujarati', 'Punjabi',
  'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Bengali',
];

export const ROLES = [
  { name: 'Administrator', color: 'oklch(0.6 0.15 275)', desc: 'Full system oversight, user management, and audit controls.', icon: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z' },
  { name: 'Helpline Operator', color: 'oklch(0.65 0.14 200)', desc: 'Logs 14566 calls, triages new complaints in real time.', icon: 'M4 4c0-1 1-2 2-2h1l2 5-2 1c1 3 3 5 6 6l1-2 5 2v1c0 1-1 2-2 2C9 17 4 12 4 4z' },
  { name: 'District Officer', color: 'oklch(0.7 0.13 145)', desc: 'Manages district caseload and coordinates local response.', icon: 'M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' },
  { name: 'Counsellor', color: 'oklch(0.72 0.12 300)', desc: 'Runs sessions, tracks recovery and rehabilitation.', icon: 'M12 21s-7-4.5-9.5-9C1 8 2 4 6 4c2 0 4 1.5 6 4 2-2.5 4-4 6-4 4 0 5 4 3.5 8-2.5 4.5-9.5 9-9.5 9z' },
  { name: 'Law Enforcement Officer', color: 'oklch(0.65 0.17 25)', desc: 'Handles escalations, protection orders, investigations.', icon: 'M12 2l2.9 6 6.6.6-5 4.4 1.5 6.5L12 16l-5.9 3.5L7.6 13l-5-4.4 6.6-.6L12 2z' },
];

// RISK_COLORS/RISK_BG use the legacy Capitalized keys from the original
// mock-data phase. Pages wired to the real backend define their own local,
// UPPERCASE-keyed copies to match the real enum values - these two are kept
// only because psychColor() below still uses them.
export const RISK_COLORS = { Low: 'oklch(0.72 0.15 145)', Moderate: 'oklch(0.8 0.15 95)', High: 'oklch(0.7 0.17 55)', Critical: 'oklch(0.62 0.21 25)' };
export const RISK_BG = { Low: 'oklch(0.72 0.15 145 / 0.15)', Moderate: 'oklch(0.8 0.15 95 / 0.15)', High: 'oklch(0.7 0.17 55 / 0.15)', Critical: 'oklch(0.62 0.21 25 / 0.15)' };

export const psychColor = (v) => (v >= 75 ? RISK_COLORS.Critical : v >= 55 ? RISK_COLORS.High : v >= 35 ? RISK_COLORS.Moderate : RISK_COLORS.Low);

// ---------- landing ----------
export const LANDING_FEATURES = [
  { title: 'Speech & Voice Analytics', desc: 'Pitch, stress, tremor and pause analysis extracted directly from helpline calls and field recordings.', bg: 'oklch(0.3 0.06 275)', dot: 'oklch(0.7 0.15 275)', icon: 'M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z M19 10a7 7 0 01-14 0 M12 19v3 M8 22h8' },
  { title: 'NLP Trauma Detection', desc: 'Extracts trauma, fear, intimidation and isolation indicators from victim narratives across 10 languages.', bg: 'oklch(0.28 0.05 235)', dot: 'oklch(0.68 0.14 235)', icon: 'M4 4h16v11H8l-4 4V4z' },
  { title: 'Stress Vulnerability Index', desc: 'A single composite score combining psychological, behavioural and linguistic signals per case.', bg: 'oklch(0.28 0.05 195)', dot: 'oklch(0.68 0.13 195)', icon: 'M4 12a8 8 0 1116 0 M4 12h3l2 4 3-8 2 4h3' },
  { title: 'Risk Classification', desc: 'Automatic routing into Low, Moderate, High and Critical bands with recommended escalation paths.', bg: 'oklch(0.3 0.06 55)', dot: 'oklch(0.7 0.16 55)', icon: 'M12 3l9 16H3L12 3z M12 9v5 M12 17h.01' },
  { title: 'Recommendation Engine', desc: 'Suggests counselling, legal aid, medical support or police protection based on assessed risk.', bg: 'oklch(0.28 0.05 300)', dot: 'oklch(0.68 0.12 300)', icon: 'M9 18h6 M10 21h4 M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z' },
  { title: 'Geographic Intelligence', desc: 'District and state-level hotspot tracking to direct resources where risk is concentrated.', bg: 'oklch(0.28 0.05 160)', dot: 'oklch(0.68 0.13 160)', icon: 'M12 21s7-7.5 7-12a7 7 0 10-14 0c0 4.5 7 12 7 12z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z' },
];

const WF_LABELS = ['Victim Interaction', 'Voice Recording', 'Speech to Text', 'NLP Analysis', 'Emotion Detection', 'Stress Vulnerability Index', 'Risk Classification', 'Recommendation Engine', 'Support Services'];
export const WORKFLOW_STEPS = WF_LABELS.map((l, i) => ({ n: i + 1, label: l, hasArrow: i < WF_LABELS.length - 1 }));

export const BENEFITS = [
  'Flags critical-risk victims within minutes of first contact instead of days.',
  'Gives district officers a single evidence-based view across every open complaint.',
  'Standardises intervention decisions across states and languages.',
  'Keeps counsellors informed with structured psychological assessment, not just case notes.',
  'Creates an auditable trail from first call to final rehabilitation outcome.',
];

export const TESTIMONIALS = [
  { quote: 'The SVI score gave us a way to prioritise calls that would otherwise have waited in a queue for days.', name: 'Helpline Desk Lead', role: 'National Helpline Against Atrocities' },
  { quote: 'Voice stress indicators helped us identify a case that read as calm in text but was clearly critical by audio.', role: 'District Social Welfare Officer', name: 'District Office, Bihar' },
  { quote: 'Our counsellors now walk into the first session already knowing the trauma and isolation risk profile.', name: 'Rehabilitation Coordinator', role: 'State SC/ST Welfare Department' },
];

// Every government-platform page (Dashboard Overview, Complaints, Victim
// Assessment, Voice/NLP Analysis, Risk Intelligence, AI Recommendations,
// Executive Dashboard, Geographic Intelligence, Counsellor Workspace, Victim
// Journey Timeline, Intervention Command Center, AI Model Monitoring, Privacy
// & Ethics Center, AI Support Assistant, Channel Monitoring, Reports &
// Analytics, Settings) is fully wired to the real backend
// (server/src/routes/*.ts) - no mock data constants remain for them.

// ---------- IVRS workflow (channel monitoring) ----------
const IVRS_LABELS = ['Call Received', 'IVR Menu', 'Language Selection', 'Complaint Recording', 'Auto-Transcription', 'Routed to Desk'];
export const IVRS_STEPS = IVRS_LABELS.map((label, i) => ({ label, n: i + 1, hasArrow: i < IVRS_LABELS.length - 1 }));

// ---------- intervention command center: escalation workflow ----------
const COMMAND_LABELS = ['Risk Detection', 'Escalation Trigger', 'Police Assignment', 'Counsellor Assignment', 'Protection Order', 'Resolution'];
export const COMMAND_STEPS = COMMAND_LABELS.map((label, i) => ({ label, n: i + 1, hasArrow: i < COMMAND_LABELS.length - 1 }));

// ---------- victim portal ----------
// VictimDashboard, Legal Aid, Emergency Support, File a Complaint, Case
// Timeline, Counselling Center, My Documents, and AI Companion are all
// wired to the real backend - no mock data constants remain for them.
export const WELLNESS_RESOURCES = [
  { title: '2-Minute Breathing Exercise', type: 'Audio' }, { title: 'Understanding Trauma Responses', type: 'Article' }, { title: 'Talking to Your Family', type: 'Guide' },
];
export const VICTIM_TABS = [
  { key: 'dashboard', label: 'Home' }, { key: 'complaint', label: 'File Complaint' }, { key: 'timeline', label: 'Timeline' },
  { key: 'counselling', label: 'Counselling' }, { key: 'legal', label: 'Legal Aid' }, { key: 'documents', label: 'Documents' },
  { key: 'emergency', label: 'Emergency' }, { key: 'companion', label: 'Companion' },
];
export const NOTIFICATIONS = [
  { text: 'Counsellor appointment scheduled for Sep 19', time: '2h ago' },
  { text: 'Protection request approved', time: '1d ago' },
  { text: 'Legal hearing reminder: Oct 2', time: '2d ago' },
  { text: 'Document verification completed', time: '3d ago' },
];

export const LEGAL_RESOURCES = [
  { title: 'Your Rights Under the SC/ST (Prevention of Atrocities) Act', type: 'Guide' },
  { title: 'State Legal Aid Scheme Eligibility', type: 'Scheme' },
  { title: 'Frequently Asked Questions', type: 'FAQ' },
];
export const LEGAL_FAQ = [
  { q: 'What happens next?', a: 'Your case is currently under judicial review. The next step is your scheduled hearing on Oct 2, 2026 at the Special Court, Bhojpur.' },
  { q: 'What documents are needed?', a: 'You will need your complaint copy, FIR copy, and any medical or witness statements. Your legal representative has copies on file.' },
  { q: 'What are my rights?', a: 'You have the right to free legal aid, protection from intimidation, victim compensation, and to be kept informed of all case proceedings.' },
  { q: 'How do I apply for compensation?', a: 'Compensation is applied for automatically once your FIR is registered under the Act. You can track its status in the Compensation Tracking section.' },
];

export const NEARBY_SERVICES = [
  { type: 'Nearest Police Station', name: 'Bhojpur Sadar Police Station', meta: '1.8 km away', contact: '+91 612-2xxxxxx' },
  { type: 'Nearest Counselling Center', name: 'District Women & Child Support Center', meta: 'Open now · 2.4 km away', contact: '+91 612-2xxxxxx' },
  { type: 'Nearest Legal Aid Office', name: 'District Legal Services Authority', meta: '3.1 km away', contact: '+91 612-2xxxxxx' },
  { type: 'Nearest Shelter Home', name: 'Sakhi One Stop Centre', meta: 'Beds available · 4.6 km away', contact: '+91 612-2xxxxxx' },
];
export const EMERGENCY_CONTACTS = [
  { label: 'National Helpline', value: '14566' }, { label: 'State Helpline', value: '181' },
  { label: 'District Emergency Officer', value: 'Insp. Rathi · +91 98xxxxxx01' }, { label: 'Assigned Counsellor', value: 'Meera Nair · +91 98xxxxxx45' },
];
