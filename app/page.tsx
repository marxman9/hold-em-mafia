'use client';

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

// Sopranos-flavored Beginner Flop Helper — Call or Fold
// Cute mafia UI + animations, big cards, explicit CALL/FOLD choice,
// rotating quotes (sourced from Parade's Sopranos quotes article; fetched at runtime with fallback),
// and a periodic popup mini‑game: "Take the gun or the cannoli".
// Decision rule: If (#hands better than you) > (#hands worse than you) ⇒ Fold. Otherwise (including ties) ⇒ Call.

export default function PokerFlopTrainer() {
  // ------------------ Card utils ------------------
  const rankChars = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
  const suitChars = ["s","h","d","c"]; // spades, hearts, diamonds, clubs
  const suitSymbols: Record<string,string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

  type Card = { r: number; s: string }; // r: 2..14 (A)

  function makeDeck(): Card[] {
    const deck: Card[] = [];
    for (let r = 2; r <= 14; r++) for (const s of suitChars) deck.push({ r, s });
    return deck;
  }
  function cardToStr(c: Card) { return rankChars[c.r-2] + c.s; }
  function strToCard(t: string): Card | null {
    const v = t.trim().toUpperCase();
    if (!v || v.length < 2) return null;
    const rChar = v[0];
    const sChar = v[v.length-1].toLowerCase();
    const rIdx = rankChars.indexOf(rChar);
    if (rIdx === -1) return null;
    if (!suitChars.includes(sChar)) return null;
    return { r: rIdx + 2, s: sChar };
  }
  function cardsEqual(a: Card, b: Card){ return a.r===b.r && a.s===b.s; }

  // ------------------ Hand evaluation (5–7 cards) ------------------
  // Returns [category, ...kickers] with category:
  // 8=Straight Flush, 7=Quads, 6=Full House, 5=Flush, 4=Straight, 3=Trips, 2=Two Pair, 1=Pair, 0=High
  type RankTuple = number[];

  function countsByRank(cards: Card[]) {
    const m = new Map<number, number>();
    for (const c of cards) m.set(c.r, (m.get(c.r) || 0) + 1);
    return [...m.entries()].sort((a,b)=> b[1]-a[1] || b[0]-a[0]); // count desc, then rank desc
  }
  function suitGroups(cards: Card[]){
    const m = new Map<string, Card[]>();
    for (const c of cards){ if(!m.has(c.s)) m.set(c.s, []); m.get(c.s)!.push(c); }
    return m;
  }
  function bestStraightHigh(ranks: number[]) {
    const arr = [...new Set(ranks)].sort((a,b)=>a-b);
    if (arr.includes(14)) arr.unshift(1); // wheel
    let run = 1, best = 0;
    for (let i=1;i<arr.length;i++){
      if (arr[i] === arr[i-1] + 1){ run++; if (run>=5) best = Math.max(best, arr[i]); }
      else if (arr[i] !== arr[i-1]) run = 1;
    }
    return best; // 0 if none
  }
  function topNDesc(vals: number[], n: number){ return [...vals].sort((a,b)=>b-a).slice(0,n); }

  function evaluate(cards: Card[]): RankTuple {
    const bySuit = suitGroups(cards);
    // Straight Flush
    for (const [,cs] of bySuit){
      if (cs.length >= 5){
        const high = bestStraightHigh([...new Set(cs.map(c=>c.r))]);
        if (high>0) return [8, high];
      }
    }
    // Quads
    const cnts = countsByRank(cards);
    const quads = cnts.filter(([,c])=>c===4).map(([r])=>r).sort((a,b)=>b-a);
    if (quads.length){
      const q = quads[0];
      const k = topNDesc(cards.filter(c=>c.r!==q).map(c=>c.r),1)[0];
      return [7, q, k];
    }
    // Full House
    const trips = cnts.filter(([,c])=>c===3).map(([r])=>r).sort((a,b)=>b-a);
    const pairs = cnts.filter(([,c])=>c===2).map(([r])=>r).sort((a,b)=>b-a);
    if (trips.length>=2 || (trips.length>=1 && pairs.length>=1)){
      const t = trips[0];
      const p = trips.length>=2 ? trips[1] : pairs[0];
      return [6, t, p];
    }
    // Flush
    for (const [,cs] of bySuit){ if (cs.length>=5) return [5, ...topNDesc(cs.map(c=>c.r),5)]; }
    // Straight
    const sh = bestStraightHigh([...new Set(cards.map(c=>c.r))].sort((a,b)=>a-b));
    if (sh>0) return [4, sh];
    // Trips
    if (trips.length){
      const t = trips[0];
      const ks = topNDesc(cards.filter(c=>c.r!==t).map(c=>c.r),2);
      return [3, t, ...ks];
    }
    // Two Pair
    if (pairs.length>=2){
      const [p1,p2] = pairs.slice(0,2);
      const k = topNDesc(cards.filter(c=>c.r!==p1 && c.r!==p2).map(c=>c.r),1)[0];
      return [2, p1, p2, k];
    }
    // Pair
    if (pairs.length===1){
      const p = pairs[0];
      const ks = topNDesc(cards.filter(c=>c.r!==p).map(c=>c.r),3);
      return [1, p, ...ks];
    }
    // High card
    return [0, ...topNDesc(cards.map(c=>c.r),5)];
  }
  function compareRankTuples(a: RankTuple, b: RankTuple){
    const n = Math.max(a.length, b.length);
    for (let i=0;i<n;i++){ const av=a[i]??0, bv=b[i]??0; if (av!==bv) return av-bv; }
    return 0;
  }
  function catName(cat: number){
    return ["High Card","One Pair","Two Pair","Three of a Kind","Straight","Flush","Full House","Four of a Kind","Straight Flush"][cat] || "";
  }

  // ------------------ Beginner analysis over all opponent combos ------------------
  type Breakdown = { [label: string]: { count: number; samples: string[] } };
  type SimpleResult = {
    heroCat: string;
    better: number; // # of opponent combos currently beating you
    worse: number;  // # of opponent combos you currently beat
    tie: number;
    betterBreakdown: Breakdown;
    worseBreakdown: Breakdown;
    recommendation: "Fold" | "Call";
  };

  function analyzeSimple(hero: Card[], flop: Card[]): SimpleResult {
    // Build deck minus knowns
    const deck = makeDeck();
    function rm(c: Card){ const i = deck.findIndex(x=>cardsEqual(x,c)); if (i>=0) deck.splice(i,1); }
    hero.forEach(rm); flop.forEach(rm);

    const heroRank = evaluate([...hero, ...flop]);
    const heroCat = catName(heroRank[0]);

    let better=0, worse=0, tie=0;
    const betterBreakdown: Breakdown = {};
    const worseBreakdown: Breakdown = {};

    for (let i=0;i<deck.length;i++){
      for (let j=i+1;j<deck.length;j++){
        const opp = [deck[i], deck[j]] as Card[];
        const oppRank = evaluate([...opp, ...flop]);
        const cmp = compareRankTuples(oppRank, heroRank);
        if (cmp>0){
          better++;
          const label = catName(oppRank[0]);
          if (!betterBreakdown[label]) betterBreakdown[label] = { count: 0, samples: [] };
          betterBreakdown[label].count++;
          if (betterBreakdown[label].samples.length<3) betterBreakdown[label].samples.push(`${cardToStr(opp[0])} ${cardToStr(opp[1])}`);
        } else if (cmp<0){
          worse++;
          const label = catName(oppRank[0]);
          if (!worseBreakdown[label]) worseBreakdown[label] = { count: 0, samples: [] };
          worseBreakdown[label].count++;
          if (worseBreakdown[label].samples.length<3) worseBreakdown[label].samples.push(`${cardToStr(opp[0])} ${cardToStr(opp[1])}`);
        } else tie++;
      }
    }
    const recommendation: "Fold" | "Call" = better > worse ? "Fold" : "Call"; // ties favor Call
    return { heroCat, better, worse, tie, betterBreakdown, worseBreakdown, recommendation };
  }

  // ------------------ React state ------------------
  const [holeText, setHoleText] = React.useState("Ah Ad");
  const [flopText, setFlopText] = React.useState("Kc 7h 2d");
  const [busy, setBusy] = React.useState(false);
  const [simple, setSimple] = React.useState<SimpleResult | null>(null);

  type Decision = "Call" | "Fold";
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [verdict, setVerdict] = React.useState<null | { correct: boolean; expected: Decision }>(null);

  // Hand History (beginner)
  type HistoryRow = { id: string; hole: string; flop: string; heroCat: string; better: number; worse: number; tie: number; recommendation: "Fold"|"Call"; decision: Decision; correct: boolean };
  const [history, setHistory] = React.useState<HistoryRow[]>([]);
  React.useEffect(()=>{ try { const raw = localStorage.getItem("flopBeginnerHistory"); if (raw) setHistory(JSON.parse(raw)); } catch {} },[]);
  React.useEffect(()=>{ try { localStorage.setItem("flopBeginnerHistory", JSON.stringify(history.slice(-200))); } catch {} },[history]);

  // Quote rotation — attempt live fetch from Parade with fallback
  const QUOTES_FALLBACK = [
    // Confirmed by Parade search snippet; others are iconic series lines used as gentle fallback
    "You steer the ship the best way you know. Sometimes it's smooth. Sometimes you hit the rocks. In the meantime, you find your pleasures where you can.",
    "Those who want respect, give respect.",
    "Some people are so far behind in the race that they actually believe they're leading.",
    "All due respect, you got no idea what it's like to be Number One.",
    "If you can quote the rules, then you can obey them.",
    "I find I have to be the sad clown: laughing on the outside, crying on the inside.",
    "Someday soon you're gonna have families of your own, and if you're lucky, you'll remember the little moments like this.",
    "It's good to be in something from the ground floor."
  ];
  const [quotes, setQuotes] = React.useState<string[]>(QUOTES_FALLBACK);
  const [quoteIndex, setQuoteIndex] = React.useState(0);
  React.useEffect(()=>{
    // Use text mirror to avoid CORS where possible
    const url = "https://r.jina.ai/http://parade.com/tv/sopranos-quotes";
    fetch(url).then(r=>r.text()).then(txt=>{
      // crude parse: split on quotes; keep lines with multiple spaces & punctuation
      const lines = txt.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>0);
      const picks = lines.filter(s=>/\S+/.test(s) && /[\.\!\?\"]$/.test(s) && s.length>20).slice(0,50);
      if (picks.length>5) setQuotes(picks);
    }).catch(()=>{});
  },[]);
  React.useEffect(()=>{
    const id = setInterval(()=> setQuoteIndex(i => (i+1)%quotes.length), 8000);
    return ()=> clearInterval(id);
  },[quotes.length]);

  // Mini‑game: show after every 3rd decision
  const [decisions, setDecisions] = React.useState(0);
  const [showMini, setShowMini] = React.useState(false);
  const GUN_IMG = "https://commons.wikimedia.org/wiki/Special:FilePath/Revolver%20(PSF).png";
  const CANNOLI_IMG = "https://commons.wikimedia.org/wiki/Special:FilePath/Cannoli%20from%20Brocato%27s%20New%20Orleans%2002.jpg";
  const [miniPick, setMiniPick] = React.useState<null | "gun" | "cannoli">(null);

  // Dev tests
  type TestCase = { name: string; run: () => boolean | string };
  const [tests, setTests] = React.useState<{name:string; ok:boolean; msg?:string}[]>([]);
  const [showTests, setShowTests] = React.useState(false);

  React.useEffect(()=>{
    const T: TestCase[] = [
      {
        name: "Pair of Aces on dry flop",
        run: () => {
          const hero = ["Ah","Ad"].map(s=>strToCard(s)!) as Card[];
          const flop = ["Kc","7h","2d"].map(s=>strToCard(s)!) as Card[];
          const res = analyzeSimple(hero, flop);
          return res.heroCat === "One Pair" || `Expected One Pair, got ${res.heroCat}`;
        }
      },
      {
        name: "Trips on paired ace flop",
        run: () => {
          const hero = ["Ah","Ad"].map(s=>strToCard(s)!) as Card[];
          const flop = ["Ac","Kc","2d"].map(s=>strToCard(s)!) as Card[];
          const cat = catName(evaluate([...hero,...flop])[0]);
          return cat === "Three of a Kind" || `Expected Trips, got ${cat}`;
        }
      },
      {
        name: "Straight flush on monotone JT9c with KQ clubs",
        run: () => {
          const hero = ["Kc","Qc"].map(s=>strToCard(s)!) as Card[];
          const flop = ["Jc","Tc","9c"].map(s=>strToCard(s)!) as Card[];
          const cat = catName(evaluate([...hero,...flop])[0]);
          return cat === "Straight Flush" || `Expected Straight Flush, got ${cat}`;
        }
      }
    ];
    const results = T.map(t => { const r = t.run(); return { name: t.name, ok: r===true, msg: r===true?undefined:String(r) }; });
    setTests(results);
  },[]);

  // ------------------ Actions ------------------
  function parseCards(text: string, n: number): Card[] | null {
    const parts = text.split(/\s+/).filter(Boolean);
    if (parts.length !== n) return null;
    const cards: Card[] = [];
    for (const p of parts){ const c = strToCard(p); if (!c) return null; if (cards.some(x=>cardsEqual(x,c))) return null; cards.push(c); }
    return cards;
  }
  function randomizeScenario(){
    const deck = makeDeck();
    function draw(){ const i = Math.floor(Math.random()*deck.length); const c = deck[i]; deck.splice(i,1); return c; }
    const c1 = draw(), c2 = draw();
    const f1 = draw(), f2 = draw(), f3 = draw();
    setHoleText(`${cardToStr(c1)} ${cardToStr(c2)}`);
    setFlopText(`${cardToStr(f1)} ${cardToStr(f2)} ${cardToStr(f3)}`);
    setSimple(null); setVerdict(null); setDecision(null);
  }

  function evaluateAndRecord(userChoice: Decision){
    const hero = parseCards(holeText,2); const flop = parseCards(flopText,3);
    if (!hero || !flop){ alert("Please enter valid cards, e.g. 'Ah Ks' and '7c 8d 9h'."); return; }
    setBusy(true);
    setTimeout(()=>{
      const res = analyzeSimple(hero, flop);
      setSimple(res);
      const correct = userChoice === res.recommendation || (res.better===res.worse && userChoice==="Call");
      setVerdict({ correct, expected: res.recommendation });
      const row: HistoryRow = { id: new Date().toISOString(), hole: holeText.trim(), flop: flopText.trim(), heroCat: res.heroCat, better: res.better, worse: res.worse, tie: res.tie, recommendation: res.recommendation, decision: userChoice, correct };
      setHistory(h => [...h, row].slice(-200));
      setBusy(false);
      setDecisions(n => {
        const next = n+1;
        if (next % 3 === 0) {
          setMiniPick(null);
          setShowMini(true);
        }
        return next;
      });
    }, 10);
  }

  function onDecide(userChoice: Decision){
    setDecision(userChoice);
    evaluateAndRecord(userChoice);
  }

  function exportCSV(){
    const headers = ["time","hole","flop","heroCat","better","worse","tie","recommendation","decision","correct"];
    const rows = history.map(h => [h.id,h.hole,h.flop,h.heroCat,h.better,h.worse,h.tie,h.recommendation,h.decision,h.correct].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "flop_trainer_history.csv"; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  function clearHistory(){ if (confirm("Clear all saved hands?")) setHistory([]); }

  // ------------------ Cute Mafia UI Bits ------------------
  function badge(text: string, tone: "good"|"bad"|"neutral" = "neutral"){
    const color = tone === "good" ? "bg-emerald-100 text-emerald-800 border-emerald-300" : tone === "bad" ? "bg-rose-100 text-rose-800 border-rose-300" : "bg-slate-100 text-slate-800 border-slate-300";
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${color}`}>{text}</span>;
  }
  const DiceIcon = () => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="3"></rect>
      <circle cx="8" cy="8" r="1.5" fill="white"></circle>
      <circle cx="16" cy="8" r="1.5" fill="white"></circle>
      <circle cx="12" cy="12" r="1.5" fill="white"></circle>
      <circle cx="8" cy="16" r="1.5" fill="white"></circle>
      <circle cx="16" cy="16" r="1.5" fill="white"></circle>
    </svg>
  );

  // Big card face component
  function CardFace({ c, size=102 }: { c: Card, size?: number }){
    const suit = suitSymbols[c.s];
    const rank = rankChars[c.r-2];
    const isRed = c.s === 'h' || c.s === 'd';
    const w = size; const h = size*1.4;
    return (
      <motion.div
        layout
        whileHover={{ rotate: isRed? -2:2, y: -2 }}
        className="relative rounded-[18px] bg-white/95 border shadow-[0_8px_20px_rgba(0,0,0,0.35)] p-2 flex flex-col justify-between select-none"
        style={{ width: w, height: h }}
      >
        <div className={`text-3xl font-black ${isRed? 'text-red-600': 'text-slate-900'}`}>{rank}{suit}</div>
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <div className={`text-7xl font-black ${isRed? 'text-red-600': 'text-slate-900'}`}>{suit}</div>
        </div>
        <div className={`self-end text-3xl font-black rotate-180 ${isRed? 'text-red-600': 'text-slate-900'}`}>{rank}{suit}</div>
      </motion.div>
    );
  }

  // Floating suits background
  function FloatingSuits(){
    const items = Array.from({length: 10}).map((_,i)=>({
      key: i,
      sym: ["♠","♥","♦","♣"][i%4],
      x: Math.random()*100,
      delay: Math.random()*6,
      dur: 10+Math.random()*8
    }));
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {items.map(it=> (
          <motion.div key={it.key}
            initial={{ y: 400, opacity: 0 }}
            animate={{ y: -200, opacity: 0.25 }}
            transition={{ duration: it.dur, repeat: Infinity, delay: it.delay, repeatType: 'mirror' }}
            className="absolute text-5xl font-black"
            style={{ left: `${it.x}%`, color: it.sym==='♥'||it.sym==='♦' ? '#dc2626' : '#0f172a' }}
          >{it.sym}</motion.div>
        ))}
      </div>
    );
  }

  React.useEffect(()=>{ randomizeScenario(); },[]);

  // ------------------ UI ------------------
  return (
    <div className="relative min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100 p-4 sm:p-6 md:p-8">
      <FloatingSuits/>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 relative">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-4">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              <span className="text-red-500">Sopranos</span> Flop Helper
              <span className="ml-2 text-slate-400 text-base align-middle">— cute & ruthless</span>
            </h1>
            <motion.button
              onClick={() => { for(let i=0;i<8;i++) setTimeout(randomizeScenario, i*60); }}
              whileTap={{ scale: 0.95, rotate: -3 }}
              whileHover={{ y: -2 }}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-600 bg-red-600/10 px-4 py-2 text-sm font-semibold shadow hover:bg-red-600/20"
            >
              <motion.span animate={{ rotate: [0, 20, -20, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}><DiceIcon/></motion.span>
              Deal Me Something Nice
            </motion.button>
          </motion.div>

          {/* Rotating quotes banner (Parade) */}
          <div className="mt-3">
            <AnimatePresence mode="wait">
              <motion.div key={quoteIndex}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="rounded-xl border border-red-700/50 bg-red-900/20 px-3 py-2 text-sm"
              >
                <span className="mr-2">🗣️</span>{quotes[quoteIndex]}
                <span className="ml-2 text-xs text-slate-400">— from Parade’s Sopranos quotes</span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="grid md:grid-cols-5 gap-6">
          {/* Left: Inputs & displayed big cards */}
          <div className="md:col-span-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur shadow-xl p-4 md:p-5">
              <h2 className="font-bold text-lg mb-3">Your Cards</h2>
              <div className="space-y-4">
                {/* Hole */}
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Hole</div>
                  <div className="flex items-center gap-3">
                    {parseCards(holeText,2)?.map((c,i)=> (
                      <CardFace key={i} c={c} size={112}/>
                    ))}
                  </div>
                  <input value={holeText} onChange={e=>setHoleText(e.target.value)} placeholder="e.g., Ah Ks" className="mt-2 w-full rounded-xl border border-slate-700 bg-black/30 px-3 py-2 placeholder:text-slate-500"/>
                </div>
                {/* Flop */}
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Flop</div>
                  <div className="flex items-center gap-3">
                    {parseCards(flopText,3)?.map((c,i)=> (
                      <CardFace key={i} c={c} size={112}/>
                    ))}
                  </div>
                  <input value={flopText} onChange={e=>setFlopText(e.target.value)} placeholder="e.g., 7c 8d 9h" className="mt-2 w-full rounded-xl border border-slate-700 bg-black/30 px-3 py-2 placeholder:text-slate-500"/>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <motion.button onClick={()=>onDecide("Call")} disabled={busy}
                  whileTap={{ scale: 0.98 }} whileHover={{ y: -1 }}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold shadow disabled:opacity-60 ${decision==="Call"?"border-emerald-600 bg-emerald-600/20":"border-emerald-600 bg-emerald-600/10 hover:bg-emerald-600/20"}`}
                >{busy?"Checking with the crew…":"I Choose CALL"}</motion.button>
                <motion.button onClick={()=>onDecide("Fold")} disabled={busy}
                  whileTap={{ scale: 0.98 }} whileHover={{ y: -1 }}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold shadow disabled:opacity-60 ${decision==="Fold"?"border-rose-600 bg-rose-600/20":"border-rose-600 bg-rose-600/10 hover:bg-rose-600/20"}`}
                >{busy?"Sleeping with the fishes…":"I Choose FOLD"}</motion.button>
                <motion.button onClick={randomizeScenario}
                  whileTap={{ scale: 0.95, rotate: -2 }} whileHover={{ y: -1 }}
                  className="ml-auto inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-black/20 px-4 py-2 text-sm font-semibold"
                >
                  <DiceIcon/> New Deal
                </motion.button>
              </div>
            </div>
          </div>

          {/* Right: Result */}
          <div className="md:col-span-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur shadow-xl p-4 md:p-5">
              <h2 className="font-bold text-lg mb-2">Result</h2>
              {!simple ? (
                <p className="text-slate-300 text-sm">Choose <b>Call</b> or <b>Fold</b>. I’ll compare your made hand against <b>every possible opponent 2‑card combo</b>. If more hands beat you than you beat, I’ll say <b>Fold</b>. Otherwise (including ties), <b>Call</b>.</p>
              ) : (
                <div className="space-y-4">
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl bg-black/30 border border-slate-800 p-3">
                    <div className="text-sm">Your made hand now: <b className="text-slate-50">{simple.heroCat}</b></div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <span>Better: <b className="text-rose-400">{simple.better}</b></span>
                      <span>Worse: <b className="text-emerald-400">{simple.worse}</b></span>
                      <span>Tied: <b className="text-slate-300">{simple.tie}</b></span>
                      {simple.better > simple.worse ? badge("Fold", "bad") : badge("Call", "good")}
                    </div>
                    {decision && verdict && (
                      <div className="mt-2 text-sm">
                        You chose <b>{decision}</b> — {verdict.correct ? <span className="text-emerald-400 font-semibold">Good decision</span> : <span className="text-rose-400 font-semibold">Bad decision</span>} (optimal was <b>{verdict.expected}</b>).
                      </div>
                    )}
                  </motion.div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border border-slate-800 p-3 bg-black/20">
                      <h3 className="font-semibold">Hands that beat you now</h3>
                      {Object.keys(simple.betterBreakdown).length===0 ? (
                        <div className="text-sm text-slate-300 mt-1">None — you’re ahead of all possible hands.</div>
                      ) : (
                        <ul className="text-sm text-slate-200 mt-2 space-y-2">
                          {Object.entries(simple.betterBreakdown).sort((a,b)=>b[1].count-a[1].count).map(([label,data])=> (
                            <li key={label}>
                              <div className="flex items-start justify-between gap-2">
                                <span><b>{label}</b></span>
                                <span className="text-slate-400">{data.count}</span>
                              </div>
                              {data.samples.length>0 && (
                                <div className="text-xs text-slate-400 mt-1">e.g., {data.samples.join(", ")}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>

                    <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl border border-slate-800 p-3 bg-black/20">
                      <h3 className="font-semibold">Hands you beat now</h3>
                      {Object.keys(simple.worseBreakdown).length===0 ? (
                        <div className="text-sm text-slate-300 mt-1">None — you’re behind or tying everything.</div>
                      ) : (
                        <ul className="text-sm text-slate-200 mt-2 space-y-2">
                          {Object.entries(simple.worseBreakdown).sort((a,b)=>b[1].count-a[1].count).map(([label,data])=> (
                            <li key={label}>
                              <div className="flex items-start justify-between gap-2">
                                <span><b>{label}</b></span>
                                <span className="text-slate-400">{data.count}</span>
                              </div>
                              {data.samples.length>0 && (
                                <div className="text-xs text-slate-400 mt-1">e.g., {data.samples.join(", ")}</div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  </div>

                  <div className="text-xs text-slate-400">Note: We ignore future cards and betting. This is a street‑smart snapshot of who’s ahead <b>right now</b>.</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* History */}
        <section className="mt-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur shadow-xl p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Hand History</h2>
              <div className="flex items-center gap-2">
                <motion.button whileHover={{ y: -1 }} onClick={exportCSV} className="rounded-xl border border-slate-700 bg-black/20 px-3 py-1.5 text-sm font-semibold">Export CSV</motion.button>
                <motion.button whileHover={{ y: -1 }} onClick={clearHistory} className="rounded-xl border border-slate-700 bg-black/20 px-3 py-1.5 text-sm font-semibold">Clear</motion.button>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-300 mt-2">No hands yet. Make a decision and it’ll be saved here.</p>
            ) : (
              <div className="mt-3 space-y-2 max-h-[420px] overflow-auto pr-1">
                {history.slice().reverse().map((h) => (
                  <motion.div key={h.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 border border-slate-800 rounded-xl px-3 py-2 bg-black/20">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-400">{new Date(h.id).toLocaleString()}</div>
                      <div className="text-sm">
                        <b>{h.hole}</b> on <b>{h.flop}</b> — you had <b>{h.heroCat}</b> · You chose <b>{h.decision}</b> → {h.correct ? <span className="text-emerald-400">Good</span> : <span className="text-rose-400">Bad</span>} (optimal: {h.recommendation})
                      </div>
                      <div className="text-xs text-slate-400">Better {h.better} • Worse {h.worse} • Tie {h.tie}</div>
                    </div>
                    <div>
                      {h.recommendation === 'Fold' ? badge('Fold','bad') : badge('Call','good')}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Dev tests panel */}
        <section className="mt-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur shadow-xl p-4 md:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Dev Tests</h2>
              <motion.button whileHover={{ y: -1 }} onClick={()=>setShowTests(v=>!v)} className="rounded-xl border border-slate-700 bg-black/20 px-3 py-1.5 text-sm font-semibold">{showTests?"Hide":"Show"}</motion.button>
            </div>
            {showTests && (
              <ul className="mt-3 text-sm space-y-2">
                {tests.map((t,i)=> (
                  <li key={i} className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${t.ok?"border-emerald-800 bg-emerald-900/20":"border-rose-800 bg-rose-900/20"}`}>
                    <span>{t.name}</span>
                    <span className="text-xs">{t.ok ? "✅ PASS" : `❌ FAIL — ${t.msg}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">Built for beginners — cute mafia vibes, cold math inside. 🍝🃏</footer>
      </div>

      {/* Mini‑game modal */}
      <AnimatePresence>
        {showMini && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="max-w-3xl w-full rounded-2xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="text-lg font-bold">Pop Quiz: Take the gun or the cannoli?</div>
                <button onClick={()=>setShowMini(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>
              <div className="p-4 grid sm:grid-cols-2 gap-4">
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black/30">
                  <img src={GUN_IMG} alt="Revolver" className="w-full h-52 object-contain bg-black"/>
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Take the Gun</div>
                      <div className="text-xs text-slate-400">Public domain image (Wikimedia)</div>
                    </div>
                    <motion.button whileTap={{ scale: 0.98 }} onClick={()=>{ setMiniPick("gun"); setShowMini(false); }} className="rounded-xl border border-slate-700 bg-black/20 px-3 py-1.5 text-sm font-semibold">Pick</motion.button>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black/30">
                  <img src={CANNOLI_IMG} alt="Cannoli" className="w-full h-52 object-cover"/>
                  <div className="p-3 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">Take the Cannoli</div>
                      <div className="text-xs text-slate-400">CC BY‑SA image (Wikimedia)</div>
                    </div>
                    <motion.button whileTap={{ scale: 0.98 }} onClick={()=>{ setMiniPick("cannoli"); setShowMini(false); }} className="rounded-xl border border-slate-700 bg-black/20 px-3 py-1.5 text-sm font-semibold">Pick</motion.button>
                  </div>
                </div>
              </div>
              {miniPick && (
                <div className="px-4 pb-4 text-xs text-slate-400">You picked: {miniPick === 'gun' ? '🔫 gun' : '🍰 cannoli'}</div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
