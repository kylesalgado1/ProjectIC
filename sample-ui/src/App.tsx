import { useEffect, useRef, useState, type ReactNode } from 'react';

/* ============================================================================
   I See (IC) — Sample UI (mock data only, no backend)
   Each location owns its own editable packages, promotions & rooms.
   ============================================================================ */

/* ---------------- Types ---------------- */
type Page = 'landing' | 'dashboard' | 'customer';

interface Location { id: string; name: string; region: string; }
interface Pkg { id: string; name: string; desc: string; minGuests: number; price2: number; price3: number; weekend2: number; weekend3: number; active: boolean; popular?: boolean; }
interface Promo { id: string; name: string; desc: string; start: string; end: string; active: boolean; }
interface Reservation { id: string; start: string; end: string; }
interface RoomType { id: string; name: string; capacity: number; quantity: number; working: boolean; reservations: Reservation[]; }

/* ---------------- Peak pricing ----------------
   Mon–Thu = regular (the stored price2 / price3, per person).
   Fri–Sun & holidays = regular * PEAK_MULTIPLIER.
   1.2 => weekend/holiday is 120% of regular (a 20% bump).
   Change to 2.2 if you mean "increase BY 120%" (more than double). */
const PEAK_MULTIPLIER = 1.2;
const PEAK_PCT = Math.round((PEAK_MULTIPLIER - 1) * 100);
const peak = (regular: number) => Math.round(regular * PEAK_MULTIPLIER * 100) / 100;

/* ---------------- Seed data (per location) ---------------- */
const LOCATIONS: Location[] = [
  { id: 'sf', name: 'San Francisco', region: 'CA' },
  { id: 'roseville', name: 'Roseville', region: 'CA' },
  { id: 'concord', name: 'Concord', region: 'CA' },
];

/* Prices are PER GUEST. price2/price3 = weekday (Mon–Thu) 2 hr / 3 hr; weekend2/weekend3 = Fri–Sun & holiday 2 hr / 3 hr. */
const PARTY_MENU: Omit<Pkg, 'id'>[] = [
  { name: 'All Inclusive Party', desc: 'Maximize fun and minimize cost! Experience the most of what we have to offer. We have plenty of options for everyone!', minGuests: 10, price2: 40.64, price3: 45.64, weekend2: 49.64, weekend3: 54.64, active: true, popular: true },
  { name: 'Bowling Party', desc: 'Strike up the fun! Spend a couple hours on the lanes and get in some good old friendly competition to see who can come out on top!', minGuests: 6, price2: 27.99, price3: 30.99, weekend2: 31.99, weekend3: 35.99, active: true },
  { name: 'Arcade Party', desc: 'Get your game on! Try your luck on our various claw machines or play your heart out on racing, dancing, PCB games, and more. You can win it all!', minGuests: 6, price2: 27.99, price3: 31.99, weekend2: 30.99, weekend3: 34.99, active: true },
];
const menuFor = (loc: string): Pkg[] => PARTY_MENU.map((p, i) => ({ ...p, id: `${loc}-pkg${i}` }));
const SEED_PACKAGES: Record<string, Pkg[]> = {
  sf: menuFor('sf'),
  roseville: menuFor('roseville'),
  concord: menuFor('concord'),
};

const SEED_PROMOS: Record<string, Promo[]> = {
  sf: [
    { id: 'sf-mymelody', name: 'My Melody Takeover', desc: 'Limited My Melody prize machines, photo spot & plush claw prizes.', start: '2026-06-01', end: '2026-08-31', active: true },
    { id: 'sf-miku', name: 'Hatsune Miku Rhythm Fest', desc: 'Exclusive Project DIVA rhythm cabinets & tour merch.', start: '2026-07-01', end: '2026-09-30', active: true },
    { id: 'sf-cinnamoroll', name: 'Cinnamoroll Winter Cafe', desc: 'Cinnamoroll claw machines, café treats & winter prizes.', start: '2026-11-15', end: '2026-12-31', active: false },
  ],
  roseville: [
    { id: 'au-mymelody', name: 'My Melody Takeover', desc: 'Limited My Melody prize machines, photo spot & plush claw prizes.', start: '2026-06-01', end: '2026-08-31', active: true },
    { id: 'au-miku', name: 'Hatsune Miku Rhythm Fest', desc: 'Exclusive Project DIVA rhythm cabinets & tour merch.', start: '2026-07-01', end: '2026-09-30', active: false },
  ],
  concord: [
    { id: 'ch-mymelody', name: 'My Melody Takeover', desc: 'Limited My Melody prize machines, photo spot & plush claw prizes.', start: '2026-06-01', end: '2026-08-31', active: true },
    { id: 'ch-cinnamoroll', name: 'Cinnamoroll Winter Cafe', desc: 'Cinnamoroll claw machines, café treats & winter prizes.', start: '2026-11-15', end: '2026-12-31', active: true },
  ],
};

const SEED_ROOMS: Record<string, RoomType[]> = {
  sf: [
    { id: 'sf-large', name: ' Extra Large Room 1', capacity: 40, quantity: 2, working: true, reservations: [
      { id: 'sf-large-r1', start: '2026-07-18T15:00', end: '2026-07-18T17:00' },
      { id: 'sf-large-r2', start: '2026-07-18T18:00', end: '2026-07-18T20:00' },
    ] },
    { id: 'sf-party', name: 'Extra Large Room 2', capacity: 40, quantity: 3, working: true, reservations: [] },
    { id: 'sf-vip', name: 'Large Room', capacity: 30, quantity: 1, working: false, reservations: [] },
  ],
  roseville: [
    { id: 'ro-large', name: 'Large Room', capacity: 50, quantity: 2, working: true, reservations: [] },
    { id: 'ro-lane', name: 'Lane Suite', capacity: 12, quantity: 4, working: true, reservations: [] },
  ],
  concord: [
    { id: 'co-large', name: 'Large Room', capacity: 35, quantity: 1, working: true, reservations: [] },
    { id: 'co-party', name: 'Party Room', capacity: 14, quantity: 2, working: true, reservations: [] },
  ],
};

/* Bowling lanes per location (just a count — managers edit it on the dashboard). */
const SEED_LANES: Record<string, number> = {
  sf: 12,
  roseville: 8,
  concord: 11,
};

/* ---------------- Helpers ---------------- */
const money = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
let seqId = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seqId++}`;

/* Bump DATA_VERSION whenever the seed data changes. On load, if the saved copy is
   from an older version, we clear it so the new seed shows automatically (just refresh). */
const DATA_VERSION = '2';
try {
  if (localStorage.getItem('ic-version') !== DATA_VERSION) {
    ['ic-packages', 'ic-promos', 'ic-rooms', 'ic-lanes'].forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('ic-version', DATA_VERSION);
  }
} catch { /* storage unavailable — ignore */ }

/* datetime-local strings are local time, so format them directly (no timeZone). */
const fmtReservation = (start: string, end: string) => {
  const s = new Date(start);
  if (isNaN(s.getTime())) return '—';
  const dateOpt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const timeOpt: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const datePart = s.toLocaleDateString('en-US', dateOpt);
  const sTime = s.toLocaleTimeString('en-US', timeOpt);
  const e = new Date(end);
  if (isNaN(e.getTime())) return `${datePart} · ${sTime}`;
  const eTime = e.toLocaleTimeString('en-US', timeOpt);
  return s.toDateString() === e.toDateString()
    ? `${datePart} · ${sTime} – ${eTime}`
    : `${datePart} ${sTime} → ${e.toLocaleDateString('en-US', dateOpt)} ${eTime}`;
};

function roomStatus(r: RoomType): { label: string; cls: string } {
  if (!r.working) return { label: 'Out of service', cls: 'bad' };
  const count = (r.reservations ?? []).length;
  if (count > 0) return { label: count >= r.quantity ? 'Fully reserved' : 'Reserved', cls: 'reserved' };
  return { label: 'Available', cls: 'ok' };
}

/* ---------------- Mock "AI" answer engine ---------------- */
interface AnswerItem { label: string; value?: string; meta?: string; }
interface Answer { text: string; items?: AnswerItem[]; }

interface KPkg { name: string; minGuests: number; price2: number; price3: number; active: boolean; popular?: boolean; }
interface KPromo { name: string; desc: string; start: string; end: string; active: boolean; }
interface KRoom { name: string; capacity: number; quantity: number; working: boolean; }
interface LocKnow { id: string; city: string; packages: KPkg[]; promos: KPromo[]; rooms: KRoom[]; lanes: number; }
interface Knowledge { currentId: string; locations: LocKnow[]; }

/* Build the multi-location knowledge the assistant reasons over. */
function buildLocations(pk: Record<string, Pkg[]>, pr: Record<string, Promo[]>, rm: Record<string, RoomType[]>, ln: Record<string, number>): LocKnow[] {
  return LOCATIONS.map((l) => ({
    id: l.id,
    city: l.name,
    packages: (pk[l.id] ?? []).map((p) => ({ name: p.name, minGuests: p.minGuests, price2: p.price2, price3: p.price3, active: p.active, popular: p.popular })),
    promos: (pr[l.id] ?? []).map((p) => ({ name: p.name, desc: p.desc, start: p.start, end: p.end, active: p.active })),
    rooms: (rm[l.id] ?? []).map((r) => ({ name: r.name, capacity: r.capacity, quantity: r.quantity, working: r.working })),
    lanes: ln[l.id] ?? 0,
  }));
}

function findLocationIn(q: string, locs: LocKnow[]): LocKnow | null {
  for (const l of locs) if (q.includes(l.city.toLowerCase())) return l;
  if (/\bsf\b/.test(q) || /san fran/.test(q)) return locs.find((l) => l.id === 'sf') ?? null;
  return null;
}
function firstMentioned(q: string, names: string[]): string | null {
  for (const name of names) {
    const n = name.toLowerCase();
    if (q.includes(n) || n.split(' ').some((w) => w.length > 3 && q.includes(w))) return name;
  }
  return null;
}
/* Cross-location answers: "which location has… / where is…" */
function answerAcross(q: string, locs: LocKnow[]): Answer | null {
  /* Bowling lanes across locations ("which has the most/fewest lanes?") */
  if (/\blanes?\b/.test(q)) {
    const ranked = [...locs].sort((a, b) => b.lanes - a.lanes);
    const total = ranked.reduce((sum, l) => sum + l.lanes, 0);
    const list = ranked.map((l) => ({ label: l.city, value: `${l.lanes} lanes` }));
    if (/\b(most|max|maximum|biggest|largest|highest)\b/.test(q)) {
      return { text: `${ranked[0].city} has the most bowling lanes — ${ranked[0].lanes}.`, items: list };
    }
    if (/\b(fewest|least|min|minimum|smallest|lowest)\b/.test(q)) {
      const b = ranked[ranked.length - 1];
      return { text: `${b.city} has the fewest bowling lanes — ${b.lanes}.`, items: list };
    }
    return { text: `Bowling lanes by location (${total} total):`, items: list };
  }
  const promoName = firstMentioned(q, locs.flatMap((l) => l.promos.map((p) => p.name)));
  if (promoName) {
    const where = locs.filter((l) => l.promos.some((p) => p.name === promoName && p.active)).map((l) => l.city);
    return where.length
      ? { text: `${promoName} is active at ${where.length} location${where.length === 1 ? '' : 's'}:`, items: where.map((c) => ({ label: c, value: 'Active' })) }
      : { text: `${promoName} isn't active at any location right now.` };
  }
  const m = q.match(/(\d+)/);
  if (m && /\b(room|rooms|fit|fits|people|guests|guest|seat|hold|holds|party|group)\b/.test(q)) {
    const n = parseInt(m[1], 10);
    const rows = locs
      .map((l) => {
        const best = l.rooms.filter((r) => r.working && r.quantity > 0 && r.capacity >= n).sort((a, b) => a.capacity - b.capacity)[0];
        return best ? { city: l.city, room: best } : null;
      })
      .filter((x): x is { city: string; room: KRoom } => x !== null);
    return rows.length
      ? { text: `${rows.length} location${rows.length === 1 ? '' : 's'} can fit ${n} guests:`, items: rows.map((r) => ({ label: r.city, value: r.room.name, meta: `up to ${r.room.capacity}` })) }
      : { text: `No location has a room for ${n} guests right now.` };
  }
  const pkgName = firstMentioned(q, locs.flatMap((l) => l.packages.map((p) => p.name)));
  if (pkgName) {
    const where = locs.filter((l) => l.packages.some((p) => p.name === pkgName && p.active)).map((l) => l.city);
    return where.length
      ? { text: `${pkgName} is offered at:`, items: where.map((c) => ({ label: c })) }
      : { text: `${pkgName} isn't offered at any location right now.` };
  }
  return null;
}

function answer(qRaw: string, know: Knowledge): Answer {
  const q = qRaw.toLowerCase();
  const locs = know.locations;
  const current = locs.find((l) => l.id === know.currentId) ?? locs[0];
  const named = findLocationIn(q, locs);

  /* Cross-location: "which location has… / where is… / what locations do you have" */
  if (!named && (/\b(which|what|any|other|all|each|every|how many)\b[^.?!]*\b(location|locations|store|stores)\b/.test(q) || /\bwhere\b/.test(q))) {
    const cross = answerAcross(q, locs);
    if (cross) return cross;
    if (/\b(location|locations|store|stores)\b/.test(q)) {
      return { text: `We have ${locs.length} locations:`, items: locs.map((l) => ({ label: l.city })) };
    }
  }

  const k = named ?? current;
  const city = k.city;

  /* Promotions (arcade character events) */
  if (/\b(promo|promotion|discount|special|sale|running|event)\b|melody|miku|hatsune|cinnamoroll|cinnamon/.test(q)) {
    const named = k.promos.find((p) => {
      const n = p.name.toLowerCase();
      return q.includes(n) || n.split(' ').some((w) => w.length > 3 && q.includes(w));
    });
    if (named) {
      return named.active
        ? { text: `Yes — ${named.name} is running at ${city} right now. ${named.desc} It runs ${fmtDate(named.start)}–${fmtDate(named.end)}.` }
        : { text: `No — ${named.name} isn't active at ${city} right now.` };
    }
    const active = k.promos.filter((p) => p.active);
    return active.length
      ? { text: `Active arcade promotions at ${city}:`, items: active.map((p) => ({ label: p.name, value: 'Active', meta: `Ends ${fmtDate(p.end)}` })) }
      : { text: `There are no active promotions at ${city} right now.` };
  }

  /* Bowling lanes (count for this location) */
  if (/\blanes?\b/.test(q)) {
    return { text: `${city} has ${k.lanes} bowling lane${k.lanes === 1 ? '' : 's'}.` };
  }

  /* Packages (per person; Mon–Thu regular, Fri–Sun & holidays higher) */
  if (/\b(package|packages|price|prices|pricing|cost|book|booking|bowl|bowling|arcade|inclusive|hour|hours)\b/.test(q)) {
    const active = k.packages.filter((p) => p.active);
    if (!active.length) return { text: `No packages are currently active at ${city}.` };
    return {
      text: `We offer ${active.length} party package${active.length === 1 ? '' : 's'} at ${city} — per guest, weekday (Mon–Thu) pricing shown; weekends & holidays cost more. Each has a 2-hour or 3-hour option:`,
      items: active.map((p) => ({ label: p.popular ? `${p.name} ★` : p.name, value: `${money(p.price2)} / ${money(p.price3)}`, meta: `2 hr / 3 hr · min ${p.minGuests} guests` })),
    };
  }

  /* Rooms */
  if (/\b(room|rooms|fit|fits|capacity|people|guests|guest|seat|seats|hold|holds|space)\b/.test(q) || /\d/.test(q)) {
    const usable = k.rooms.filter((r) => r.working && r.quantity > 0);
    if (!usable.length) return { text: `No rooms are currently in service at ${city}.` };
    const m = q.match(/(\d+)/);
    const n = m ? parseInt(m[1], 10) : null;
    if (n !== null) {
      const fits = usable.filter((r) => r.capacity >= n).sort((a, b) => a.capacity - b.capacity);
      if (!fits.length) {
        const largest = [...usable].sort((a, b) => b.capacity - a.capacity)[0];
        return { text: `No room at ${city} fits ${n} guests. The largest in service is the ${largest.name} (up to ${largest.capacity}).` };
      }
      const best = fits[0];
      return {
        text: `The ${best.name} is the best fit at ${city} — it holds up to ${best.capacity} guests (${best.quantity} available).`,
        items: fits.map((r) => ({ label: r.name, value: `${r.capacity} guests`, meta: `${r.quantity} available` })),
      };
    }
    return { text: `Rooms in service at ${city}:`, items: usable.map((r) => ({ label: r.name, value: `${r.capacity} guests`, meta: `${r.quantity} available` })) };
  }

  if (/\b(hi|hello|hey|help)\b/.test(q)) {
    return { text: `Hi! I'm IC. Ask me about packages, arcade promotions, or rooms at ${city}.` };
  }
  return { text: `I can help with packages, arcade promotions, and rooms at ${city}. Try “What packages do you offer?”, “Is My Melody running?”, or “What room fits 20 people?”.` };
}

/* ---------------- Persisted state (edits survive a refresh) ---------------- */
function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* storage unavailable — ignore */ }
  }, [key, state]);
  return [state, setState] as const;
}

/* ---------------- Shared UI bits ---------------- */
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

interface Msg { id: number; role: 'user' | 'ic'; text: string; items?: AnswerItem[]; }
let msgId = 0;

function Chat({ knowledge, welcome, suggestions }: { knowledge: Knowledge; welcome: string; suggestions: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ id: msgId++, role: 'ic', text: welcome }]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, typing]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setMsgs((m) => [...m, { id: msgId++, role: 'user', text: clean }]);
    setDraft('');
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const a = answer(clean, knowledge);
      setMsgs((m) => [...m, { id: msgId++, role: 'ic', text: a.text, items: a.items }]);
      setTyping(false);
    }, 550);
  };

  return (
    <div className="chat">
      <div className="chat__scroll" ref={scrollRef} aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'msg--user' : 'msg--ic'}`}>
            {m.role === 'ic' && <span className="msg__avatar" aria-hidden="true">IC</span>}
            <div className="bubble">
              <p>{m.text}</p>
              {m.items && m.items.length > 0 && (
                <ul className="bubble__list">
                  {m.items.map((it, i) => (
                    <li key={i}>
                      <span className="bubble__label">{it.label}</span>
                      <span className="bubble__right">
                        {it.value && <b>{it.value}</b>}
                        {it.meta && <em>{it.meta}</em>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="msg msg--ic">
            <span className="msg__avatar" aria-hidden="true">IC</span>
            <div className="bubble bubble--typing" aria-label="IC is typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      <div className="composer">
        <div className="chips">
          {suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(draft); }}>
          <label className="sr-only" htmlFor="ci">Ask IC a question</label>
          <input id="ci" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about packages, promotions, or rooms…" autoComplete="off" />
          <button type="submit" disabled={!draft.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Top navigation ---------------- */
function TopNav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <header className="topbar">
      <div className="wrap topbar__inner">
        <button className="brand" onClick={() => setPage('landing')} aria-label="IC home">
          <span className="brand__mark">IC</span>
          <span className="brand__text">I See<span className="brand__tag">Every location's truth</span></span>
        </button>
        <nav className="topbar__nav" aria-label="Primary">
          <button className={page === 'landing' ? 'on' : ''} onClick={() => setPage('landing')}>Home</button>
          <button className={page === 'dashboard' ? 'on' : ''} onClick={() => setPage('dashboard')}>Dashboard</button>
          <button className={page === 'customer' ? 'on' : ''} onClick={() => setPage('customer')}>Customer chat</button>
        </nav>
      </div>
    </header>
  );
}

/* ---------------- Landing ---------------- */
function Landing({ setPage }: { setPage: (p: Page) => void }) {
  const features: [string, string][] = [
    ['Company + local truth', 'Define knowledge once at HQ; each location tunes its own packages, promos, and rooms.'],
    ['AI assistant', 'Ask in plain language and get answers scoped to the right location instantly.'],
    ['Every location in sync', 'Roll out fleet-wide, then let each store adjust what makes it different.'],
  ];
  const steps: [string, string, string][] = [
    ['1', 'Publish corporate knowledge', 'Packages, promotions, and rooms defined once as the baseline.'],
    ['2', 'Tune each location', 'Every store edits pricing, promos, and its own rooms.'],
    ['3', 'Ask anything', 'IC resolves it into one clear, location-specific answer.'],
  ];
  return (
    <main>
      <section className="hero wrap">
        <span className="eyebrow">I See Knowledge</span>
        <h1>Every location has its own truth. IC keeps it straight.</h1>
        <p className="lead">Company knowledge blended with each location's own packages, promotions, and rooms — delivering accurate, location-specific answers for staff and guests alike.</p>
        <div className="hero__cta">
          <button className="btn btn--primary" onClick={() => setPage('dashboard')}>Open manager dashboard →</button>
          <button className="btn btn--ghost" onClick={() => setPage('customer')}>Try the customer chat</button>
        </div>
        <div className="equation" aria-label="Company Knowledge plus Location Overrides equals Location-Specific Answers">
          <span className="eq">Company Knowledge</span>
          <i>+</i>
          <span className="eq">Location Overrides</span>
          <i>=</i>
          <span className="eq eq--accent">Location-Specific Answers</span>
        </div>
      </section>

      <section className="features wrap">
        {features.map(([t, d]) => (
          <div key={t} className="card feature"><h3>{t}</h3><p>{d}</p></div>
        ))}
      </section>

      <section className="how wrap">
        <h2>How IC works</h2>
        <div className="steps">
          {steps.map(([n, t, d]) => (
            <div key={n} className="card step"><span className="step__n">{n}</span><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="lp-showcase wrap">
        <div className="lp-showcase__head">
          <span className="eyebrow eyebrow--neon">Built for entertainment venues</span>
          <h2>From bowling lanes to the arcade floor</h2>
          <p className="lead lead--center">IC turns each venue's packages, promotions, and rooms into instant, location-specific answers — for staff and guests alike.</p>
        </div>
        <div className="lp-showcase__grid">
          <div className="card showcase-chat">
            <div className="showcase-chat__bar"><span className="dot" /> IC Assistant · San Francisco</div>
            <div className="showcase-chat__body">
              <div className="sc-msg sc-msg--user">What packages do you offer?</div>
              <div className="sc-msg sc-msg--ic">All Inclusive, Bowling &amp; Arcade parties — from $27.99 per guest (Mon–Thu), with a 2 hr or 3 hr option.</div>
              <div className="sc-msg sc-msg--user">Is My Melody active?</div>
              <div className="sc-msg sc-msg--ic">Yes — the My Melody Takeover is running through Aug 31, 2026.</div>
            </div>
          </div>
          <div className="showcase-side">
            <div className="showcase-block">
              <h4>🕹️ Arcade promotions</h4>
              <div className="chiprow">
                <span className="neon-chip">My Melody Takeover</span>
                <span className="neon-chip">Hatsune Miku Rhythm Fest</span>
                <span className="neon-chip">Cinnamoroll Winter Cafe</span>
              </div>
            </div>
            <div className="showcase-block">
              <h4>🎟️ Packages &amp; rooms</h4>
              <div className="chiprow">
                <span className="pill-chip">All-Inclusive</span>
                <span className="pill-chip">Bowling</span>
                <span className="pill-chip">Arcade</span>
                <span className="pill-chip">Large Room · 40</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">© 2026 Northstar Entertainment Group · I See — sample prototype</footer>
    </main>
  );
}

/* ---------------- Dashboard: editable panels ---------------- */
function Stat({ label, value, meta }: { label: string; value: ReactNode; meta?: string }) {
  return (
    <div className="card stat">
      <span className="muted small">{label}</span>
      <span className="stat__v">{value}</span>
      {meta && <span className="muted small">{meta}</span>}
    </div>
  );
}

function PackagesEditor({ packages, dur, onDur, onUpdate, onDelete, onAdd }: {
  packages: Pkg[];
  dur: Record<string, number>;
  onDur: (id: string, d: number) => void;
  onUpdate: (id: string, patch: Partial<Pkg>) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string, desc: string, minGuests: number, price2: number, price3: number) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [min, setMin] = useState('6');
  const [p2, setP2] = useState('27.99');
  const [p3, setP3] = useState('30.99');
  const active = packages.filter((p) => p.active).length;

  const submit = () => {
    const n = name.trim();
    const g = parseInt(min, 10);
    const a = parseFloat(p2), b = parseFloat(p3);
    if (!n || !Number.isFinite(g) || g < 1 || !isFinite(a) || a < 0 || !isFinite(b) || b < 0) return;
    onAdd(n, desc.trim(), g, a, b);
    setName(''); setDesc(''); setMin('6'); setP2('27.99'); setP3('30.99');
  };

  return (
    <div className="card panel">
      <div className="panel__head"><h3>Packages</h3><span className="pill">{active} active</span></div>
      <p className="panel__hint">Per guest. Each package has a weekday (Mon–Thu) and a weekend / holiday (Fri–Sun) price, plus a minimum guest count. Toggle a package, or add / delete.</p>
      <ul className="editable-list">
        {packages.length === 0 && <li className="list-empty muted">No packages yet — add one below.</li>}
        {packages.map((p) => {
          const d = dur[p.id] ?? 2;
          const weekday = d === 2 ? p.price2 : p.price3;
          const weekend = d === 2 ? p.weekend2 : p.weekend3;
          return (
            <li key={p.id} className={`edit-item ${p.active ? '' : 'dim'}`}>
              <div className="edit-item__top">
                <div className="row__name">{p.name}{p.popular && <span className="tag tag--info">Popular</span>}</div>
                <div className="edit-item__actions">
                  <Toggle on={p.active} onChange={(v) => onUpdate(p.id, { active: v })} label={`Toggle ${p.name}`} />
                  <button type="button" className="del" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p.id)}>✕</button>
                </div>
              </div>
              <div className="muted small">{p.desc}</div>
              <div className="pkg-pricing">
                <div className="seg" role="group" aria-label={`Duration for ${p.name}`}>
                  <button className={d === 2 ? 'on' : ''} aria-pressed={d === 2} onClick={() => onDur(p.id, 2)}>2 hr</button>
                  <button className={d === 3 ? 'on' : ''} aria-pressed={d === 3} onClick={() => onDur(p.id, 3)}>3 hr</button>
                </div>
                <div className="pkg-prices">
                  <div className="pkg-price">
                    <span className="pkg-price__label">Mon–Thu</span>
                    <span className="pkg-price__val">{money(weekday)}<span className="per">/guest</span></span>
                  </div>
                  <div className="pkg-price pkg-price--peak">
                    <span className="pkg-price__label">Fri–Sun · holidays</span>
                    <span className="pkg-price__val">{money(weekend)}<span className="per">/guest</span></span>
                  </div>
                </div>
                <span className="pkg-min">Min. {p.minGuests} guests</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="add-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Package name (e.g. Laser Tag Party)" aria-label="New package name" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" aria-label="New package description" />
        <input className="num" type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min" aria-label="Minimum guests" />
        <input className="num" type="number" min={0} step="0.01" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="2 hr $" aria-label="2 hour weekday price" />
        <input className="num" type="number" min={0} step="0.01" value={p3} onChange={(e) => setP3(e.target.value)} placeholder="3 hr $" aria-label="3 hour weekday price" />
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={!name.trim()}>Add package</button>
      </div>
    </div>
  );
}

function PromosEditor({ promos, onUpdate, onDelete, onAdd }: {
  promos: Promo[];
  onUpdate: (id: string, patch: Partial<Promo>) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string, desc: string, start: string, end: string) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [start, setStart] = useState('2026-06-01');
  const [end, setEnd] = useState('2026-08-31');
  const active = promos.filter((p) => p.active).length;

  const submit = () => {
    const n = name.trim();
    if (!n || !start || !end) return;
    onAdd(n, desc.trim(), start, end);
    setName(''); setDesc(''); setStart('2026-06-01'); setEnd('2026-08-31');
  };

  return (
    <div className="card panel">
      <div className="panel__head"><h3>Promotions</h3><span className="pill">{active} active</span></div>
      <p className="panel__hint">Arcade character events. Toggle active, edit the run dates, or add / delete promotions.</p>
      <ul className="editable-list">
        {promos.length === 0 && <li className="list-empty muted">No promotions yet — add one below.</li>}
        {promos.map((p) => (
          <li key={p.id} className={`edit-item ${p.active ? '' : 'dim'}`}>
            <div className="edit-item__top">
              <div className="row__name">{p.name}<span className="tag tag--arcade">Arcade</span></div>
              <div className="edit-item__actions">
                <span className={`tag ${p.active ? 'tag--ok' : 'tag--off'}`}>{p.active ? 'Active' : 'Inactive'}</span>
                <Toggle on={p.active} onChange={(v) => onUpdate(p.id, { active: v })} label={`Toggle ${p.name}`} />
                <button type="button" className="del" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p.id)}>✕</button>
              </div>
            </div>
            <div className="muted small">{p.desc}</div>
            <div className="promo-dates">
              <label className="datefield"><span>Start</span>
                <input type="date" className="dateinput" value={p.start} aria-label={`Start date for ${p.name}`} onChange={(e) => onUpdate(p.id, { start: e.target.value })} />
              </label>
              <label className="datefield"><span>End</span>
                <input type="date" className="dateinput" value={p.end} aria-label={`End date for ${p.name}`} onChange={(e) => onUpdate(p.id, { end: e.target.value })} />
              </label>
            </div>
          </li>
        ))}
      </ul>
      <div className="add-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Promotion name (e.g. Kirby Pop-Up)" aria-label="New promotion name" onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description" aria-label="New promotion description" />
        <label className="datefield"><span>Start</span>
          <input type="date" className="dateinput" value={start} onChange={(e) => setStart(e.target.value)} aria-label="New promotion start date" />
        </label>
        <label className="datefield"><span>End</span>
          <input type="date" className="dateinput" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="New promotion end date" />
        </label>
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={!name.trim()}>Add promotion</button>
      </div>
    </div>
  );
}

function RoomCard({ room, onUpdate, onDelete, onAddReservation, onRemoveReservation }: {
  room: RoomType;
  onUpdate: (id: string, patch: Partial<RoomType>) => void;
  onDelete: (id: string) => void;
  onAddReservation: (id: string, start: string, end: string) => void;
  onRemoveReservation: (id: string, resId: string) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const status = roomStatus(room);
  const reservations = [...(room.reservations ?? [])].sort((a, b) => a.start.localeCompare(b.start));

  const addRes = () => {
    if (!start || !end) return;
    onAddReservation(room.id, start, end);
    setStart(''); setEnd('');
  };

  return (
    <li className={`edit-item room-card ${room.working ? '' : 'dim'}`}>
      <div className="edit-item__top">
        <div className="row__name">{room.name}<span className={`tag tag--${status.cls}`}>{status.label}</span></div>
        <div className="edit-item__actions">
          <button type="button" className={`status-btn ${room.working ? 'ok' : 'bad'}`} aria-pressed={!room.working}
            onClick={() => onUpdate(room.id, { working: !room.working })}>
            {room.working ? 'In service' : 'Out of service'}
          </button>
          <button type="button" className="del" aria-label={`Delete ${room.name}`} onClick={() => onDelete(room.id)}>✕</button>
        </div>
      </div>

      <div className="room-fields">
        <label className="field"><span>Capacity</span>
          <span className="field__row">
            <input className="num" type="number" min={1} value={room.capacity} aria-label={`Capacity of ${room.name}`}
              onChange={(e) => onUpdate(room.id, { capacity: Math.max(1, parseInt(e.target.value, 10) || 1) })} />
            <span className="muted small">guests</span>
          </span>
        </label>
        <label className="field"><span>Quantity</span>
          <input className="num" type="number" min={0} value={room.quantity} aria-label={`How many ${room.name} rooms`}
            onChange={(e) => onUpdate(room.id, { quantity: Math.max(0, parseInt(e.target.value, 10) || 0) })} />
        </label>
      </div>

      {room.working && (
        <div className="reservations">
          <div className="reservations__head">
            Reserved times{reservations.length > 0 ? ` · ${reservations.length}${room.quantity > 1 ? ` of ${room.quantity}` : ''} booked` : ''}
          </div>
          {reservations.length === 0
            ? <p className="res-empty muted small">No reservations — this room is available.</p>
            : (
              <ul className="res-list">
                {reservations.map((res) => (
                  <li key={res.id} className="res-item">
                    <span className="res-time">{fmtReservation(res.start, res.end)}</span>
                    <button type="button" className="del del--sm" aria-label="Remove this reservation" onClick={() => onRemoveReservation(room.id, res.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          <div className="res-add">
            <label className="datefield"><span>From</span>
              <input type="datetime-local" className="dateinput" value={start} onChange={(e) => setStart(e.target.value)} aria-label={`Reservation start for ${room.name}`} />
            </label>
            <label className="datefield"><span>To</span>
              <input type="datetime-local" className="dateinput" value={end} onChange={(e) => setEnd(e.target.value)} aria-label={`Reservation end for ${room.name}`} />
            </label>
            <button type="button" className="btn btn--secondary btn--sm" onClick={addRes} disabled={!start || !end}>Reserve</button>
          </div>
        </div>
      )}
    </li>
  );
}

function RoomsEditor({ rooms, onUpdate, onDelete, onAdd, onAddReservation, onRemoveReservation }: {
  rooms: RoomType[];
  onUpdate: (id: string, patch: Partial<RoomType>) => void;
  onDelete: (id: string) => void;
  onAdd: (name: string, capacity: number, quantity: number) => void;
  onAddReservation: (id: string, start: string, end: string) => void;
  onRemoveReservation: (id: string, resId: string) => void;
}) {
  const [name, setName] = useState('');
  const [cap, setCap] = useState('30');
  const [qty, setQty] = useState('1');
  const inService = rooms.filter((r) => r.working).length;

  const submit = () => {
    const n = name.trim();
    const c = parseInt(cap, 10);
    const q = parseInt(qty, 10);
    if (!n || !Number.isFinite(c) || c < 1 || !Number.isFinite(q) || q < 0) return;
    onAdd(n, c, q);
    setName(''); setCap('30'); setQty('1');
  };

  return (
    <div className="card panel">
      <div className="panel__head"><h3>Rooms</h3><span className="pill">{inService} in service</span></div>
      <p className="panel__hint">Set capacity &amp; quantity, mark a room out of service, or reserve it for specific times (add multiple for a queue).</p>
      <ul className="editable-list">
        {rooms.length === 0 && <li className="list-empty muted">No room types yet — add one below.</li>}
        {rooms.map((r) => (
          <RoomCard key={r.id} room={r} onUpdate={onUpdate} onDelete={onDelete} onAddReservation={onAddReservation} onRemoveReservation={onRemoveReservation} />
        ))}
      </ul>
      <div className="add-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Room type (e.g. Large Room)" aria-label="New room type name"
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <input className="num" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Cap" aria-label="New room capacity" />
        <input className="num" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" aria-label="New room quantity" />
        <button type="button" className="btn btn--primary btn--sm" onClick={submit} disabled={!name.trim()}>Add room</button>
      </div>
    </div>
  );
}

function LanesEditor({ lanes, onChange }: { lanes: number; onChange: (n: number) => void }) {
  return (
    <div className="card panel">
      <div className="panel__head"><h3>Bowling Lanes</h3><span className="pill">{lanes} total</span></div>
      <p className="panel__hint">The number of bowling lanes at this location. The assistant uses this to answer guest questions.</p>
      <div className="lanes-body">
        <label className="field"><span>Lanes at this location</span>
          <span className="field__row">
            <input className="num" type="number" min={0} value={lanes} aria-label="Number of bowling lanes"
              onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))} />
            <span className="muted small">lanes</span>
          </span>
        </label>
      </div>
    </div>
  );
}

function Dashboard() {
  const [loc, setLoc] = useState('sf');
  const [pkgDur, setPkgDur] = useState<Record<string, number>>({});
  const [packagesByLoc, setPackagesByLoc] = usePersistentState<Record<string, Pkg[]>>('ic-packages', SEED_PACKAGES);
  const [promosByLoc, setPromosByLoc] = usePersistentState<Record<string, Promo[]>>('ic-promos', SEED_PROMOS);
  const [roomsByLoc, setRoomsByLoc] = usePersistentState<Record<string, RoomType[]>>('ic-rooms', SEED_ROOMS);
  const [lanesByLoc, setLanesByLoc] = usePersistentState<Record<string, number>>('ic-lanes', SEED_LANES);

  const resetDemo = () => { setPackagesByLoc(SEED_PACKAGES); setPromosByLoc(SEED_PROMOS); setRoomsByLoc(SEED_ROOMS); setLanesByLoc(SEED_LANES); setPkgDur({}); };

  const packages = packagesByLoc[loc] ?? [];
  const promos = promosByLoc[loc] ?? [];
  const rooms = roomsByLoc[loc] ?? [];
  const lanes = lanesByLoc[loc] ?? 0;
  const loco = LOCATIONS.find((l) => l.id === loc)!;

  const activePkgs = packages.filter((p) => p.active).length;
  const activePromos = promos.filter((p) => p.active).length;
  const roomsInService = rooms.filter((r) => r.working).length;

  const updatePackage = (id: string, patch: Partial<Pkg>) => setPackagesByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const deletePackage = (id: string) => setPackagesByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).filter((p) => p.id !== id) }));
  const addPackage = (name: string, desc: string, minGuests: number, price2: number, price3: number) =>
    setPackagesByLoc((m) => ({ ...m, [loc]: [...(m[loc] ?? []), { id: uid('pkg'), name, desc: desc || '—', minGuests, price2, price3, weekend2: peak(price2), weekend3: peak(price3), active: true }] }));
  const setDur = (id: string, d: number) => setPkgDur((o) => ({ ...o, [id]: d }));

  const updatePromo = (id: string, patch: Partial<Promo>) => setPromosByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const deletePromo = (id: string) => setPromosByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).filter((p) => p.id !== id) }));
  const addPromo = (name: string, desc: string, start: string, end: string) =>
    setPromosByLoc((m) => ({ ...m, [loc]: [...(m[loc] ?? []), { id: uid('promo'), name, desc: desc || '—', start, end, active: true }] }));

  const updateRoom = (id: string, patch: Partial<RoomType>) => setRoomsByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const deleteRoom = (id: string) => setRoomsByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).filter((r) => r.id !== id) }));
  const addRoom = (name: string, capacity: number, quantity: number) =>
    setRoomsByLoc((m) => ({ ...m, [loc]: [...(m[loc] ?? []), { id: uid('room'), name, capacity, quantity, working: true, reservations: [] }] }));
  const addReservation = (id: string, start: string, end: string) =>
    setRoomsByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).map((r) => (r.id === id ? { ...r, reservations: [...(r.reservations ?? []), { id: uid('res'), start, end }] } : r)) }));
  const removeReservation = (id: string, resId: string) =>
    setRoomsByLoc((m) => ({ ...m, [loc]: (m[loc] ?? []).map((r) => (r.id === id ? { ...r, reservations: (r.reservations ?? []).filter((x) => x.id !== resId) } : r)) }));

  const updateLanes = (n: number) => setLanesByLoc((m) => ({ ...m, [loc]: n }));

  const knowledge: Knowledge = { currentId: loc, locations: buildLocations(packagesByLoc, promosByLoc, roomsByLoc, lanesByLoc) };

  return (
    <main className="dash wrap">
      <div className="dash__head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Location-specific knowledge for {loco.name}, {loco.region}</p>
        </div>
        <div className="dash__controls">
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetDemo}>Reset demo data</button>
          <label className="locsel">
            <span>Current location</span>
            <select value={loc} onChange={(e) => setLoc(e.target.value)}>
              {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}, {l.region}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="stats stats--4">
        <Stat label="Active Packages" value={activePkgs} meta={`of ${packages.length} total`} />
        <Stat label="Active Promotions" value={activePromos} meta="arcade events live now" />
        <Stat label="Bowling Lanes" value={lanes} meta="lanes on the floor" />
        <Stat label="Rooms in Service" value={roomsInService} meta={`${rooms.length} room type${rooms.length === 1 ? '' : 's'}`} />
      </div>

      <div className="dash__grid">
        <div className="dash__col">
          <PackagesEditor packages={packages} dur={pkgDur} onDur={setDur} onUpdate={updatePackage} onDelete={deletePackage} onAdd={addPackage} />
          <PromosEditor promos={promos} onUpdate={updatePromo} onDelete={deletePromo} onAdd={addPromo} />
          <LanesEditor lanes={lanes} onChange={updateLanes} />
          <RoomsEditor rooms={rooms} onUpdate={updateRoom} onDelete={deleteRoom} onAdd={addRoom} onAddReservation={addReservation} onRemoveReservation={removeReservation} />
        </div>
        <div className="dash__col">
          <div className="card assistant">
            <div className="assistant__head">
              <span className="msg__avatar" aria-hidden="true">IC</span>
              <div><b>Manager AI Assistant</b><div className="muted small">Answers scoped to {loco.name}</div></div>
            </div>
            <Chat
              key={loc}
              knowledge={knowledge}
              welcome={`I see — ask me about packages, arcade promotions, lanes, or rooms for ${loco.name}.`}
              suggestions={['What packages do we offer?', 'How many bowling lanes?', 'Which location has the most lanes?']}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------------- Customer page (reads the manager's saved data) ---------------- */
function Customer() {
  const [loc, setLoc] = useState('sf');
  const [packagesByLoc] = usePersistentState<Record<string, Pkg[]>>('ic-packages', SEED_PACKAGES);
  const [promosByLoc] = usePersistentState<Record<string, Promo[]>>('ic-promos', SEED_PROMOS);
  const [roomsByLoc] = usePersistentState<Record<string, RoomType[]>>('ic-rooms', SEED_ROOMS);
  const [lanesByLoc] = usePersistentState<Record<string, number>>('ic-lanes', SEED_LANES);
  const loco = LOCATIONS.find((l) => l.id === loc)!;

  const knowledge: Knowledge = { currentId: loc, locations: buildLocations(packagesByLoc, promosByLoc, roomsByLoc, lanesByLoc) };

  return (
    <main className="cust wrap">
      <div className="cust__intro">
        <label className="locsel locsel--center">
          <span>Location</span>
          <select value={loc} onChange={(e) => setLoc(e.target.value)}>
            {LOCATIONS.map((l) => <option key={l.id} value={l.id}>{l.name}, {l.region}</option>)}
          </select>
        </label>
        <h1>How can we help at our {loco.name} location?</h1>
        <p className="muted">Ask about packages, arcade promotions, or which room fits your group. Answers are specific to this location.</p>
      </div>
      <div className="card cust__card">
        <div className="cust__bar"><span className="dot" /> IC Assistant · Online</div>
        <Chat
          key={loc}
          knowledge={knowledge}
          welcome={`Welcome to ${loco.name}! I see — ask me about our packages, arcade promotions, bowling lanes, or rooms.`}
          suggestions={['What packages do you offer?', 'How many bowling lanes?', 'Is My Melody active in Concord?']}
        />
      </div>
    </main>
  );
}

/* ---------------- App shell ---------------- */
export default function App() {
  const [page, setPage] = useState<Page>('landing');
  return (
    <div className="app">
      <TopNav page={page} setPage={setPage} />
      {page === 'landing' && <Landing setPage={setPage} />}
      {page === 'dashboard' && <Dashboard />}
      {page === 'customer' && <Customer />}
    </div>
  );
}
