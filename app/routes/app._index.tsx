import {useEffect, useMemo, useRef, useState} from "react";
import type {LoaderFunctionArgs, HeadersFunction} from "react-router";
import {useAppBridge} from "@shopify/app-bridge-react";
import {authenticate} from "../shopify.server";
import {boundary} from "@shopify/shopify-app-react-router/server";

// Recharts
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Brush,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from "recharts";

export const loader = async ({request}: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type RangeKey = 7 | 14 | 30;

type DayPoint = {
  dateISO: string;
  label: string;
  hitRate: number; // %
  upsellRevenue: number; // $
  totalOrders: number;
  upsellOrders: number;
  recShown: number;
  recAccepted: number;
};

type ProductRow = {
  name: string;
  acceptRate: number; // %
  revenue: number; // $
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatCompactMoney(n: number) {
  return n.toLocaleString(undefined, {notation: "compact", maximumFractionDigits: 1});
}

function formatCompactInt(n: number) {
  return n.toLocaleString(undefined, {notation: "compact"});
}

/**
 * Generate demo daily analytics for N days.
 * Tuned to "feel" like a real store: weekday/weekend swings, gentle trends, correlated metrics.
 */
function generateDemoDaily(days: number, seedBias = 0): DayPoint[] {
  const today = new Date();
  const out: DayPoint[] = [];

  // Base levels
  let hit = 10 + Math.random() * 12 + seedBias; // %
  let rev = 40 + Math.random() * 80 + seedBias * 3; // $
  let orderBase = 22 + Math.random() * 16;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);

    const dayOfWeek = d.getDay(); // 0 Sun ... 6 Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Orders: weekends slightly higher
    const orderWiggle = (Math.random() * 2 - 1) * 6;
    const weekendBoost = isWeekend ? 8 : 0;
    const totalOrders = Math.max(6, Math.round(orderBase + weekendBoost + orderWiggle));

    // Hit-rate: bouncy but reasonable
    const hitDelta = (Math.random() * 2 - 1) * 2.2 + (isWeekend ? 0.7 : -0.2);
    hit = clamp(hit + hitDelta, 1.5, 35);

    const upsellOrders = Math.round((hit / 100) * totalOrders);

    // Revenue correlates with upsellOrders + volatility
    const revDelta = (Math.random() * 2 - 1) * 20 + upsellOrders * (6 + Math.random() * 6);
    rev = clamp(rev * 0.82 + revDelta * 0.55 + 30, 0, 400);

    // Funnel-ish counts
    const recShown = Math.max(totalOrders * 2, Math.round(totalOrders * (2.5 + Math.random() * 1.2)));
    const recAccepted = Math.min(recShown, Math.max(0, Math.round(upsellOrders * (1.0 + Math.random() * 0.6))));

    const label = d.toLocaleDateString(undefined, {month: "short", day: "numeric"});
    const dateISO = d.toISOString().slice(0, 10);

    out.push({
      dateISO,
      label,
      hitRate: round1(hit),
      upsellRevenue: Math.round(rev * 100) / 100,
      totalOrders,
      upsellOrders,
      recShown,
      recAccepted,
    });
  }

  return out;
}

function sum(points: DayPoint[], key: keyof DayPoint) {
  return points.reduce((acc, p) => acc + (p[key] as number), 0);
}

function avg(points: DayPoint[], key: keyof DayPoint) {
  return points.length ? sum(points, key) / points.length : 0;
}

function pctDelta(current: number, prev: number) {
  if (!isFinite(prev) || prev === 0) return current === 0 ? 0 : 100;
  return ((current - prev) / prev) * 100;
}

function TrendPill({
  deltaPct,
  label,
}: {
  deltaPct: number;
  label: string;
}) {
  const up = deltaPct >= 0;
  const text = `${up ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}% ${label}`;
  return (
    <span className={`pill ${up ? "pillUp" : "pillDown"}`}>
      {text}
    </span>
  );
}

function AnimatedNumber({
  value,
  format = (n) => String(n),
  durationMs = 650,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
}) {
  const [shown, setShown] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;

    const start = performance.now();
    let raf = 0;

    const tick = (t: number) => {
      const p = clamp((t - start) / durationMs, 0, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span>{format(shown)}</span>;
}

function ChartShell({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="cardHead">
        <div>
          <div className="cardTitle">{title}</div>
          {subtitle ? <div className="cardSub">{subtitle}</div> : null}
        </div>
        {right ? <div className="cardRight">{right}</div> : null}
      </div>
      <div className="cardBody">{children}</div>
    </div>
  );
}

function FancyTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (name: string, value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="tooltip">
      <div className="tooltipTitle">{label}</div>
      <div className="tooltipRows">
        {payload
          .filter((p) => p?.value != null && p?.name)
          .map((p, idx) => (
            <div key={idx} className="tooltipRow">
              <span className="tooltipDot" style={{background: p.color}} />
              <span className="tooltipName">{p.name}</span>
              <span className="tooltipVal">
                {formatter ? formatter(p.name, p.value) : String(p.value)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function Index() {
  const shopify = useAppBridge();

  const [range, setRange] = useState<RangeKey>(14);
  const [showBrush, setShowBrush] = useState(true);

  // Generate demo data (current + previous period for deltas)
  const {current, previous, products} = useMemo(() => {
    const cur = generateDemoDaily(range, 0);
    const prev = generateDemoDaily(range, -1.2);

    const prod: ProductRow[] = [
      {name: "Thermal Gloves", acceptRate: 18 + Math.random() * 10, revenue: 120 + Math.random() * 240},
      {name: "Ski Wax Kit", acceptRate: 12 + Math.random() * 14, revenue: 80 + Math.random() * 180},
      {name: "Helmet Liner", acceptRate: 8 + Math.random() * 12, revenue: 45 + Math.random() * 140},
      {name: "Hand Warmers", acceptRate: 14 + Math.random() * 10, revenue: 35 + Math.random() * 120},
      {name: "Goggle Cleaner", acceptRate: 6 + Math.random() * 10, revenue: 20 + Math.random() * 80},
    ]
      .map((p) => ({...p, acceptRate: round1(p.acceptRate), revenue: Math.round(p.revenue * 100) / 100}))
      .sort((a, b) => b.revenue - a.revenue);

    return {current: cur, previous: prev, products: prod};
  }, [range]);

  // KPIs
  const avgHit = avg(current, "hitRate");
  const avgHitPrev = avg(previous, "hitRate");
  const hitDelta = pctDelta(avgHit, avgHitPrev);

  const upsellRevenue = sum(current, "upsellRevenue");
  const upsellRevenuePrev = sum(previous, "upsellRevenue");
  const revDelta = pctDelta(upsellRevenue, upsellRevenuePrev);

  const upsellOrders = sum(current, "upsellOrders");
  const upsellOrdersPrev = sum(previous, "upsellOrders");
  const upsellOrdersDelta = pctDelta(upsellOrders, upsellOrdersPrev);

  // Derived "share of store revenue" demo
  const totalStoreRevenue = upsellRevenue / 0.18;
  const upsellShare = (upsellRevenue / totalStoreRevenue) * 100;

  const latest = current[current.length - 1];

  // Funnel totals
  const recShown = sum(current, "recShown");
  const recAccepted = sum(current, "recAccepted");
  const funnelData = [
    {stage: "Shown", value: recShown},
    {stage: "Accepted", value: recAccepted},
    {stage: "Purchased", value: upsellOrders},
  ];

  // Day-of-week breakdown
  const dow = useMemo(() => {
    const map = new Map<number, {name: string; hit: number[]; rev: number[]}>();
    for (const p of current) {
      const d = new Date(p.dateISO);
      const k = d.getDay();
      const name = d.toLocaleDateString(undefined, {weekday: "short"});
      if (!map.has(k)) map.set(k, {name, hit: [], rev: []});
      map.get(k)!.hit.push(p.hitRate);
      map.get(k)!.rev.push(p.upsellRevenue);
    }

    // Sort Mon..Sun (1..0)
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order
      .filter((k) => map.has(k))
      .map((k) => {
        const v = map.get(k)!;
        const hitAvg = v.hit.reduce((a, b) => a + b, 0) / v.hit.length;
        const revAvg = v.rev.reduce((a, b) => a + b, 0) / v.rev.length;
        return {day: v.name, "Hit-rate (%)": round1(hitAvg), "Avg revenue ($)": Math.round(revAvg * 100) / 100};
      });
  }, [current]);

  const handleRefresh = () => {
    shopify.toast.show("Data refreshed ✨");
  };

  const onPointClick = (payload?: any) => {
    const p: DayPoint | undefined = payload?.activePayload?.[0]?.payload;
    if (!p) return;
    shopify.toast.show(`${p.label}: ${p.hitRate.toFixed(1)}% hit-rate • $${formatMoney(p.upsellRevenue)} upsell`);
  };

  useEffect(() => {
    // Optional: one-time hint
    // shopify.toast.show("POSAI analytics is using demo data");
  }, [shopify]);

  return (
    <s-page heading="POSAI analytics overview">
      <s-button slot="primary-action" onClick={handleRefresh}>
        Refresh stats
      </s-button>

      {/* Local styles (keeps this file self-contained) */}
      <style>{`
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin: 6px 0 14px;
          flex-wrap: wrap;
        }
        .rangePills {
          display: inline-flex;
          gap: 8px;
          padding: 6px;
          border-radius: 999px;
          background: linear-gradient(135deg, rgba(94,155,241,0.16), rgba(26,81,156,0.10));
          border: 1px solid rgba(148,163,184,0.28);
        }
        .pillBtn {
          border: 0;
          cursor: pointer;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 600;
          font-size: 12px;
          background: rgba(255,255,255,0.65);
          color: rgba(20,31,43,0.90);
          transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
        }
        .pillBtn:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,0,0,0.08); }
        .pillBtnActive {
          background: linear-gradient(135deg, rgba(94,155,241,0.95), rgba(26,81,156,0.95));
          color: #fff;
          box-shadow: 0 10px 22px rgba(26,81,156,0.25);
        }
        .toggleLine {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          user-select: none;
          font-size: 12px;
          color: rgba(20,31,43,0.75);
          font-weight: 600;
        }
        .switch {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: rgba(148,163,184,0.35);
          position: relative;
          border: 1px solid rgba(148,163,184,0.45);
          cursor: pointer;
          transition: background 140ms ease;
        }
        .switchOn { background: rgba(94,155,241,0.35); }
        .knob {
          width: 20px;
          height: 20px;
          border-radius: 999px;
          background: #fff;
          position: absolute;
          top: 1px;
          left: 1px;
          box-shadow: 0 6px 16px rgba(0,0,0,0.12);
          transition: transform 140ms ease;
        }
        .knobOn { transform: translateX(20px); }

        .kpiGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 960px) {
          .kpiGrid { grid-template-columns: 1fr; }
        }

        .kpi {
          border-radius: 16px;
          border: 1px solid rgba(148,163,184,0.25);
          overflow: hidden;
          position: relative;
          padding: 14px;
          box-shadow: 0 12px 26px rgba(0,0,0,0.07);
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .kpi:hover { transform: translateY(-2px); box-shadow: 0 18px 38px rgba(0,0,0,0.10); }
        .kpiGlow {
          position: absolute;
          inset: -40px;
          background: radial-gradient(circle at 20% 20%, rgba(94,155,241,0.35), transparent 50%),
                      radial-gradient(circle at 80% 30%, rgba(26,81,156,0.28), transparent 45%),
                      radial-gradient(circle at 70% 80%, rgba(99,102,241,0.20), transparent 55%);
          filter: blur(14px);
          opacity: 0.85;
          pointer-events: none;
        }
        .kpiRow {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          position: relative;
        }
        .kpiLabel {
          font-size: 12px;
          font-weight: 700;
          color: rgba(20,31,43,0.72);
          letter-spacing: 0.2px;
        }
        .kpiValue {
          font-size: 28px;
          font-weight: 800;
          color: rgba(10,20,32,0.95);
          line-height: 1.1;
          margin-top: 6px;
        }
        .kpiSub {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(20,31,43,0.65);
          font-weight: 600;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          border: 1px solid rgba(148,163,184,0.25);
          background: rgba(255,255,255,0.72);
        }
        .pillUp { color: rgba(16, 104, 62, 0.95); }
        .pillDown { color: rgba(159, 18, 57, 0.95); }

        .grid2 {
          display: grid;
          grid-template-columns: 1.45fr 1fr;
          gap: 12px;
        }
        @media (max-width: 1100px) {
          .grid2 { grid-template-columns: 1fr; }
        }

        .card {
          border-radius: 18px;
          border: 1px solid rgba(148,163,184,0.25);
          background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.72));
          box-shadow: 0 14px 34px rgba(0,0,0,0.08);
          overflow: hidden;
        }
        .cardHead {
          padding: 14px 14px 10px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }
        .cardTitle {
          font-size: 14px;
          font-weight: 900;
          color: rgba(10,20,32,0.92);
        }
        .cardSub {
          margin-top: 4px;
          font-size: 12px;
          color: rgba(20,31,43,0.62);
          font-weight: 600;
        }
        .cardRight { display: flex; gap: 8px; align-items: center; }
        .cardBody { padding: 0 14px 14px; }

        .chartBox {
          height: 280px;
          width: 100%;
          min-width: 0;
        }

        .tooltip {
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 18px 44px rgba(0,0,0,0.12);
          padding: 10px 10px 8px;
          min-width: 180px;
        }
        .tooltipTitle { font-weight: 900; font-size: 12px; color: rgba(10,20,32,0.92); margin-bottom: 6px; }
        .tooltipRows { display: grid; gap: 6px; }
        .tooltipRow { display: grid; grid-template-columns: 10px 1fr auto; gap: 8px; align-items: center; }
        .tooltipDot { width: 8px; height: 8px; border-radius: 999px; }
        .tooltipName { font-size: 12px; color: rgba(20,31,43,0.72); font-weight: 700; }
        .tooltipVal { font-size: 12px; color: rgba(10,20,32,0.92); font-weight: 900; }

        .miniList {
          display: grid;
          gap: 10px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(255,255,255,0.7);
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .row:hover { transform: translateY(-1px); box-shadow: 0 12px 26px rgba(0,0,0,0.08); }
        .rowLeft { display: grid; gap: 2px; }
        .rowName { font-weight: 900; font-size: 12px; color: rgba(10,20,32,0.92); }
        .rowSub { font-weight: 700; font-size: 11px; color: rgba(20,31,43,0.62); }
        .rowRight { text-align: right; }
        .rowVal { font-weight: 900; font-size: 12px; color: rgba(10,20,32,0.92); }
      `}</style>

      {/* Controls */}
      <s-section>
        <div className="toolbar">
          <div className="rangePills" role="tablist" aria-label="Date range">
            {[7, 14, 30].map((r) => (
              <button
                key={r}
                className={`pillBtn ${range === r ? "pillBtnActive" : ""}`}
                onClick={() => setRange(r as RangeKey)}
                role="tab"
                aria-selected={range === r}
              >
                Last {r}d
              </button>
            ))}
          </div>

          <div className="toggleLine">
            <span>Zoom brush</span>
            <div
              className={`switch ${showBrush ? "switchOn" : ""}`}
              onClick={() => setShowBrush((v) => !v)}
              role="switch"
              aria-checked={showBrush}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setShowBrush((v) => !v);
              }}
              title="Toggle zoom brush"
            >
              <div className={`knob ${showBrush ? "knobOn" : ""}`} />
            </div>
          </div>
        </div>
      </s-section>

      {/* KPI cards */}
      <s-section heading="Performance snapshot">
        <div className="kpiGrid">
          <div className="kpi" style={{background: "linear-gradient(135deg, rgba(94,155,241,0.22), rgba(255,255,255,0.78))"}}>
            <div className="kpiGlow" />
            <div className="kpiRow">
              <div>
                <div className="kpiLabel">Avg. recommendation hit-rate</div>
                <div className="kpiValue">
                  <AnimatedNumber value={avgHit} format={(n) => `${n.toFixed(1)}%`} />
                </div>
                <div className="kpiSub">Accepted ≥1 recommended product</div>
              </div>
              <TrendPill deltaPct={hitDelta} label="vs prev" />
            </div>
          </div>

          <div className="kpi" style={{background: "linear-gradient(135deg, rgba(26,81,156,0.18), rgba(255,255,255,0.78))"}}>
            <div className="kpiGlow" />
            <div className="kpiRow">
              <div>
                <div className="kpiLabel">Upsell revenue</div>
                <div className="kpiValue">
                  $
                  <AnimatedNumber value={upsellRevenue} format={(n) => formatMoney(n)} />
                </div>
                <div className="kpiSub">~{upsellShare.toFixed(1)}% of store revenue</div>
              </div>
              <TrendPill deltaPct={revDelta} label="vs prev" />
            </div>
          </div>

          <div className="kpi" style={{background: "linear-gradient(135deg, rgba(99,102,241,0.16), rgba(255,255,255,0.78))"}}>
            <div className="kpiGlow" />
            <div className="kpiRow">
              <div>
                <div className="kpiLabel">Orders with ≥1 upsell</div>
                <div className="kpiValue">
                  <AnimatedNumber value={upsellOrders} format={(n) => Math.round(n).toLocaleString()} />
                </div>
                <div className="kpiSub">
                  Today: {latest?.upsellOrders ?? 0}/{latest?.totalOrders ?? 0} orders
                </div>
              </div>
              <TrendPill deltaPct={upsellOrdersDelta} label="vs prev" />
            </div>
          </div>
        </div>
      </s-section>

      {/* Main charts */}
      <s-section heading="Overview">
        <div className="grid2">
          {/* Hit-rate chart */}
          <ChartShell
            title="Recommendation hit-rate over time"
            subtitle="Click a point to drill down (toast). Brush to zoom."
            right={
              <span className="pill">
                Latest: {latest ? `${latest.hitRate.toFixed(1)}%` : "—"}
              </span>
            }
          >
            <div className="chartBox" onClick={(e) => e.stopPropagation()}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={current} margin={{top: 10, right: 14, left: 0, bottom: 0}} onClick={onPointClick}>
                  <defs>
                    <linearGradient id="gradHit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(94,155,241,0.70)" />
                      <stop offset="70%" stopColor="rgba(94,155,241,0.08)" />
                      <stop offset="100%" stopColor="rgba(94,155,241,0.00)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                  <XAxis dataKey="label" tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} domain={[0, (max: number) => Math.ceil(max + 5)]} />
                  <Tooltip
                    content={
                      <FancyTooltip
                        formatter={(name, value) =>
                          name.includes("hit") ? `${value.toFixed(1)}%` : String(value)
                        }
                      />
                    }
                  />
                  <ReferenceLine y={avgHit} stroke="rgba(26,81,156,0.55)" strokeDasharray="6 6" />
                  <Area
                    type="monotone"
                    dataKey="hitRate"
                    name="Hit-rate"
                    stroke="rgba(26,81,156,0.95)"
                    fill="url(#gradHit)"
                    strokeWidth={2.6}
                    dot={{r: 3.3}}
                    activeDot={{r: 6}}
                    isAnimationActive
                  />
                  {showBrush ? (
                    <Brush
                      dataKey="label"
                      height={26}
                      travellerWidth={12}
                      stroke="rgba(26,81,156,0.65)"
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          {/* Donut share */}
          <ChartShell
            title="Revenue share"
            subtitle="Upsell vs non-upsell store revenue estimate."
            right={<span className="pill">Store: ${formatCompactMoney(totalStoreRevenue)}</span>}
          >
            <div style={{height: 280, width: "100%", minWidth: 0}}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={
                      <FancyTooltip
                        formatter={(name, value) => `$${formatMoney(value)}`}
                      />
                    }
                  />
                  <Legend verticalAlign="bottom" height={32} />
                  <Pie
                    data={[
                      {name: "POSAI upsell", value: upsellRevenue},
                      {name: "Other revenue", value: Math.max(0, totalStoreRevenue - upsellRevenue)},
                    ]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="85%"
                    paddingAngle={3}
                    cornerRadius={10}
                    isAnimationActive
                  >
                    <Cell fill="rgba(94,155,241,0.95)" />
                    <Cell fill="rgba(148,163,184,0.55)" />
                  </Pie>

                  {/* Center label (simple overlay) */}
                  <text
                    x="50%"
                    y="46%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{fontWeight: 900, fontSize: 18, fill: "rgba(10,20,32,0.92)"}}
                  >
                    {upsellShare.toFixed(0)}%
                  </text>
                  <text
                    x="50%"
                    y="56%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{fontWeight: 700, fontSize: 12, fill: "rgba(20,31,43,0.62)"}}
                  >
                    POSAI share
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>
        </div>

        <div style={{height: 12}} />

        <div className="grid2">
          {/* Revenue chart */}
          <ChartShell
            title="Upsell revenue over time"
            subtitle="Hover for details. Click to drill down."
            right={<span className="pill">Total: ${formatCompactMoney(upsellRevenue)}</span>}
          >
            <div className="chartBox">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={current} margin={{top: 10, right: 14, left: 0, bottom: 0}} onClick={onPointClick}>
                  <defs>
                    <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(26,81,156,0.65)" />
                      <stop offset="70%" stopColor="rgba(26,81,156,0.08)" />
                      <stop offset="100%" stopColor="rgba(26,81,156,0.00)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                  <XAxis dataKey="label" tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    content={
                      <FancyTooltip
                        formatter={(name, value) => (name.includes("Revenue") ? `$${formatMoney(value)}` : String(value))}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="upsellRevenue"
                    name="Upsell Revenue"
                    stroke="rgba(94,155,241,0.98)"
                    fill="url(#gradRev)"
                    strokeWidth={2.6}
                    dot={{r: 3.3}}
                    activeDot={{r: 6}}
                    isAnimationActive
                  />
                  {showBrush ? (
                    <Brush dataKey="label" height={26} travellerWidth={12} stroke="rgba(94,155,241,0.7)" />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          {/* Funnel */}
          <ChartShell
            title="Recommendation funnel"
            subtitle="How recommendations move from shown → accepted → purchased."
            right={<span className="pill">Accepted: {formatCompactInt(recAccepted)}</span>}
          >
            <div style={{height: 280, width: "100%", minWidth: 0}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} margin={{top: 10, right: 14, left: 0, bottom: 0}}>
                  <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                  <XAxis dataKey="stage" tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} tickFormatter={(v) => formatCompactInt(v)} />
                  <Tooltip
                    content={<FancyTooltip formatter={(_, v) => v.toLocaleString()} />}
                  />
                  <Bar dataKey="value" name="Count" radius={[10, 10, 10, 10]} isAnimationActive>
                    <Cell fill="rgba(94,155,241,0.92)" />
                    <Cell fill="rgba(26,81,156,0.85)" />
                    <Cell fill="rgba(99,102,241,0.78)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>
        </div>

        <div style={{height: 12}} />

        {/* DOW + Top products */}
        <div className="grid2">
          <ChartShell
            title="Weekday vs weekend patterns"
            subtitle="Averages by day-of-week."
          >
            <div style={{height: 280, width: "100%", minWidth: 0}}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dow} margin={{top: 10, right: 14, left: 0, bottom: 0}}>
                  <CartesianGrid strokeDasharray="4 4" opacity={0.35} />
                  <XAxis dataKey="day" tick={{fontSize: 12}} />
                  <YAxis yAxisId="left" tick={{fontSize: 12}} />
                  <YAxis yAxisId="right" orientation="right" tick={{fontSize: 12}} />
                  <Tooltip
                    content={
                      <FancyTooltip
                        formatter={(name, value) =>
                          name.includes("revenue") ? `$${formatMoney(value)}` : `${value.toFixed(1)}%`
                        }
                      />
                    }
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="Hit-rate (%)" name="Hit-rate (%)" radius={[10, 10, 10, 10]}>
                    {dow.map((_, i) => (
                      <Cell key={i} fill="rgba(94,155,241,0.85)" />
                    ))}
                  </Bar>
                  <Bar yAxisId="right" dataKey="Avg revenue ($)" name="Avg revenue ($)" radius={[10, 10, 10, 10]}>
                    {dow.map((_, i) => (
                      <Cell key={i} fill="rgba(26,81,156,0.75)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartShell>

          <ChartShell
            title="Top recommended products"
            subtitle="Sorted by upsell revenue contribution (demo)."
            right={<span className="pill">Tap to toast</span>}
          >
            <div className="miniList">
              {products.map((p) => (
                <div
                  key={p.name}
                  className="row"
                  onClick={() => shopify.toast.show(`${p.name}: ${p.acceptRate.toFixed(1)}% accept • $${formatMoney(p.revenue)} rev`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      shopify.toast.show(`${p.name}: ${p.acceptRate.toFixed(1)}% accept • $${formatMoney(p.revenue)} rev`);
                    }
                  }}
                >
                  <div className="rowLeft">
                    <div className="rowName">{p.name}</div>
                    <div className="rowSub">Acceptance rate: {p.acceptRate.toFixed(1)}%</div>
                  </div>
                  <div className="rowRight">
                    <div className="rowVal">${formatCompactMoney(p.revenue)}</div>
                    <div className="rowSub">Revenue</div>
                  </div>
                </div>
              ))}
            </div>
          </ChartShell>
        </div>
      </s-section>

      {/* Aside */}
      <s-section slot="aside" heading="How this dashboard works">
        <s-paragraph>
          This page surfaces real metrics
          like hit-rate, upsell revenue, and model freshness.
        </s-paragraph>
        <s-paragraph>
          Interactions: hover tooltips, zoom brush, and click-to-drilldown toasts are implemented
          to mimic a real analytics workflow.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Model health">
        <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
          <s-text color="subdued">Last trained</s-text>
          <s-heading>2 hours ago</s-heading>
          <s-text color="subdued">Orders used</s-text>
          <s-heading>{4200}</s-heading>
          <s-text color="subdued">Data freshness</s-text>
          <s-heading>Good</s-heading>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="New features coming soon:">
        <s-unordered-list>
          <s-list-item>Break down performance by POS location.</s-list-item>
          <s-list-item>Compare weekdays vs weekends.</s-list-item>
          <s-list-item>Show per-staff conversion + coaching tips.</s-list-item>
          <s-list-item>Export a CSV / PDF summary for a date range.</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
