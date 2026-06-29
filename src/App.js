import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ───────── finance helpers ─────────
function monthlyRepayment(p, ratePct, termYears) {
  const r = ratePct / 100 / 12,
    n = termYears * 12;
  if (n === 0) return 0;
  if (r === 0) return p / n;
  return (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}
function loanBalanceAfter(p, ratePct, termYears, ye) {
  const r = ratePct / 100 / 12,
    M = monthlyRepayment(p, ratePct, termYears);
  const m = Math.min(ye * 12, termYears * 12);
  if (r === 0) return Math.max(0, p - M * m);
  return Math.max(
    0,
    p * Math.pow(1 + r, m) - (M * (Math.pow(1 + r, m) - 1)) / r
  );
}
const fmt = (n) => {
  const a = Math.abs(n);
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (a >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
};
const fmtFull = (n) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

// ───────── state stamp-duty schedules (owner-occupier, 2025-26, approximate) ─────────
function prog(v, bk) {
  let t = 0,
    lo = 0;
  for (const [up, r] of bk) {
    if (v > lo) {
      t += (Math.min(v, up) - lo) * r;
      lo = up;
    } else break;
  }
  return t;
}
function dutyStandard(v, s) {
  switch (s) {
    case "NSW":
      return prog(v, [
        [17000, 0.0125],
        [36000, 0.015],
        [97000, 0.0175],
        [364000, 0.035],
        [1212000, 0.045],
        [3554616, 0.055],
        [Infinity, 0.07],
      ]);
    case "VIC":
      if (v <= 25000) return v * 0.014;
      if (v <= 130000) return 350 + (v - 25000) * 0.024;
      if (v <= 960000) return 2870 + (v - 130000) * 0.06;
      if (v <= 2000000) return v * 0.055;
      return 110000 + (v - 2000000) * 0.065;
    case "QLD": {
      if (v <= 350000) return v * 0.01;
      const g = prog(v, [
        [5000, 0],
        [75000, 0.015],
        [540000, 0.035],
        [1000000, 0.045],
        [Infinity, 0.0575],
      ]);
      return Math.max(0, g - 7175);
    }
    case "WA":
      if (v <= 120000) return v * 0.019;
      if (v <= 150000) return 2280 + (v - 120000) * 0.0285;
      if (v <= 360000) return 3135 + (v - 150000) * 0.038;
      if (v <= 725000) return 11115 + (v - 360000) * 0.0475;
      return 28453 + (v - 725000) * 0.0515;
    case "SA":
      if (v <= 12000) return v * 0.01;
      if (v <= 30000) return 120 + (v - 12000) * 0.02;
      if (v <= 50000) return 480 + (v - 30000) * 0.03;
      if (v <= 100000) return 1080 + (v - 50000) * 0.035;
      if (v <= 200000) return 2830 + (v - 100000) * 0.04;
      if (v <= 250000) return 6830 + (v - 200000) * 0.0425;
      if (v <= 300000) return 8955 + (v - 250000) * 0.0475;
      if (v <= 500000) return 11330 + (v - 300000) * 0.05;
      return 21330 + (v - 500000) * 0.055;
    case "TAS":
      if (v <= 3000) return 50;
      if (v <= 25000) return 50 + (v - 3000) * 0.0175;
      if (v <= 75000) return 435 + (v - 25000) * 0.0225;
      if (v <= 200000) return 1560 + (v - 75000) * 0.035;
      if (v <= 375000) return 5935 + (v - 200000) * 0.04;
      if (v <= 725000) return 12935 + (v - 375000) * 0.0425;
      return 27810 + (v - 725000) * 0.045;
    case "ACT":
      if (v <= 200000) return Math.max(20, v * 0.006);
      if (v <= 300000) return 1200 + (v - 200000) * 0.022;
      if (v <= 500000) return 3400 + (v - 300000) * 0.034;
      if (v <= 750000) return 10200 + (v - 500000) * 0.0432;
      if (v <= 1000000) return 21000 + (v - 750000) * 0.059;
      if (v <= 1455000) return 35750 + (v - 1000000) * 0.064;
      return v * 0.0454;
    case "NT": {
      if (v <= 525000) {
        const V = v / 1000;
        return 0.06571441 * V * V + 15 * V;
      }
      if (v <= 3000000) return v * 0.0495;
      if (v <= 5000000) return v * 0.0575;
      return v * 0.0595;
    }
    default:
      return 0;
  }
}

// ───────── first-home-buyer concessions & grants (approximate) ─────────
const FHB = {
  NSW: {
    exempt: 800000,
    taper: 1000000,
    fhog: 10000,
    fhogNote: "new homes \u2264 $600k ($750k regional)",
  },
  VIC: {
    exempt: 600000,
    taper: 750000,
    fhog: 10000,
    fhogNote: "new homes \u2264 $750k",
  },
  QLD: {
    exempt: 700000,
    taper: 800000,
    fhog: 30000,
    fhogNote: "new homes \u2014 no price cap",
  },
  WA: { exempt: 600000, taper: 800000, fhog: 10000, fhogNote: "new homes" },
  SA: {
    exempt: Infinity,
    taper: Infinity,
    fhog: 15000,
    newOnly: true,
    fhogNote: "new homes",
  },
  TAS: {
    exempt: 750000,
    taper: 750000,
    fhog: 10000,
    cliff: true,
    fhogNote: "new homes",
  },
  ACT: { exempt: 1020000, taper: 1455000, fhog: 0, incomeTested: true },
  NT: {
    exempt: 0,
    taper: 0,
    fhog: 50000,
    noConcession: true,
    fhogNote: "HomeGrown Territory grant, new builds",
  },
};
function fhbDutyPayable(price, entered, fhb, key) {
  if (!fhb || !key || !FHB[key]) return entered;
  const s = FHB[key];
  if (s.noConcession) return entered;
  if (s.newOnly) return 0;
  if (price <= s.exempt) return 0;
  if (s.cliff || price >= s.taper) return entered;
  const c = 1 - (price - s.exempt) / (s.taper - s.exempt);
  return entered * (1 - Math.max(0, Math.min(1, c)));
}
function stateNoteText(key) {
  const s = FHB[key];
  if (!s) return "";
  if (s.noConcession)
    return "NT has no first-home duty concession \u2014 but offers the $50k new-build grant.";
  if (s.newOnly)
    return "SA: full exemption on new homes only (any price). Established homes pay standard duty.";
  if (s.cliff)
    return (
      "TAS: full exemption up to " +
      fmt(s.exempt) +
      " as a hard cliff. Temporary \u2014 was set to end 30 Jun 2026, confirm it still applies."
    );
  if (s.incomeTested)
    return (
      "ACT: exemption up to ~" +
      fmt(s.exempt) +
      ", income-tested. No separate grant."
    );
  return (
    key +
    ": no duty up to " +
    fmt(s.exempt) +
    ", tapering to full duty by " +
    fmt(s.taper) +
    "."
  );
}

// ───────── inputs ─────────
function Money({ label, value, onChange, tip }) {
  return (
    <label className="rb-field">
      <span className="rb-flabel">{label}</span>
      <span className="rb-money">
        <span className="rb-dollar">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value === 0 ? "" : value.toLocaleString("en-AU")}
          placeholder="0"
          onChange={(e) => {
            const n = Number(e.target.value.replace(/[^0-9]/g, ""));
            onChange(Number.isFinite(n) ? n : 0);
          }}
        />
      </span>
      {tip && <span className="rb-tip">{tip}</span>}
    </label>
  );
}
function Pct({ label, value, onChange, min, max, step, tip, suffix = "%" }) {
  return (
    <label className="rb-field">
      <span className="rb-flabel-row">
        <span className="rb-flabel">{label}</span>
        <span className="rb-pct-val">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {tip && <span className="rb-tip">{tip}</span>}
    </label>
  );
}
function Section({ title, children }) {
  return (
    <div className="rb-section">
      <h3 className="rb-stitle">{title}</h3>
      <div className="rb-sgrid">{children}</div>
    </div>
  );
}

export default function RentVsBuy() {
  const [price, setPrice] = useState(750000);
  const [state, setState] = useState("NSW");
  const [depositPct, setDepositPct] = useState(20);
  const [rate, setRate] = useState(6.0);
  const [term, setTerm] = useState(30);
  const [lmi, setLmi] = useState(0);
  const [otherUpfront, setOtherUpfront] = useState(3000);
  const [council, setCouncil] = useState(1800);
  const [water, setWater] = useState(1200);
  const [strata, setStrata] = useState(0);
  const [insurance, setInsurance] = useState(1800);
  const [maintPct, setMaintPct] = useState(1.0);
  const [weeklyRent, setWeeklyRent] = useState(650);
  const [rentGrowth, setRentGrowth] = useState(4);
  const [propType, setPropType] = useState("house");
  const [propGrowth, setPropGrowth] = useState(5.5);
  const [shareReturn, setShareReturn] = useState(9.5);
  const [costInfl, setCostInfl] = useState(3);
  const [horizon, setHorizon] = useState(30);
  const [fhb, setFhb] = useState(false);
  const [applyFhog, setApplyFhog] = useState(false);

  const sim = useMemo(() => {
    const deposit = price * (depositPct / 100);
    const duty = dutyStandard(price, state);
    const dutyPay = fhbDutyPayable(price, duty, fhb, state);
    const grant = fhb && applyFhog && FHB[state] ? FHB[state].fhog : 0;
    const loanAmount = Math.max(0, price - deposit - grant);
    const M = monthlyRepayment(loanAmount, rate, term);
    const annualRent0 = weeklyRent * 52;
    const renterStart = deposit + duty + lmi + otherUpfront;
    const buyerSaving = duty - dutyPay;

    let rport = renterStart,
      bport = buyerSaving;
    const sr = shareReturn / 100,
      data = [];
    for (let y = 1; y <= horizon; y++) {
      const inf = Math.pow(1 + costInfl / 100, y - 1);
      const pv = price * Math.pow(1 + propGrowth / 100, y);
      const maint = pv * (maintPct / 100);
      const ong = (council + water + strata + insurance) * inf + maint;
      const ar = y <= term ? M * 12 : 0;
      const bcost = ar + ong;
      const rentY = annualRent0 * Math.pow(1 + rentGrowth / 100, y - 1);
      const diff = bcost - rentY;
      if (diff > 0) rport += diff;
      else bport += -diff;
      rport *= 1 + sr;
      bport *= 1 + sr;
      const eq = pv - loanBalanceAfter(loanAmount, rate, term, y);
      data.push({
        year: y,
        Buy: Math.round(eq + bport),
        Rent: Math.round(rport),
      });
    }
    const last = data[data.length - 1] || { Buy: 0, Rent: 0 };
    let crossover = null;
    for (let i = 1; i < data.length; i++) {
      const a = data[i - 1].Buy - data[i - 1].Rent,
        b = data[i].Buy - data[i].Rent;
      if (a === 0 || a * b < 0) {
        crossover = data[i].year;
        break;
      }
    }
    return {
      data,
      deposit,
      loanAmount,
      monthly: M,
      duty,
      dutyPay,
      buyerSaving,
      buyNet: last.Buy,
      rentNet: last.Rent,
      gap: last.Buy - last.Rent,
      crossover,
    };
  }, [
    price,
    state,
    depositPct,
    rate,
    term,
    lmi,
    otherUpfront,
    council,
    water,
    strata,
    insurance,
    maintPct,
    weeklyRent,
    rentGrowth,
    propGrowth,
    shareReturn,
    costInfl,
    horizon,
    fhb,
    applyFhog,
  ]);

  const buyAhead = sim.gap >= 0;
  const winColor = buyAhead ? "var(--brick)" : "var(--teal)";

  const TooltipBox = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const b = payload.find((p) => p.dataKey === "Buy"),
      r = payload.find((p) => p.dataKey === "Rent");
    return (
      <div className="rb-tt">
        <div className="rb-tt-yr">Year {label}</div>
        <div style={{ color: "var(--brick)" }}>Buy · {fmtFull(b?.value)}</div>
        <div style={{ color: "var(--teal)" }}>Rent · {fmtFull(r?.value)}</div>
      </div>
    );
  };

  return (
    <div className="rb-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .rb-root{--paper:#F3F4F6;--card:#FFFFFF;--ink:#1A1D23;--muted:#6A7280;--line:#E4E7EB;--brick:#C05A36;--brick-soft:#F6E7E0;--teal:#1E8A9B;--teal-soft:#DBECEE;--display:'Bricolage Grotesque',system-ui,sans-serif;--body:'Inter',system-ui,sans-serif;--mono:'IBM Plex Mono',monospace;background:var(--paper);color:var(--ink);font-family:var(--body);padding:26px 18px 40px;min-height:100%;box-sizing:border-box;line-height:1.45}
        .rb-root *{box-sizing:border-box}
        .rb-wrap{max-width:920px;margin:0 auto}
        .rb-head{margin-bottom:16px}
        .rb-title{font-family:var(--display);font-weight:800;font-size:34px;letter-spacing:-0.02em;line-height:1;margin:0}
        .rb-title .b{color:var(--brick)}.rb-title .r{color:var(--teal)}
        .rb-sub{font-size:13px;color:var(--muted);margin-top:8px;line-height:1.55}
        .rb-chip{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:0.1em;background:var(--ink);color:#fff;padding:4px 9px;border-radius:20px;margin-top:12px}
        .rb-info{background:var(--card);border:0.5px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:14px;font-size:12.5px;color:var(--muted);line-height:1.55}
        .rb-info b{font-weight:600;color:var(--ink)}
        .rb-verdict{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;margin-bottom:14px}
        .rb-verdict-line{font-family:var(--display);font-weight:700;font-size:22px;letter-spacing:-0.01em}
        .rb-verdict-note{font-size:13px;color:var(--muted);margin-top:8px}
        .rb-versus{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}
        .rb-side{border-radius:14px;padding:16px 18px}
        .rb-side.buy{background:var(--brick-soft)}.rb-side.rent{background:var(--teal-soft)}
        .rb-side .lab{font-family:var(--mono);font-size:10px;letter-spacing:0.12em;text-transform:uppercase}
        .rb-side.buy .lab{color:var(--brick)}.rb-side.rent .lab{color:var(--teal)}
        .rb-side .val{font-family:var(--mono);font-weight:600;font-size:26px;margin-top:6px;color:var(--ink)}
        .rb-side .meta{font-size:11px;color:var(--muted);margin-top:4px}
        .rb-chart{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 14px 10px;margin-bottom:14px}
        .rb-chart-top{display:flex;justify-content:space-between;align-items:center;padding:0 6px 10px}
        .rb-chart-title{font-family:var(--mono);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted)}
        .rb-legend{display:flex;gap:14px;font-size:12px}
        .rb-legend span{display:flex;align-items:center;gap:6px}
        .rb-dot{width:10px;height:10px;border-radius:3px}
        .rb-tt{background:var(--ink);color:#fff;border-radius:10px;padding:9px 12px;font-family:var(--mono);font-size:12px;line-height:1.6}
        .rb-tt-yr{color:#fff;opacity:0.6;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px}
        .rb-section{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px 20px;margin-bottom:14px}
        .rb-stitle{font-family:var(--display);font-weight:700;font-size:16px;margin:0 0 16px}
        .rb-sgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}
        .rb-field{display:flex;flex-direction:column}
        .rb-flabel{font-size:13px;font-weight:500}
        .rb-flabel-row{display:flex;justify-content:space-between;align-items:baseline}
        .rb-pct-val{font-family:var(--mono);font-weight:600;font-size:13px;color:var(--ink)}
        .rb-money{display:flex;align-items:center;border:1px solid var(--line);border-radius:10px;padding:0 12px;margin-top:6px;background:#fff}
        .rb-money:focus-within{border-color:var(--ink)}
        .rb-dollar{font-family:var(--mono);color:var(--muted);font-size:14px}
        .rb-money input{border:none;outline:none;font-family:var(--mono);font-size:15px;padding:9px 6px;width:100%;background:transparent;color:var(--ink)}
        .rb-field input[type=range]{width:100%;margin-top:8px;accent-color:var(--ink);height:4px;cursor:pointer}
        .rb-tip{font-size:11.5px;color:var(--muted);margin-top:6px;line-height:1.4}
        .rb-tip.warn{color:var(--brick);font-weight:500}
        .rb-presets{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        .rb-preset{font-family:var(--mono);font-size:10.5px;border:1px solid var(--line);background:#fff;color:var(--muted);border-radius:20px;padding:4px 10px;cursor:pointer}
        .rb-preset:hover{border-color:var(--ink);color:var(--ink)}
        .rb-warn{display:block;margin-top:8px;font-size:11.5px;color:var(--brick);font-weight:500;line-height:1.4}
        .rb-toggle{display:flex;align-items:center;gap:10px}
        .rb-toggle input{width:18px;height:18px;accent-color:var(--teal);cursor:pointer;flex-shrink:0}
        .rb-toggle label{font-size:13px;cursor:pointer}
        .rb-select{margin-top:6px;border:1px solid var(--line);border-radius:10px;padding:9px 10px;font-family:var(--body);font-size:14px;background:#fff;color:var(--ink)}
        .rb-select:focus{outline:none;border-color:var(--ink)}
        .rb-result{margin-top:6px;font-family:var(--mono);font-size:18px;font-weight:600}
        .rb-result em{font-style:normal;font-size:12px;color:var(--teal);margin-left:8px}
        .rb-foot{font-family:var(--mono);font-size:10.5px;color:var(--muted);line-height:1.7;text-align:center;margin-top:14px;padding:0 10px}
        @media (max-width:640px){.rb-sgrid{grid-template-columns:1fr}.rb-versus{grid-template-columns:1fr}.rb-title{font-size:28px}}
        @media (prefers-reduced-motion:reduce){*{transition:none !important}}
      `}</style>

      <div className="rb-wrap">
        <header className="rb-head">
          <h1 className="rb-title">
            <span className="b">Rent</span> vs <span className="r">Buy</span>
          </h1>
          <p className="rb-sub">
            The real cost of buying a home to live in — versus renting and
            investing the difference. The renter puts the deposit, the upfront
            costs, and every dollar saved on holding costs into the share
            market. Pure wealth comparison: home equity vs share portfolio, no
            exit taxes or selling costs on either side.
          </p>
          <span className="rb-chip">
            Australian · owner-occupier · not investment
          </span>
        </header>

        <section className="rb-verdict">
          <div className="rb-verdict-line" style={{ color: winColor }}>
            After {horizon} years, {buyAhead ? "buying" : "renting"} is{" "}
            {fmtFull(Math.abs(sim.gap))} ahead on paper.
          </div>
          <div className="rb-verdict-note">
            {sim.crossover
              ? `The paths cross around year ${sim.crossover}. `
              : ""}
            This lives or dies on two numbers — property growth and share
            growth. Change them and it can flip.
          </div>
          <div className="rb-versus">
            <div className="rb-side buy">
              <div className="lab">Buy · net worth</div>
              <div className="val">{fmtFull(sim.buyNet)}</div>
              <div className="meta">
                Home equity (value − loan), plus any invested surplus
              </div>
            </div>
            <div className="rb-side rent">
              <div className="lab">Rent + invest · net worth</div>
              <div className="val">{fmtFull(sim.rentNet)}</div>
              <div className="meta">Share portfolio value</div>
            </div>
          </div>
        </section>

        <div className="rb-info">
          <b>
            About the defaults — realistic long-term averages, not headline
            numbers.
          </b>
          <br />
          Property is set to capital growth only (your home doesn't pay you
          rent): <b>~5.5% for houses, ~3.75% for units</b>. You'll often see
          6.8%+ quoted, but that figure leans heavily on capital cities,
          cherry-picks the run from market lows to highs, and is inflated by the
          recent boom. Shares default to <b>~9.5%</b> for a broad global index.
          Every number is editable below — change them and the answer moves.
        </div>

        <section className="rb-chart">
          <div className="rb-chart-top">
            <span className="rb-chart-title">
              Net worth over time (paper value)
            </span>
            <div className="rb-legend">
              <span>
                <span
                  className="rb-dot"
                  style={{ background: "var(--brick)" }}
                />{" "}
                Buy
              </span>
              <span>
                <span
                  className="rb-dot"
                  style={{ background: "var(--teal)" }}
                />{" "}
                Rent + invest
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={sim.data}
              margin={{ top: 6, right: 14, left: 6, bottom: 0 }}
            >
              <CartesianGrid stroke="#EDEFF2" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  fill: "#6A7280",
                }}
                tickFormatter={(y) => `Yr ${y}`}
                interval="preserveStartEnd"
                stroke="#E4E7EB"
              />
              <YAxis
                tick={{
                  fontSize: 11,
                  fontFamily: "var(--mono)",
                  fill: "#6A7280",
                }}
                tickFormatter={fmt}
                width={48}
                stroke="#E4E7EB"
              />
              <Tooltip content={<TooltipBox />} />
              <Line
                type="monotone"
                dataKey="Buy"
                stroke="var(--brick)"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Rent"
                stroke="var(--teal)"
                strokeWidth={2.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </section>

        <Section title="The property">
          <Money
            label="Purchase price"
            value={price}
            onChange={setPrice}
            tip="The price you'd pay to buy."
          />
          <label className="rb-field">
            <span className="rb-flabel">State / territory</span>
            <select
              className="rb-select"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {Object.keys(FHB).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <span className="rb-tip">
              Sets the stamp duty automatically. Update council/water/insurance
              to suit the price.
            </span>
          </label>
          <Pct
            label="Deposit"
            value={depositPct}
            onChange={setDepositPct}
            min={5}
            max={50}
            step={1}
            tip={`= ${fmtFull(sim.deposit)}. Under 20% usually triggers LMI.`}
          />
          <Pct
            label="Interest rate"
            value={rate}
            onChange={setRate}
            min={3}
            max={10}
            step={0.1}
            tip={`Loan ${fmtFull(sim.loanAmount)} · repayment ≈ ${fmtFull(
              sim.monthly
            )}/mo.`}
          />
          <Pct
            label="Loan term"
            value={term}
            onChange={setTerm}
            min={10}
            max={30}
            step={1}
            suffix=" yrs"
            tip="Usually 30 years."
          />
        </Section>

        <Section title="Upfront costs (the renter invests these instead)">
          <div className="rb-field">
            <span className="rb-flabel">
              Stamp duty{" "}
              <span
                style={{
                  color: "var(--muted)",
                  fontFamily: "var(--mono)",
                  fontWeight: 500,
                }}
              >
                ({state})
              </span>
            </span>
            <div className="rb-result">{fmtFull(sim.duty)}</div>
            <span className="rb-tip">
              Auto-calculated from your state's transfer duty schedule.
              First-home concessions apply below.
            </span>
          </div>
          <Money
            label="Lenders mortgage insurance (LMI)"
            value={lmi}
            onChange={setLmi}
            tip="Only if deposit under 20%. $0 if 20%+."
          />
          <Money
            label="Other upfront"
            value={otherUpfront}
            onChange={setOtherUpfront}
            tip="Conveyancing, building & pest, loan fees."
          />
        </Section>

        <div className="rb-section">
          <h3 className="rb-stitle">First home buyer</h3>
          <div className="rb-toggle" style={{ marginBottom: fhb ? 16 : 0 }}>
            <input
              id="fhb"
              type="checkbox"
              checked={fhb}
              onChange={(e) => {
                setFhb(e.target.checked);
                if (!e.target.checked) setApplyFhog(false);
              }}
            />
            <label htmlFor="fhb">
              I'm a first home buyer — apply my state's concessions
            </label>
          </div>
          {fhb && (
            <div className="rb-sgrid">
              <div className="rb-field">
                <span className="rb-flabel">Stamp duty after concession</span>
                <div className="rb-result">
                  {fmtFull(sim.dutyPay)}
                  {sim.buyerSaving > 0 && (
                    <em>saved {fmtFull(sim.buyerSaving)}</em>
                  )}
                </div>
                <span className="rb-tip">{stateNoteText(state)}</span>
              </div>
              {FHB[state] && FHB[state].fhog > 0 && (
                <div className="rb-field" style={{ gridColumn: "1 / -1" }}>
                  <div className="rb-toggle">
                    <input
                      id="fhog"
                      type="checkbox"
                      checked={applyFhog}
                      onChange={(e) => setApplyFhog(e.target.checked)}
                    />
                    <label htmlFor="fhog">
                      Put the {state} First Home Owner Grant (
                      {fmtFull(FHB[state].fhog)}) into the purchase
                    </label>
                  </div>
                  <span className="rb-tip">
                    {FHB[state].fhogNote}. Reduces the loan, lifting equity from
                    day one. The renter doesn't get this.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <Section title="Ongoing costs (yearly)">
          <Money
            label="Council rates"
            value={council}
            onChange={setCouncil}
            tip="Your annual council rates notice, or ask the agent."
          />
          <Money
            label="Water rates"
            value={water}
            onChange={setWater}
            tip="Annual water service + usage charges."
          />
          <Money
            label="Strata / body corporate"
            value={strata}
            onChange={setStrata}
            tip="Apartments only. $0 for a freestanding house."
          />
          <Money
            label="Building insurance"
            value={insurance}
            onChange={setInsurance}
            tip="Houses only — strata usually covers the building on units."
          />
          <Pct
            label="Maintenance (% of value / yr)"
            value={maintPct}
            onChange={setMaintPct}
            min={0}
            max={3}
            step={0.1}
            tip={`~1% of value/yr is the rule of thumb. ≈ ${fmtFull(
              price * (maintPct / 100)
            )}/yr now, scaling as the home grows.`}
          />
        </Section>

        <Section title="Renting">
          <Money
            label="Weekly rent"
            value={weeklyRent}
            onChange={setWeeklyRent}
            tip={`= ${fmtFull(weeklyRent * 52)}/yr for an equivalent place.`}
          />
          <Pct
            label="Rent growth"
            value={rentGrowth}
            onChange={setRentGrowth}
            min={0}
            max={8}
            step={0.5}
            tip="Long-run ~ inflation, often 3–4%."
          />
        </Section>

        <Section title="The assumptions that decide it">
          <div className="rb-field">
            <span className="rb-flabel">Property type</span>
            <select
              className="rb-select"
              value={propType}
              onChange={(e) => {
                setPropType(e.target.value);
                setPropGrowth(e.target.value === "house" ? 5.5 : 3.75);
              }}
            >
              <option value="house">House</option>
              <option value="unit">Unit / apartment</option>
            </select>
            <div style={{ marginTop: 10 }}>
              <Pct
                label="Property growth"
                value={propGrowth}
                onChange={setPropGrowth}
                min={0}
                max={12}
                step={0.25}
                tip="Houses ~5.5%, units ~3.75% long-term. Capital growth only — adjust freely."
              />
            </div>
          </div>
          <div className="rb-field">
            <Pct
              label="Share return"
              value={shareReturn}
              onChange={setShareReturn}
              min={0}
              max={18}
              step={0.5}
              tip="Broad global index ~9–11% nominal long-term. Pick the product:"
            />
            <div className="rb-presets">
              <button className="rb-preset" onClick={() => setShareReturn(9.5)}>
                Global index 9.5%
              </button>
              <button
                className="rb-preset"
                onClick={() => setShareReturn(12.5)}
              >
                1.5x Leveraged Global index 12.5%
              </button>
            </div>
            {shareReturn > 11 && (
              <span className="rb-warn">
                ⚠ Higher volatility. Geared returns assume a smooth path the
                market never delivers — expect far deeper drawdowns.
              </span>
            )}
          </div>
          <Pct
            label="Cost inflation"
            value={costInfl}
            onChange={setCostInfl}
            min={0}
            max={6}
            step={0.5}
            tip="How fast council, water & insurance rise each year."
          />
          <Pct
            label="Time horizon"
            value={horizon}
            onChange={setHorizon}
            min={5}
            max={40}
            step={1}
            suffix=" yrs"
            tip="How long before you compare the two positions."
          />
        </Section>

        <div className="rb-foot">
          © mattbakertv 2026 | Estimates only · not financial advice · stamp
          duty &amp; first-home figures are estimates, confirm with your state
          revenue office. Compares paper net worth — home equity (value − loan)
          vs portfolio value — before any exit costs or tax. Assumes a constant
          interest rate and buy-and-hold on both sides.
        </div>
      </div>
    </div>
  );
}
