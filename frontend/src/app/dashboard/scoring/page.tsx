"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { 
  BarChart, 
  TrendingUp, 
  AlertCircle, 
  Award, 
  Target, 
  Activity, 
  Download,
  CheckCircle2,
  RefreshCw,
  Leaf,
  Users,
  Shield,
  ArrowUpRight,
  UploadCloud,
  Info
} from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line, Bubble, Bar } from 'react-chartjs-2';
import { analyticsApi } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      min: 0,
      max: 100,
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
      ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
    },
    x: {
      grid: { display: false },
      ticks: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 11 } }
    }
  },
  plugins: {
    legend: { 
      position: 'top' as const, 
      labels: { 
        color: 'rgba(255,255,255,0.8)',
        boxWidth: 12,
        padding: 16
      } 
    }
  }
};

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    y: {
      min: 0,
      max: 100,
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
      ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } }
    },
    x: {
      grid: { display: false },
      ticks: { color: 'rgba(255, 255, 255, 0.8)', font: { size: 11, weight: 'bold' as const } }
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const label = context.chart?.data?.labels?.[context.dataIndex] || context.label || 'Score';
          return `${label}: ${context.raw} / 100`;
        }
      }
    }
  }
};

const bubbleOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: {
    x: {
      title: { display: true, text: 'Implementation Effort (1 = Easy, 10 = Complex)', color: 'rgba(255,255,255,0.6)' },
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
      ticks: { color: 'rgba(255, 255, 255, 0.6)' },
      min: 0,
      max: 10
    },
    y: {
      title: { display: true, text: 'Expected Score Impact (1 = Minor, 10 = High)', color: 'rgba(255,255,255,0.6)' },
      grid: { color: 'rgba(255, 255, 255, 0.06)' },
      ticks: { color: 'rgba(255, 255, 255, 0.6)' },
      min: 0,
      max: 10
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (context: any) => {
          const raw = context.raw;
          return `${raw.title || `Action`}: Impact ${raw.y}/10, Effort ${raw.x}/10`;
        }
      }
    }
  }
};

export default function ScoringPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"bar" | "line">("bar");

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await analyticsApi.getHistory();
        setData(history);
        if (history && history.scores && history.scores.length > 1) {
          setViewMode("line");
        } else {
          setViewMode("bar");
        }
      } catch (err) {
        console.error("Failed to load score history", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          <p className="text-white/50 text-sm font-medium">Loading score history & roadmap...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-400 bg-red-500/10 rounded-3xl border border-red-500/20 max-w-lg mx-auto mt-12">
        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
        <h3 className="font-bold">Error loading score history</h3>
        <p className="text-xs text-white/50 mt-1">Please ensure the backend service is running.</p>
      </div>
    );
  }

  const handleExportReport = () => {
    const lines = [
      `======================================================`,
      `GRINOVA ESG PERFORMANCE & ROADMAP REPORT`,
      `Generated: ${new Date().toLocaleString()}`,
      `======================================================`,
      ``,
      `OVERALL SCORE: ${data.current_score.toFixed(1)} / 100`,
      `INDUSTRY BENCHMARK: ${data.industry_benchmark.toFixed(1)} / 100`,
      `DIFFERENCE: ${data.current_score >= data.industry_benchmark ? "+" : ""}${(data.current_score - data.industry_benchmark).toFixed(1)} points`,
      ``,
      `SCORE TRAJECTORY:`,
      ...data.labels.map((l: string, i: number) => `  - ${l}: Overall ${data.scores[i]} | Env: ${data.env_scores[i] || "N/A"} | Soc: ${data.soc_scores[i] || "N/A"} | Gov: ${data.gov_scores[i] || "N/A"}`),
      ``,
      `RECOMMENDED IMPROVEMENT ACTIONS:`,
      ...(data.action_plans || []).map((p: any, idx: number) => 
        `  ${idx + 1}. ${p.title} (Impact: ${p.impact}/10 | Effort: ${p.effort}/10)\n     ${p.description}`
      ),
      ``,
      `FINDINGS & AUDIT TRAIL:`,
      ...(data.timeline || []).map((t: any) => `  - [${t.date}] ${t.title}: ${t.description}`),
      ``,
      `======================================================`
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Grinova_ESG_Summary_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const latestEnv = (data.env_scores || []).slice(-1)[0] || 0;
  const latestSoc = (data.soc_scores || []).slice(-1)[0] || 0;
  const latestGov = (data.gov_scores || []).slice(-1)[0] || 0;
  const latestOverall = data.current_score || 0;
  const benchmark = data.industry_benchmark || 65;

  const barData = {
    labels: ['Environmental (E)', 'Social (S)', 'Governance (G)', 'Overall Score', 'Industry Benchmark'],
    datasets: [
      {
        label: 'Score',
        data: [latestEnv, latestSoc, latestGov, latestOverall, benchmark],
        backgroundColor: [
          'rgba(16, 185, 129, 0.75)',  // Environmental (emerald)
          'rgba(245, 158, 11, 0.75)',  // Social (amber)
          'rgba(168, 85, 247, 0.75)',  // Governance (purple)
          'rgba(59, 130, 246, 0.85)',  // Overall (blue)
          'rgba(255, 255, 255, 0.25)', // Benchmark (white/gray)
        ],
        borderColor: [
          'rgba(16, 185, 129, 1)',
          'rgba(245, 158, 11, 1)',
          'rgba(168, 85, 247, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(255, 255, 255, 0.5)',
        ],
        borderWidth: 1.5,
        borderRadius: 10,
      }
    ]
  };

  const lineData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Overall ESG Score',
        data: data.scores,
        borderColor: 'rgba(59, 130, 246, 1)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.3,
        borderWidth: 3,
        pointRadius: 6,
        pointHoverRadius: 8,
      },
      {
        label: 'Environmental (E)',
        data: data.env_scores,
        borderColor: 'rgba(16, 185, 129, 1)',
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        tension: 0.3,
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Social (S)',
        data: data.soc_scores,
        borderColor: 'rgba(245, 158, 11, 1)',
        backgroundColor: 'rgba(245, 158, 11, 0.5)',
        tension: 0.3,
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
      {
        label: 'Governance (G)',
        data: data.gov_scores,
        borderColor: 'rgba(168, 85, 247, 1)',
        backgroundColor: 'rgba(168, 85, 247, 0.5)',
        tension: 0.3,
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }
    ]
  };

  const PLAN_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgba(59, 130, 246, 1)', text: 'text-blue-400', badge: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
    { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgba(16, 185, 129, 1)', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' },
    { bg: 'rgba(168, 85, 247, 0.75)', border: 'rgba(168, 85, 247, 1)', text: 'text-purple-400', badge: 'bg-purple-500/10 border-purple-500/20 text-purple-300' },
    { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgba(245, 158, 11, 1)', text: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
  ];

  const bubbleData = {
    datasets: (data.action_plans || []).map((plan: any, i: number) => ({
      label: `Action #${i + 1}: ${plan.title}`,
      data: [{
        x: plan.effort,
        y: plan.impact,
        r: Math.max(14, plan.impact * 2.4),
        title: plan.title,
        effort: plan.effort,
        impact: plan.impact,
      }],
      backgroundColor: PLAN_COLORS[i % PLAN_COLORS.length].bg,
      borderColor: PLAN_COLORS[i % PLAN_COLORS.length].border,
      borderWidth: 2,
    }))
  };

  const hasScores = data.scores && data.scores.length > 0 && data.current_score > 0;
  const lastTwo = (data.scores || []).slice(-2);
  const scoreTrend = hasScores && lastTwo.length === 2
    ? `${lastTwo[1] - lastTwo[0] >= 0 ? "+" : ""}${(lastTwo[1] - lastTwo[0]).toFixed(1)} pts`
    : (hasScores ? "Current baseline" : "Awaiting Reports");

  const benchmarkDiff = (data.current_score - data.industry_benchmark).toFixed(1);
  const benchmarkIsHigher = data.current_score >= data.industry_benchmark;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scores & Improvement Roadmap</h1>
          <p className="text-white/50 mt-1 text-sm font-medium">
            Understand your Environmental, Social, and Governance ratings with clear steps to improve.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/data"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition-all shadow-md shadow-blue-500/20"
          >
            Upload Reports
          </Link>
          {hasScores && (
            <button
              onClick={handleExportReport}
              className="px-4 py-2.5 rounded-xl bg-purple-600 text-xs font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-500/20 flex items-center gap-2 text-white"
            >
              <Download className="w-4 h-4" />
              Export Summary
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Award className="w-5 h-5" />
            </div>
            <div className="text-[11px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
              {scoreTrend}
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Current Overall Score</div>
          <div className="text-4xl font-bold text-white">{data.current_score.toFixed(1)} <span className="text-sm font-normal text-white/40">/ 100</span></div>
          <p className="text-[11px] text-white/40 mt-2">Combined average of your Environmental, Social, and Governance disclosures.</p>
        </div>

        <div className="glass p-6 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <BarChart className="w-5 h-5" />
            </div>
            <div className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
              hasScores && benchmarkIsHigher ? "text-emerald-400 bg-emerald-400/10" : "text-amber-400 bg-amber-400/10"
            }`}>
              {hasScores ? (benchmarkIsHigher ? `+${benchmarkDiff} pts above avg` : `${benchmarkDiff} pts below avg`) : "Target Level"}
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Industry Benchmark</div>
          <div className="text-4xl font-bold text-white">{data.industry_benchmark.toFixed(1)} <span className="text-sm font-normal text-white/40">/ 100</span></div>
          <p className="text-[11px] text-white/40 mt-2">
            {hasScores 
              ? (benchmarkIsHigher ? "Your company outperforms the industry average for your sector." : "Room for growth to meet industry standard disclosure levels.")
              : "Standard expected disclosure level for organizations in your industry."}
          </p>
        </div>

        <div className="glass p-6 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
            <div className="text-[11px] font-bold text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-full uppercase tracking-wider">
              {data.action_plans?.length || 0} Recommended
            </div>
          </div>
          <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-1">Action Priorities</div>
          <div className="text-4xl font-bold text-white">{data.action_plans?.length || 0} <span className="text-sm font-normal text-white/40">Steps</span></div>
          <p className="text-[11px] text-white/40 mt-2">Targeted recommendations identified by AI to improve your disclosure scores.</p>
        </div>
      </div>

      {/* Pillar Breakdown Guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Leaf className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-emerald-300 block mb-0.5">Environmental (E)</span>
            <span className="text-white/50 leading-relaxed">Emissions (Scope 1/2/3), energy consumption, renewable power, water usage & waste.</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/15 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
            <Users className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-amber-300 block mb-0.5">Social (S)</span>
            <span className="text-white/50 leading-relaxed">Workforce safety, labor standards, gender diversity, employee training & community support.</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/15 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
            <Shield className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <span className="font-bold text-purple-300 block mb-0.5">Governance (G)</span>
            <span className="text-white/50 leading-relaxed">Board independence, executive ethics, anti-corruption policies, compliance & risk controls.</span>
          </div>
        </div>
      </div>

      {/* Trajectory Chart & Matrix */}
      {!hasScores ? (
        <div className="glass p-10 sm:p-12 rounded-3xl border border-white/5 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
            <TrendingUp className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white">No Score History Recorded Yet</h3>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Upload your company's first sustainability report in Documents & Upload. 
            Grinova's multi-agent AI will evaluate your disclosures across Environmental, Social, and Governance pillars and plot your historical trajectory.
          </p>
          <div className="pt-2">
            <Link
              href="/dashboard/data"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition-all"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Report to Begin
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass p-8 rounded-3xl border border-white/5 flex flex-col justify-between">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-500" />
                  {viewMode === "bar" ? "Pillar Performance Breakdown" : "Score Trajectory Over Time"}
                </h3>
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
                  <button
                    onClick={() => setViewMode("bar")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "bar" ? "bg-blue-600 text-white shadow" : "text-white/60 hover:text-white"
                    }`}
                  >
                    Pillar Breakdown
                  </button>
                  <button
                    onClick={() => setViewMode("line")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "line" ? "bg-blue-600 text-white shadow" : "text-white/60 hover:text-white"
                    }`}
                  >
                    Trajectory Over Time
                  </button>
                </div>
              </div>
              <p className="text-xs text-white/40 mb-4">
                {viewMode === "bar"
                  ? "Direct breakdown of Environmental (E), Social (S), Governance (G), Overall score, and Industry Benchmark based on your report."
                  : "Historical progression across your uploaded sustainability reports over time."}
              </p>
            </div>

            <div className="h-[340px] w-full">
              {viewMode === "bar" ? (
                <Bar data={barData} options={barOptions} />
              ) : (
                <Line data={lineData} options={lineOptions} />
              )}
            </div>

            {viewMode === "line" && data.scores?.length === 1 && (
              <div className="mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 flex items-center gap-2">
                <Info className="w-4 h-4 flex-shrink-0" />
                <span>Showing 1 report baseline. Upload additional reports to generate a multi-point progression line.</span>
              </div>
            )}
          </div>

          <div className="glass p-8 rounded-3xl border border-white/5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-500" />
                  Impact vs. Effort Matrix
                </h3>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-md">
                  Quick Wins Zone
                </span>
              </div>
              <p className="text-xs text-white/40 mb-3">
                Items in the <strong className="text-emerald-400 font-medium">upper-left</strong> give maximum score boost for the lowest effort.
              </p>
            </div>

            <div className="h-[270px] w-full">
              <Bubble data={bubbleData} options={bubbleOptions} />
            </div>

            <div className="pt-3 border-t border-white/5 flex flex-wrap gap-1.5 text-[10px]">
              {(data.action_plans || []).map((plan: any, i: number) => {
                const color = PLAN_COLORS[i % PLAN_COLORS.length];
                return (
                  <span key={i} className={`px-2 py-0.5 rounded-md border font-medium flex items-center gap-1.5 ${color.badge}`}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color.border }}></span>
                    #{i + 1}: Effort {plan.effort}, Impact {plan.impact}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* Clear List of Actionable Plans */}
      <div className="glass p-8 rounded-3xl border border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Recommended Improvement Roadmap
            </h3>
            <p className="text-xs text-white/40 mt-1">Specific, step-by-step actions tailored to close gaps found in your reports.</p>
          </div>
          <span className="text-xs font-semibold text-white/40 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            {data.action_plans?.length || 0} Actions
          </span>
        </div>

        {data.action_plans && data.action_plans.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.action_plans.map((plan: any, i: number) => {
              const color = PLAN_COLORS[i % PLAN_COLORS.length];
              return (
                <div key={i} className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-blue-500/30 transition-all group space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border mt-0.5 ${color.badge}`}>
                        Action #{i + 1}
                      </span>
                      <h4 className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors leading-snug">
                        {plan.title}
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white/80 border border-white/10 whitespace-nowrap">
                      Impact: {plan.impact}/10
                    </span>
                  </div>
                  <p className="text-xs text-white/50 leading-relaxed">
                    {plan.description}
                  </p>
                  <div className="flex items-center gap-4 text-[11px] text-white/40 pt-2 border-t border-white/5">
                    <span>Effort: <strong className="text-white/70">{plan.effort}/10</strong></span>
                    <span>•</span>
                    <span className="text-emerald-400 font-medium">Estimated boost: +{(plan.impact * 0.4).toFixed(1)} pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-white/40 py-8 text-sm italic">
            No action items recorded yet. Upload a report to receive customized recommendations.
          </div>
        )}
      </div>

      {/* Audit Trail & AI Findings */}
      <div className="glass p-8 rounded-3xl border border-white/5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <Activity className="w-5 h-5 text-amber-500" />
          Audit Trail & Key Findings
        </h3>
        <p className="text-xs text-white/40 mb-6">Historical record of evaluations, data ingestions, and AI deductions.</p>
        
        <div className="space-y-4">
          {data.timeline && data.timeline.length > 0 ? data.timeline.map((event: any, i: number) => (
            <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-start gap-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                  <h4 className="font-bold text-sm text-white/90">{event.title}</h4>
                  <time className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{event.date}</time>
                </div>
                <p className="text-xs text-white/50 leading-relaxed">{event.description}</p>
              </div>
            </div>
          )) : (
            <div className="text-center text-white/40 py-8 text-sm italic">
              No audit records yet. Upload reports or trigger an assessment to start your audit history.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
