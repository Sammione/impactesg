"use client";

import React, { useState, useEffect } from "react";
import { 
  TrendingUp, 
  AlertCircle, 
  FileCheck, 
  History, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Award,
  ShieldCheck,
  CheckCircle2,
  Layers
} from "lucide-react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { analyticsApi } from "@/lib/api";
import Link from "next/link";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const radarOptions = {
  scales: {
    r: {
      angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
      grid: { color: 'rgba(255, 255, 255, 0.1)' },
      pointLabels: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 11, weight: 'bold' as const } },
      ticks: { display: false },
      suggestedMin: 0,
      suggestedMax: 100
    }
  },
  plugins: {
    legend: { display: false }
  }
};

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const stats = await analyticsApi.getStats();
      setData(stats);
    } catch (err) {
      console.error("Failed to load dashboard stats", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRecalculateScore = async () => {
    setAssessing(true);
    setNotification("AI agents are reviewing your latest documents and recalculating scores...");
    try {
      await analyticsApi.triggerScore();
      await fetchStats();
      setNotification("Score updated! Your metrics reflect the latest document disclosures.");
      setTimeout(() => setNotification(null), 6000);
    } catch (err: any) {
      console.error("Assessment failed", err);
      setNotification("Could not complete assessment: " + (err?.response?.data?.detail || err.message));
    } finally {
      setAssessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
          <p className="text-white/50 text-sm font-medium">Loading your sustainability dashboard...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-red-400 bg-red-500/10 rounded-3xl border border-red-500/20 max-w-lg mx-auto mt-16 space-y-4">
        <AlertCircle className="w-8 h-8 mx-auto" />
        <div>
          <h3 className="font-bold text-base text-white">Cannot Connect to Backend Server</h3>
          <p className="text-xs text-white/50 mt-1">Please ensure the backend API server is active on port 8000.</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchStats(); }}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const score = data.organization?.overall_score || 0;
  const hasDocuments = data.has_documents !== false && score > 0;

  const getRatingPill = (val: number) => {
    if (val <= 0) return { label: "Awaiting Documents", color: "text-white/40 bg-white/5 border-white/10" };
    if (val >= 75) return { label: "Strong Performance", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" };
    if (val >= 55) return { label: "Good Progress", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" };
    return { label: "Needs Expansion", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" };
  };
  const rating = getRatingPill(score);

  const radarData = {
    labels: ['Environmental', 'Social', 'Governance', 'Supply Chain', 'Carbon Tracking', 'Diversity'],
    datasets: [
      {
        label: 'Pillar Score',
        data: data.radar_data,
        backgroundColor: 'rgba(59, 130, 246, 0.25)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
        pointBackgroundColor: 'rgba(59, 130, 246, 1)',
      },
    ],
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sustainability Dashboard</h1>
          <p className="text-white/50 mt-1 text-sm font-medium">
            {data.organization.name} · {data.organization.industry || "General Corporate"} · Real-time ESG intelligence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/dashboard/data"
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition-all shadow-md shadow-blue-500/20"
          >
            Upload Reports
          </Link>
          <button 
            onClick={handleRecalculateScore}
            disabled={assessing}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {assessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {assessing ? "Analyzing..." : "Recalculate Score"}
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="p-4 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-xs font-medium text-blue-200 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Onboarding Zero State Banner */}
      {!hasDocuments && (
        <div className="glass p-6 sm:p-8 rounded-3xl border border-blue-500/30 bg-gradient-to-r from-blue-600/15 via-blue-500/5 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
              <h3 className="font-bold text-base sm:text-lg text-white">No Sustainability Documents Uploaded Yet</h3>
            </div>
            <p className="text-xs sm:text-sm text-white/60 max-w-2xl leading-relaxed">
              Upload your company's sustainability report, environmental policy, or CSR filing (PDF or DOCX). 
              Grinova's multi-agent AI will automatically parse disclosures across Environmental, Social, and Governance pillars and calculate your score.
            </p>
          </div>
          <Link
            href="/dashboard/data"
            className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/25 flex items-center gap-2 shrink-0 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Upload Your First Report
          </Link>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - Large Scoring Card */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-3xl p-8 border border-white/5 relative overflow-hidden group">
            <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className={`text-[11px] font-bold px-3 py-1 rounded-full border uppercase tracking-wider ${rating.color}`}>
                    {rating.label}
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Overall ESG Score</h2>
                  <p className="text-xs text-white/40 mt-1">Score out of 100 based on verified reports and disclosures.</p>
                </div>

                <div className="flex items-baseline gap-4">
                  <div className="text-6xl sm:text-7xl font-bold tracking-tighter text-white">
                    {score.toFixed(1)}
                  </div>
                  {data.forecast_score && (
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <div className="text-[10px] font-bold text-blue-300 uppercase tracking-wider">Projected Target</div>
                      <div className="text-sm font-bold text-blue-400">↗ {data.forecast_score.toFixed(1)} / 100</div>
                    </div>
                  )}
                </div>

                {data.industry_benchmark && (
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 max-w-sm flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${score >= data.industry_benchmark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Industry Comparison</div>
                      <div className="text-xs font-semibold text-white/90">
                        {score >= data.industry_benchmark ? '+' : ''}{(score - data.industry_benchmark).toFixed(1)} pts vs industry benchmark ({data.industry_benchmark.toFixed(1)})
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2 max-w-sm">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-0.5">Rating Status</div>
                    <div className="text-xs font-bold text-emerald-400 capitalize">{data.organization.status || "Active"}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-0.5">Risk Profile</div>
                    <div className="text-xs font-bold text-blue-400 capitalize">{data.organization.risk_level || "Low"}</div>
                  </div>
                </div>
              </div>
              
              <div className="w-64 h-64 md:w-72 md:h-72 flex-shrink-0 flex items-center justify-center">
                <Radar data={radarData} options={radarOptions} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {/* Progress Card */}
             <div className="glass rounded-3xl p-6 border border-white/5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <Award className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                      Automated Audit
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">Disclosure Coverage</h3>
                  <p className="text-xs text-white/40 leading-relaxed mb-4">
                    How comprehensively your reports cover international sustainability standards.
                  </p>
                </div>

                <div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, score)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/40">Completeness</span>
                    <span className="font-bold text-white">{score.toFixed(1)}%</span>
                  </div>
                </div>
             </div>

             {/* Action Plan Summary Card */}
             <div className="glass rounded-3xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <Link href="/dashboard/scoring" className="text-xs text-purple-400 hover:underline flex items-center gap-1 font-medium">
                    View all <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">Recommended Next Steps</h3>
                <p className="text-xs text-white/40 mb-3">Priority actions suggested by AI to improve your rating.</p>
                
                {data.action_plans && data.action_plans.length > 0 ? (
                  <div className="space-y-2.5">
                    {data.action_plans.slice(0, 2).map((plan: any, i: number) => (
                      <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-white/10 transition-colors">
                        <div className="text-xs font-semibold text-white/90 group-hover:text-blue-400 transition-colors">{plan.title}</div>
                        <div className="text-[11px] text-white/40 line-clamp-1 mt-0.5">{plan.description}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/40 italic py-3">
                    Upload documents or recalculate score to get personalized suggestions.
                  </div>
                )}
             </div>
          </div>
        </div>

        {/* Right Column - AI Key Observations & Activity */}
        <div className="space-y-6">
          <div className="glass rounded-3xl p-6 border border-white/5 bg-gradient-to-br from-blue-600/5 to-transparent">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">Key Observations</h3>
              </div>
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">AI Audit</span>
            </div>
            
            <div className="space-y-3">
              {data.insights && data.insights.length > 0 ? (
                data.insights.slice(0, 4).map((item: any, i: number) => {
                  const Icon = item.type === 'warning' ? AlertCircle : (item.type === 'insight' ? TrendingUp : FileCheck);
                  const color = item.type === 'warning' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : (item.type === 'insight' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20');
                  return (
                    <div key={i} className="p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                      <div className="flex items-start gap-2.5">
                        <div className={`p-1.5 rounded-lg border flex-shrink-0 mt-0.5 ${color}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-white/90 truncate">{item.title}</h4>
                          <p className="text-[11px] text-white/40 leading-relaxed mt-0.5 line-clamp-2">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-white/40 py-4 text-center italic">
                  Upload reports to generate real-time AI insights.
                </div>
              )}
            </div>

            <Link 
              href="/dashboard/scoring"
              className="w-full mt-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-center block text-white/70 hover:bg-white/10 hover:text-white transition-all"
            >
              Explore Full Audit & Roadmap
            </Link>
          </div>

          <div className="glass rounded-3xl p-6 border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-white/40" />
              <h3 className="font-bold text-sm text-white/80">Recent Activity</h3>
            </div>
            <div className="space-y-4">
              {data.activities && data.activities.length > 0 ? (
                data.activities.slice(0, 5).map((activity: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-white/80 truncate">{activity.action}</div>
                      <div className="text-[10px] text-white/40">{activity.user_name}</div>
                    </div>
                    <div className="text-[10px] text-white/30 whitespace-nowrap">{activity.time}</div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/30 py-2 italic text-center">No recent activity</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
