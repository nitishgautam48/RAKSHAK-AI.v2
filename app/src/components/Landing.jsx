import Hoverable from './Hoverable';
import BrandMark from './BrandMark';
import { LANDING_FEATURES, WORKFLOW_STEPS, ROLES, BENEFITS, TESTIMONIALS } from '../data/constants';

export default function Landing({ onEnterPlatform, onEnterVictimPortal }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0c12' }}>
      {/* NAV */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, flexWrap: 'wrap', padding: '18px 48px', background: 'rgba(10,12,18,.75)', backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark />
          <div style={{ font: '700 17px Sora,sans-serif', letterSpacing: '.2px' }}>TraumaSense <span style={{ color: 'oklch(0.72 0.14 235)' }}>AI</span></div>
        </div>
        <div className="tsa-navlinks" style={{ display: 'flex', gap: 18, fontSize: 13.5, color: '#aab0c0', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <a href="#mission" style={{ color: '#aab0c0' }}>Mission</a>
          <a href="#features" style={{ color: '#aab0c0' }}>Features</a>
          <a href="#workflow" style={{ color: '#aab0c0' }}>How it works</a>
          <a href="#stakeholders" style={{ color: '#aab0c0' }}>Stakeholders</a>
          <a href="#helpline" style={{ color: '#aab0c0' }}>Helpline 14566</a>
        </div>
        <Hoverable
          as="button"
          onClick={onEnterPlatform}
          style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.6 0.15 235))', color: '#fff', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer', transition: 'transform .15s,box-shadow .15s' }}
          hoverStyle={{ transform: 'translateY(-1px)', boxShadow: '0 6px 16px -4px oklch(0.58 0.19 275 / 0.5)' }}
        >
          Enter Platform →
        </Hoverable>
      </div>

      {/* HERO */}
      <div style={{ position: 'relative', padding: '96px 48px 80px', maxWidth: 1360, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 56, alignItems: 'center' }}>
        <div style={{ position: 'absolute', top: -120, right: -180, width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle,oklch(0.4 0.15 275 / 0.35),transparent 70%)', filter: 'blur(20px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', fontSize: 12.5, color: 'oklch(0.78 0.12 200)', marginBottom: 24 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.72 0.15 145)', animation: 'pulse 2s infinite' }} />
            National Helpline Against Atrocities · 14566
          </div>
          <h1 style={{ font: '800 52px/1.12 Sora,sans-serif', margin: '0 0 22px', letterSpacing: '-.5px' }}>AI-Powered Trauma Detection for Victim Protection and Early Intervention</h1>
          <p style={{ fontSize: 17, lineHeight: 1.65, color: '#aab0c0', maxWidth: 560, margin: '0 0 32px' }}>
            TraumaSense AI supports the Department of Social Justice and Empowerment, State Governments, law enforcement, counsellors, and rehabilitation authorities in assessing the psychological stress, trauma, fear, and vulnerability of SC/ST victims and complainants &mdash; using speech analytics, NLP, and emotion recognition to generate a Stress Vulnerability Index (SVI) and guide timely intervention.
          </p>
          <div style={{ display: 'flex', gap: 14 }}>
            <Hoverable
              as="button"
              onClick={onEnterPlatform}
              style={{ padding: '14px 26px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.6 0.15 235))', color: '#fff', font: '600 15px Sora,sans-serif', cursor: 'pointer', transition: 'transform .15s,box-shadow .15s' }}
              hoverStyle={{ transform: 'translateY(-1px)', boxShadow: '0 8px 20px -6px oklch(0.58 0.19 275 / 0.55)' }}
            >
              Launch Platform
            </Hoverable>
            <Hoverable
              as="a"
              href="#workflow"
              style={{ padding: '14px 26px', borderRadius: 9, border: '1px solid rgba(255,255,255,.15)', color: '#eef0f6', font: "600 15px 'IBM Plex Sans',sans-serif", transition: 'border-color .15s,background .15s' }}
              hoverStyle={{ borderColor: 'rgba(255,255,255,.3)', background: 'rgba(255,255,255,.04)' }}
            >
              See how it works
            </Hoverable>
          </div>
          <div style={{ display: 'flex', gap: 36, marginTop: 44 }}>
            <div><div style={{ font: '700 26px Sora,sans-serif' }}>10</div><div style={{ fontSize: 12.5, color: '#7d8399' }}>Indian languages supported</div></div>
            <div><div style={{ font: '700 26px Sora,sans-serif' }}>24/7</div><div style={{ fontSize: 12.5, color: '#7d8399' }}>Helpline &amp; response desk</div></div>
            <div><div style={{ font: '700 26px Sora,sans-serif' }}>5</div><div style={{ fontSize: 12.5, color: '#7d8399' }}>Role-based command views</div></div>
          </div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: 22, backdropFilter: 'blur(20px)', boxShadow: '0 30px 60px -20px rgba(0,0,0,.6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ font: '600 13px Sora,sans-serif', color: '#aab0c0' }}>Live Stress Vulnerability Index</div>
            <div style={{ fontSize: 11, color: '#7d8399' }}>Updated 2 min ago</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
            <div style={{ font: '800 44px Sora,sans-serif', color: 'oklch(0.7 0.17 55)' }}>68.4</div>
            <div style={{ fontSize: 13, color: 'oklch(0.7 0.17 55)' }}>High Risk band</div>
          </div>
          <svg viewBox="0 0 300 70" style={{ width: '100%', height: 70, display: 'block' }}>
            <polyline points="0,50 30,44 60,48 90,32 120,38 150,22 180,28 210,14 240,20 270,10 300,16" fill="none" stroke="oklch(0.65 0.16 55)" strokeWidth="2.5" />
          </svg>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 20 }}>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ font: '700 18px Sora,sans-serif', color: 'oklch(0.72 0.15 145)' }}>312</div><div style={{ fontSize: 10.5, color: '#7d8399' }}>Low</div></div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ font: '700 18px Sora,sans-serif', color: 'oklch(0.8 0.15 95)' }}>184</div><div style={{ fontSize: 10.5, color: '#7d8399' }}>Moderate</div></div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ font: '700 18px Sora,sans-serif', color: 'oklch(0.7 0.17 55)' }}>96</div><div style={{ fontSize: 10.5, color: '#7d8399' }}>High</div></div>
            <div style={{ background: 'rgba(255,255,255,.03)', borderRadius: 8, padding: 10, textAlign: 'center' }}><div style={{ font: '700 18px Sora,sans-serif', color: 'oklch(0.62 0.21 25)' }}>27</div><div style={{ fontSize: 10.5, color: '#7d8399' }}>Critical</div></div>
          </div>
        </div>
      </div>

      {/* ROLE ENTRY */}
      <div style={{ padding: '0 48px 90px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 10 }}>CHOOSE YOUR ENTRY POINT</div>
          <h2 style={{ font: '700 28px Sora,sans-serif', margin: 0 }}>Built for both sides of the case</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>
          <Hoverable
            style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: 34, transition: 'border-color .15s,transform .15s' }}
            hoverStyle={{ borderColor: 'rgba(255,255,255,.2)', transform: 'translateY(-3px)' }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.6 0.15 235))', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z" /></svg>
            </div>
            <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 8 }}>Government Platform</div>
            <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 14 }}>For Helpline Operators, District Officers, Counsellors, Law Enforcement, Administrators, and Ministry Officials.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              <div title="Access restricted to authorized government departments and officials." style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', fontSize: 11.5, color: '#c4c8d4', cursor: 'default' }}>🛡 Government Officials Only</div>
              <div title="Access restricted to authorized government departments and officials." style={{ padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', fontSize: 11.5, color: '#c4c8d4', cursor: 'default' }}>🏛 NIC / ePramaan Ready</div>
            </div>
            <Hoverable
              as="button"
              onClick={onEnterPlatform}
              style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.6 0.15 235))', color: '#fff', font: '700 14.5px Sora,sans-serif', cursor: 'pointer', transition: 'transform .15s' }}
              hoverStyle={{ transform: 'translateY(-1px)' }}
            >
              Enter Command Platform
            </Hoverable>
          </Hoverable>
          <Hoverable
            style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: 34, transition: 'border-color .15s,transform .15s' }}
            hoverStyle={{ borderColor: 'rgba(255,255,255,.2)', transform: 'translateY(-3px)' }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'oklch(0.72 0.15 145)', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d0f16' }}>
              <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-4.5-9.5-9C1 8 2 4 6 4c2 0 4 1.5 6 4 2-2.5 4-4 6-4 4 0 5 4 3.5 8-2.5 4.5-9.5 9-9.5 9z" /></svg>
            </div>
            <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 8 }}>Survivor Support Portal</div>
            <div style={{ fontSize: 13, color: '#8b91a3', marginBottom: 14 }}>For victims, survivors, and family members seeking case updates, counselling, and support.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              <div title="Your information is encrypted and shared only with authorized support providers." style={{ padding: '5px 12px', borderRadius: 20, background: 'oklch(0.72 0.15 145 / 0.12)', border: '1px solid oklch(0.72 0.15 145 / 0.3)', fontSize: 11.5, color: 'oklch(0.82 0.13 145)', cursor: 'default' }}>🔒 Mobile OTP Protected</div>
              <div title="Your information is encrypted and shared only with authorized support providers." style={{ padding: '5px 12px', borderRadius: 20, background: 'oklch(0.72 0.15 145 / 0.12)', border: '1px solid oklch(0.72 0.15 145 / 0.3)', fontSize: 11.5, color: 'oklch(0.82 0.13 145)', cursor: 'default' }}>🤝 Privacy First Access</div>
            </div>
            <Hoverable
              as="button"
              onClick={onEnterVictimPortal}
              style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: 'oklch(0.72 0.15 145)', color: '#0d0f16', font: '700 14.5px Sora,sans-serif', cursor: 'pointer', transition: 'transform .15s' }}
              hoverStyle={{ transform: 'translateY(-1px)' }}
            >
              Get Support
            </Hoverable>
          </Hoverable>
        </div>
      </div>

      {/* MISSION */}
      <div id="mission" style={{ padding: '80px 48px', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 14 }}>MISSION</div>
        <p style={{ font: '600 26px/1.5 Sora,sans-serif', color: '#eef0f6', maxWidth: 820, margin: '0 auto' }}>
          To protect Scheduled Caste and Scheduled Tribe victims of atrocities by detecting psychological distress early, routing every complaint through an evidence-based risk lens, and connecting victims to counselling, medical, legal and protective support before harm escalates.
        </p>
      </div>

      {/* FEATURES */}
      <div id="features" style={{ padding: '20px 48px 90px', maxWidth: 1360, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 10 }}>KEY FEATURES</div>
          <h2 style={{ font: '700 32px Sora,sans-serif', margin: 0 }}>Built for the full case lifecycle</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {LANDING_FEATURES.map((f) => (
            <Hoverable
              key={f.title}
              style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 26, transition: 'border-color .15s,transform .15s' }}
              hoverStyle={{ borderColor: 'rgba(255,255,255,.18)', transform: 'translateY(-3px)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 10, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: f.dot }}>
                <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={f.icon} /></svg>
              </div>
              <div style={{ font: '600 16px Sora,sans-serif', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#8b91a3' }}>{f.desc}</div>
            </Hoverable>
          ))}
        </div>
      </div>

      {/* WORKFLOW */}
      <div id="workflow" style={{ padding: '80px 48px', background: 'rgba(255,255,255,.02)', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 10 }}>AI WORKFLOW</div>
            <h2 style={{ font: '700 32px Sora,sans-serif', margin: 0 }}>From a single interaction to a protection plan</h2>
          </div>
          <div className="tsa-scroll" style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
            {WORKFLOW_STEPS.map((w) => (
              <div key={w.n} style={{ display: 'flex', alignItems: 'center', flex: 'none' }}>
                <div style={{ width: 150, textAlign: 'center' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 12, background: 'linear-gradient(135deg,oklch(0.3 0.06 275),oklch(0.24 0.04 235))', border: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', font: '700 15px Sora,sans-serif', color: 'oklch(0.75 0.13 200)' }}>{w.n}</div>
                  <div style={{ font: "600 12.5px 'IBM Plex Sans',sans-serif", lineHeight: 1.35 }}>{w.label}</div>
                </div>
                {w.hasArrow && <div style={{ width: 32, height: 1, background: 'rgba(255,255,255,.15)', flex: 'none' }} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STAKEHOLDERS */}
      <div id="stakeholders" style={{ padding: '80px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 10 }}>STAKEHOLDERS</div>
          <h2 style={{ font: '700 32px Sora,sans-serif', margin: 0 }}>One platform, five coordinated roles</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16 }}>
          {ROLES.map((r) => (
            <Hoverable
              key={r.name}
              style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 20, textAlign: 'center', transition: 'border-color .15s,transform .15s' }}
              hoverStyle={{ borderColor: 'rgba(255,255,255,.18)', transform: 'translateY(-3px)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: r.color, opacity: 0.9, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0d0f16' }}>
                <svg viewBox="0 0 24 24" width="52%" height="52%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={r.icon} /></svg>
              </div>
              <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 6 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: '#8b91a3', lineHeight: 1.5 }}>{r.desc}</div>
            </Hoverable>
          ))}
        </div>
      </div>

      {/* BENEFITS + HELPLINE */}
      <div style={{ padding: '20px 48px 80px', maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 16, padding: 32 }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.72 0.15 145)', letterSpacing: '1px', marginBottom: 14 }}>BENEFITS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {BENEFITS.map((b) => (
              <div key={b} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.72 0.15 145)', marginTop: 6, flex: 'none' }} />
                <div style={{ fontSize: 14, color: '#c4c8d4', lineHeight: 1.5 }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div id="helpline" style={{ background: 'linear-gradient(160deg,rgba(255,80,80,.08),rgba(255,255,255,.03))', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.68 0.19 25)', letterSpacing: '1px', marginBottom: 14 }}>NATIONAL HELPLINE INTEGRATION</div>
          <div style={{ font: '700 40px Sora,sans-serif', marginBottom: 8 }}>14566</div>
          <div style={{ fontSize: 14, color: '#c4c8d4', lineHeight: 1.6 }}>Every call to the National Helpline Against Atrocities is logged, transcribed, and scored in real time &mdash; feeding directly into a complaint record and the Emergency Response Center for critical-risk escalation.</div>
        </div>
      </div>

      {/* TESTIMONIALS */}
      <div style={{ padding: '20px 48px 90px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ font: "600 12.5px 'IBM Plex Mono',monospace", color: 'oklch(0.7 0.13 200)', letterSpacing: '1px', marginBottom: 10 }}>FROM THE FIELD</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {TESTIMONIALS.map((t) => (
            <Hoverable
              key={t.name}
              style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 26, transition: 'border-color .15s' }}
              hoverStyle={{ borderColor: 'rgba(255,255,255,.18)' }}
            >
              <div style={{ fontSize: 14, lineHeight: 1.65, color: '#c4c8d4', marginBottom: 18 }}>&ldquo;{t.quote}&rdquo;</div>
              <div style={{ font: '600 13px Sora,sans-serif' }}>{t.name}</div>
              <div style={{ fontSize: 12, color: '#7d8399' }}>{t.role}</div>
            </Hoverable>
          ))}
        </div>
      </div>

      {/* GOV COLLAB */}
      <div style={{ padding: '56px 48px', borderTop: '1px solid rgba(255,255,255,.06)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: '#7d8399', letterSpacing: '1px', marginBottom: 18 }}>IN COLLABORATION WITH</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap', color: '#8b91a3', font: '600 13.5px Sora,sans-serif' }}>
          <div>Department of Social Justice &amp; Empowerment</div>
          <div>State Governments</div>
          <div>National Commission for SCs/STs</div>
          <div>District Law Enforcement</div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '70px 48px', textAlign: 'center', background: 'linear-gradient(135deg,oklch(0.22 0.05 275),oklch(0.18 0.04 235))' }}>
        <h2 style={{ font: '700 30px Sora,sans-serif', margin: '0 0 16px' }}>Ready to bring early intervention to your jurisdiction?</h2>
        <p style={{ color: '#c4c8d4', margin: '0 0 28px' }}>Request onboarding for your district, department, or helpline desk.</p>
        <Hoverable
          as="button"
          onClick={onEnterPlatform}
          style={{ padding: '14px 30px', borderRadius: 9, border: 'none', background: '#fff', color: '#171a24', font: '700 15px Sora,sans-serif', cursor: 'pointer', transition: 'transform .15s,box-shadow .15s' }}
          hoverStyle={{ transform: 'translateY(-1px)', boxShadow: '0 10px 24px -8px rgba(0,0,0,.4)' }}
        >
          Enter Platform
        </Hoverable>
      </div>

      {/* FOOTER */}
      <div style={{ padding: '36px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: '#7d8399', flexWrap: 'wrap', gap: 12 }}>
        <div>&copy; 2026 TraumaSense AI &middot; Ministry of Social Justice and Empowerment</div>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="#" style={{ color: '#7d8399' }}>Privacy</a>
          <a href="#" style={{ color: '#7d8399' }}>Accessibility</a>
          <a href="#" style={{ color: '#7d8399' }}>Helpline 14566</a>
        </div>
      </div>
    </div>
  );
}
