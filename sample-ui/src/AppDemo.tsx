import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

/* ============================================================================
   App demo — the real IC app experience (frontend/src/App.tsx) running on
   demo data only. No backend, no database, no AI: answers come from the same
   deterministic rules the backend uses, ported to the browser.
   ============================================================================ */

interface DemoLocation { id: string; name: string; city: string; region: string; lanes: number; hours: string; }
interface DemoPackage {
  id: string; name: string; description: string; minGuests: number;
  weekday2: number; weekday3: number; weekend2: number; weekend3: number;
  active: boolean; popular: boolean;
}
interface DemoPromo { id: string; name: string; description: string; startsOn: string; endsOn: string; active: boolean; }
interface DemoRoom { id: string; name: string; capacity: number; quantity: number; working: boolean; }

interface DemoData {
  packages: Record<string, DemoPackage[]>;
  promos: Record<string, DemoPromo[]>;
  rooms: Record<string, DemoRoom[]>;
}

/* ---- Demo data: mirrors seed.sql (prices in cents) ---- */
const DEMO_LOCATIONS: DemoLocation[] = [
  { id: 'roseville', name: 'Round1 Roseville Galleria', city: 'Roseville', region: 'CA', lanes: 8, hours: '10 AM to 2 AM' },
  { id: 'sf', name: 'Round1 Stonestown Galleria', city: 'San Francisco', region: 'CA', lanes: 12, hours: '10 AM to 2 AM' },
  { id: 'concord', name: 'Round1 Sunvalley Mall', city: 'Concord', region: 'CA', lanes: 11, hours: '10 AM to 2 AM' },
];

const PARTY_MENU: Omit<DemoPackage, 'id'>[] = [
  {
    name: 'All Inclusive Party',
    description: 'Maximize fun and minimize cost! Experience the most of what we have to offer. We have plenty of options for everyone!',
    minGuests: 10, weekday2: 4064, weekday3: 4564, weekend2: 4964, weekend3: 5464, active: true, popular: true,
  },
  {
    name: 'Bowling Party',
    description: 'Strike up the fun! Spend a couple hours on the lanes and get in some good old friendly competition to see who can come out on top!',
    minGuests: 6, weekday2: 2799, weekday3: 3099, weekend2: 3199, weekend3: 3599, active: true, popular: false,
  },
  {
    name: 'Arcade Party',
    description: 'Get your game on! Try your luck on our various claw machines or play your heart out on racing, dancing, PCB games, and more. You can win it all!',
    minGuests: 6, weekday2: 2799, weekday3: 3199, weekend2: 3099, weekend3: 3499, active: true, popular: false,
  },
];

function seedData(): DemoData {
  const packages: Record<string, DemoPackage[]> = {};
  for (const loc of DEMO_LOCATIONS) {
    packages[loc.id] = PARTY_MENU.map((p, i) => ({ ...p, id: `${loc.id}-pkg${i}` }));
  }
  return {
    packages,
    promos: {
      sf: [
        { id: 'sf-mymelody', name: 'My Melody Takeover', description: 'Limited My Melody prize machines, photo spot & plush claw prizes.', startsOn: '2026-06-01', endsOn: '2026-08-31', active: true },
        { id: 'sf-miku', name: 'Hatsune Miku Rhythm Fest', description: 'Exclusive Project DIVA rhythm cabinets & tour merch.', startsOn: '2026-07-01', endsOn: '2026-09-30', active: true },
        { id: 'sf-cinnamoroll', name: 'Cinnamoroll Winter Cafe', description: 'Cinnamoroll claw machines, café treats & winter prizes.', startsOn: '2026-11-15', endsOn: '2026-12-31', active: false },
      ],
      roseville: [
        { id: 'roseville-mymelody', name: 'My Melody Takeover', description: 'Limited My Melody prize machines, photo spot & plush claw prizes.', startsOn: '2026-06-01', endsOn: '2026-08-31', active: true },
        { id: 'roseville-miku', name: 'Hatsune Miku Rhythm Fest', description: 'Exclusive Project DIVA rhythm cabinets & tour merch.', startsOn: '2026-07-01', endsOn: '2026-09-30', active: false },
      ],
      concord: [
        { id: 'concord-mymelody', name: 'My Melody Takeover', description: 'Limited My Melody prize machines, photo spot & plush claw prizes.', startsOn: '2026-06-01', endsOn: '2026-08-31', active: true },
        { id: 'concord-cinnamoroll', name: 'Cinnamoroll Winter Cafe', description: 'Cinnamoroll claw machines, café treats & winter prizes.', startsOn: '2026-11-15', endsOn: '2026-12-31', active: true },
      ],
    },
    rooms: {
      sf: [
        { id: 'sf-large', name: 'Extra Large Room 1', capacity: 40, quantity: 2, working: true },
        { id: 'sf-party', name: 'Extra Large Room 2', capacity: 40, quantity: 3, working: true },
        { id: 'sf-vip', name: 'Large Room', capacity: 30, quantity: 1, working: false },
      ],
      roseville: [
        { id: 'roseville-large', name: 'Large Room', capacity: 50, quantity: 2, working: true },
        { id: 'roseville-lane', name: 'Lane Suite', capacity: 12, quantity: 4, working: true },
      ],
      concord: [
        { id: 'concord-large', name: 'Large Room', capacity: 35, quantity: 1, working: true },
        { id: 'concord-party', name: 'Party Room', capacity: 14, quantity: 2, working: true },
      ],
    },
  };
}

/* ---- Deterministic answerer: 1:1 port of assistant_answerer.py ---- */
const FALLBACK_MESSAGE =
  'I can answer questions about packages, promotions, rooms, opening hours, and bowling lanes for this location.';
const NO_PACKAGES_MESSAGE = 'No active packages are currently listed for this location.';
const NO_PROMOS_MESSAGE = 'No active promos are currently listed for this location.';
const NO_ROOM_MESSAGE = 'No listed room fits that group size.';
const NO_ROOMS_MESSAGE = 'No rooms are currently listed for this location.';
const NO_LANES_MESSAGE = 'No bowling lanes are listed for this location.';
const NO_HOURS_MESSAGE = 'Opening hours are not listed for this location.';

const PACKAGE_KEYWORDS = ['package', 'packages', 'party', 'parties', 'price', 'cost', 'offer', 'bowling', 'arcade', 'inclusive'];
const PROMO_KEYWORDS = ['promo', 'promos', 'promotion', 'discount', 'event', 'active', 'running', 'my melody', 'miku', 'cinnamoroll', 'summer'];
const ROOM_KEYWORDS = ['room', 'rooms', 'fit', 'fits', 'capacity', 'people', 'guests', 'group'];
const LANE_KEYWORDS = ['lane', 'lanes'];
const HOURS_KEYWORDS = ['hour', 'hours', 'open', 'opening', 'close', 'closing'];

const matches = (text: string, keywords: string[]) => keywords.some((k) => text.includes(k));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function firstPositiveInteger(question: string): number | null {
  for (const m of question.match(/\d+/g) ?? []) {
    const value = parseInt(m, 10);
    if (value > 0) return value;
  }
  return null;
}

function activePromosToday(promos: DemoPromo[]): DemoPromo[] {
  const on = todayIso();
  return promos.filter((p) => p.active && p.startsOn <= on && on <= p.endsOn);
}

function workingRooms(rooms: DemoRoom[]): DemoRoom[] {
  return rooms
    .filter((r) => r.working && r.quantity > 0)
    .sort((a, b) => a.capacity - b.capacity || a.id.localeCompare(b.id));
}

function packageSegment(p: DemoPackage): string {
  let details =
    `weekday 2hr ${money(p.weekday2)} / 3hr ${money(p.weekday3)},` +
    ` weekend 2hr ${money(p.weekend2)} / 3hr ${money(p.weekend3)},` +
    ` min ${p.minGuests} guests`;
  if (p.popular) details += ', most popular';
  let segment = `${p.name} (${details})`;
  if (p.description) segment += ` - ${p.description}`;
  return segment;
}

function packagesAnswer(packages: DemoPackage[]): string {
  const available = packages.filter((p) => p.active);
  if (available.length === 0) return NO_PACKAGES_MESSAGE;
  return 'Active packages: ' + available.map(packageSegment).join('; ') + '.';
}

function promosAnswer(promos: DemoPromo[]): string {
  const active = activePromosToday(promos);
  if (active.length === 0) return NO_PROMOS_MESSAGE;
  const segments = active.map((p) => {
    let segment = p.name;
    if (p.description) segment += ` - ${p.description}`;
    return `${segment} (ends ${p.endsOn})`;
  });
  return 'Active promos: ' + segments.join('; ') + '.';
}

const roomList = (rooms: DemoRoom[]) =>
  rooms.map((r) => `${r.name} (capacity ${r.capacity}, ${r.quantity} available)`).join(', ');

function roomsAnswer(rooms: DemoRoom[]): string {
  const working = workingRooms(rooms);
  if (working.length === 0) return NO_ROOMS_MESSAGE;
  return `Available rooms: ${roomList(working)}.`;
}

function fittingRoomsAnswer(rooms: DemoRoom[], groupSize: number): string {
  const fitting = workingRooms(rooms).filter((r) => r.capacity >= groupSize);
  if (fitting.length === 0) return NO_ROOM_MESSAGE;
  return `Rooms that fit ${groupSize} guests: ${roomList(fitting)}.`;
}

function answerQuestion(question: string, location: DemoLocation, data: DemoData): string {
  const text = question.toLowerCase();
  if (matches(text, LANE_KEYWORDS)) {
    return location.lanes > 0 ? `${location.name} has ${location.lanes} bowling lanes.` : NO_LANES_MESSAGE;
  }
  if (matches(text, PACKAGE_KEYWORDS)) return packagesAnswer(data.packages[location.id] ?? []);
  if (matches(text, PROMO_KEYWORDS)) return promosAnswer(data.promos[location.id] ?? []);
  if (matches(text, ROOM_KEYWORDS)) {
    const rooms = data.rooms[location.id] ?? [];
    const groupSize = firstPositiveInteger(question);
    return groupSize === null ? roomsAnswer(rooms) : fittingRoomsAnswer(rooms, groupSize);
  }
  if (matches(text, HOURS_KEYWORDS)) {
    return location.hours ? `We're open ${location.hours}.` : NO_HOURS_MESSAGE;
  }
  return FALLBACK_MESSAGE;
}

/* ---- Chat ---- */
const CHAT_GREETING = 'Ask me about packages, promotions, or rooms.';
const CHAT_SUGGESTIONS = [
  'What packages do you offer?',
  'What promos are active?',
  'What room fits 20 people?',
];

interface ChatMessage { id: number; role: 'user' | 'assistant'; text: string; }
let chatId = 0;
const chatMessage = (role: 'user' | 'assistant', text: string): ChatMessage => ({ id: ++chatId, role, text });

/* ---- Page ---- */
export default function AppDemo() {
  const [data, setData] = useState<DemoData>(seedData);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [groupSizeText, setGroupSizeText] = useState('20');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([chatMessage('assistant', CHAT_GREETING)]);
  const [chatPending, setChatPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, chatPending]);

  const selected = DEMO_LOCATIONS.find((l) => l.id === selectedId) ?? null;
  const packages = selected ? data.packages[selected.id] ?? [] : [];
  const promos = selected ? activePromosToday(data.promos[selected.id] ?? []) : [];
  const groupSize = /^\d+$/.test(groupSizeText.trim()) && parseInt(groupSizeText, 10) > 0 ? parseInt(groupSizeText, 10) : null;
  const rooms = selected && groupSize !== null
    ? workingRooms(data.rooms[selected.id] ?? []).filter((r) => r.capacity >= groupSize)
    : [];

  function selectLocation(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setGroupSizeText('20');
    setQuestion('');
    setChatPending(false);
    setMessages([chatMessage('assistant', CHAT_GREETING)]);
  }

  const setPackageActive = (id: string, active: boolean) => {
    if (!selected) return;
    setData((d) => ({
      ...d,
      packages: { ...d.packages, [selected.id]: (d.packages[selected.id] ?? []).map((p) => (p.id === id ? { ...p, active } : p)) },
    }));
  };

  const setPromoActive = (id: string, active: boolean) => {
    if (!selected) return;
    setData((d) => ({
      ...d,
      promos: { ...d.promos, [selected.id]: (d.promos[selected.id] ?? []).map((p) => (p.id === id ? { ...p, active } : p)) },
    }));
  };

  function sendQuestion(raw: string) {
    if (!selected || chatPending) return;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    const location = selected;
    setMessages((h) => [...h, chatMessage('user', trimmed)]);
    setQuestion('');
    setChatPending(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const answer = answerQuestion(trimmed, location, dataRef.current);
      setMessages((h) => [...h, chatMessage('assistant', answer)]);
      setChatPending(false);
    }, 550);
  }

  function handleChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendQuestion(question);
  }

  function handleChatKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(question);
    }
  }

  return (
    <main className="appdemo wrap">
      <div className="appdemo__intro">
        <h1>App demo</h1>
        <p className="muted">
          This is the real IC app experience with demo data — everything runs in your
          browser. No backend, no database, no AI: the assistant answers with the same
          deterministic rules the production API uses.
        </p>
      </div>

      <div className="locbar__head">
        <span className="eyebrow">Locations</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setData(seedData()); setMessages([chatMessage('assistant', CHAT_GREETING)]); }}>
          Reset demo data
        </button>
      </div>

      <ul className="loclist">
        {DEMO_LOCATIONS.map((location) => (
          <li key={location.id}>
            <button
              type="button"
              className="locbtn"
              aria-pressed={location.id === selectedId}
              onClick={() => selectLocation(location.id)}
            >
              <span className="locbtn__name">{location.name}</span>
              <span className="locbtn__city">{location.city}</span>
            </button>
          </li>
        ))}
      </ul>
      {selected === null && <p className="muted appdemo__pick">Select a location to view its dashboard.</p>}

      {selected !== null && (
        <section aria-label="Location dashboard">
          <div className="appdemo__head">
            <h2>{selected.name}</h2>
            <p className="muted">{selected.city} · {selected.lanes} lanes · Open {selected.hours}</p>
          </div>

          <div className="panels">
            <div className="col">
              <section className="card panel" aria-labelledby="demo-packages-heading">
                <div className="panel__head">
                  <h3 id="demo-packages-heading">Party Packages</h3>
                  {packages.length > 0 && <span className="pill">{packages.length}</span>}
                </div>
                <div className="panel__body">
                  {packages.length === 0 && <p className="panel__note muted">No packages available.</p>}
                  {packages.length > 0 && (
                    <ul className="items">
                      {packages.map((pkg) => (
                        <li key={pkg.id} className={`item ${pkg.active ? '' : 'is-off'}`}>
                          <div className="item__main">
                            <div className="item__name">
                              <h4 className="item__title">{pkg.name}</h4>
                              <span className={`badge ${pkg.active ? 'badge--ok' : 'badge--off'}`}>{pkg.active ? 'Active' : 'Inactive'}</span>
                              {pkg.popular && <span className="badge badge--arcade">Popular</span>}
                            </div>
                            <div className="item__desc">{pkg.description}</div>
                            <div className="item__meta">Min {pkg.minGuests} guests · Weekend from {money(pkg.weekend2)}</div>
                          </div>
                          <div className="item__price">From {money(pkg.weekday2)}</div>
                          <button
                            type="button"
                            className={`act ${pkg.active ? 'act--deactivate' : 'act--activate'}`}
                            onClick={() => setPackageActive(pkg.id, !pkg.active)}
                          >
                            {pkg.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="card panel" aria-labelledby="demo-promos-heading">
                <div className="panel__head">
                  <h3 id="demo-promos-heading">Active Promos</h3>
                  {promos.length > 0 && <span className="pill">{promos.length}</span>}
                </div>
                <div className="panel__body">
                  {promos.length === 0 && <p className="panel__note muted">No active promos.</p>}
                  {promos.length > 0 && (
                    <ul className="items">
                      {promos.map((promo) => (
                        <li key={promo.id} className="item">
                          <div className="item__main">
                            <div className="item__name">
                              <h4 className="item__title">{promo.name}</h4>
                            </div>
                            <div className="item__desc">{promo.description}</div>
                            <div className="item__meta">Starts {promo.startsOn} · Ends {promo.endsOn}</div>
                          </div>
                          <button type="button" className="act act--deactivate" onClick={() => setPromoActive(promo.id, false)}>
                            Deactivate
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="card panel" aria-labelledby="demo-rooms-heading">
                <div className="panel__head"><h3 id="demo-rooms-heading">Rooms for Group Size</h3></div>
                <div className="rooms-controls">
                  <div className="field">
                    <label htmlFor="demo-group-size">Group size</label>
                    <input
                      id="demo-group-size"
                      type="number"
                      min="1"
                      value={groupSizeText}
                      onChange={(event) => setGroupSizeText(event.target.value)}
                    />
                  </div>
                </div>
                {groupSize === null && <p className="panel__note alert" role="alert">Enter a positive whole number of guests.</p>}
                {groupSize !== null && rooms.length === 0 && <p className="panel__note muted">No rooms fit this group size.</p>}
                {groupSize !== null && rooms.length > 0 && (
                  <div className="roomgrid">
                    {rooms.map((room) => (
                      <div key={room.id} className="roomcard">
                        <h4>{room.name}</h4>
                        <p className="cap">Capacity {room.capacity}</p>
                        <p>{room.quantity} available</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="col">
              <section className="card panel chat-panel" aria-labelledby="demo-chat-heading">
                <div className="panel__head">
                  <span className="msg__avatar" aria-hidden="true">IC</span>
                  <h3 id="demo-chat-heading">IC Knowledge Assistant</h3>
                </div>
                <p className="panel__hint">Answers are generated for the selected location.</p>
                <div className="chat">
                  <div className="chat__scroll" ref={scrollRef} aria-live="polite">
                    {messages.map((message) => (
                      <div key={message.id} className={message.role === 'user' ? 'msg msg--user' : 'msg'}>
                        {message.role === 'assistant' && <span className="msg__avatar" aria-hidden="true">IC</span>}
                        <p className="bubble">{message.text}</p>
                      </div>
                    ))}
                    {chatPending && (
                      <div className="msg">
                        <span className="msg__avatar" aria-hidden="true">IC</span>
                        <div className="bubble bubble--typing" aria-label="IC is typing"><span /><span /><span /></div>
                      </div>
                    )}
                  </div>
                  <div className="composer">
                    <div className="chips">
                      {CHAT_SUGGESTIONS.map((suggestion) => (
                        <button key={suggestion} type="button" className="chip" disabled={chatPending} onClick={() => sendQuestion(suggestion)}>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                    <form onSubmit={handleChatSubmit}>
                      <label className="sr-only" htmlFor="demo-chat-question">Ask a question</label>
                      <input
                        id="demo-chat-question"
                        type="text"
                        autoComplete="off"
                        placeholder="Ask about packages, promotions, or rooms…"
                        value={question}
                        disabled={chatPending}
                        onChange={(event) => setQuestion(event.target.value)}
                        onKeyDown={handleChatKeyDown}
                      />
                      <button type="submit" disabled={selected === null || question.trim().length === 0 || chatPending}>Send</button>
                    </form>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
