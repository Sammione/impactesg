"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  History,
  BookOpen,
  ChevronRight,
  Loader2,
  FileText,
  Copy,
  Check,
  HelpCircle,
  Layers,
  ArrowRight
} from "lucide-react";
import { aiApi } from "@/lib/api";
import Link from "next/link";

const SUGGESTED_PROMPTS = [
  {
    icon: "🌱",
    text: "What are our total greenhouse gas emissions (Scope 1, 2, and 3)?",
    framework: "GRI"
  },
  {
    icon: "⚠️",
    text: "What are our most critical ESG risks and areas needing disclosure improvement?",
    framework: "TCFD"
  },
  {
    icon: "👥",
    text: "Summarize our workforce diversity, safety, and employee welfare initiatives.",
    framework: "SASB"
  },
  {
    icon: "🏛️",
    text: "How does our corporate governance and anti-bribery policy align with global standards?",
    framework: "IFRS"
  }
];

export default function IntelligencePage() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedFramework, setSelectedFramework] = useState("GRI");
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // Search history persisted in localStorage
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("grinova_recent_searches") || "[]");
    } catch {
      return [];
    }
  });

  const addRecentSearch = (query: string) => {
    setRecentSearches(prev => {
      const updated = [query, ...prev.filter(q => q !== query)].slice(0, 6);
      localStorage.setItem("grinova_recent_searches", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fws, docs] = await Promise.all([
          aiApi.getFrameworks().catch(() => [
            { id: "GRI", name: "Global Reporting Initiative" },
            { id: "SASB", name: "Sustainability Accounting Standards" },
            { id: "TCFD", name: "Climate-Related Disclosures" },
            { id: "IFRS", name: "IFRS Sustainability Standards" },
          ]),
          aiApi.getDocuments().catch(() => [])
        ]);
        setFrameworks(fws);
        setUploadedFiles(docs);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || searchQuery).trim();
    if (!q) return;

    if (queryText) {
      setSearchQuery(queryText);
    }

    setSearching(true);
    setSearchResult(null);
    try {
      const data = await aiApi.chat(q, selectedFramework);
      setSearchResult(data.response);
      addRecentSearch(q);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || "Could not reach the AI service. Please verify your backend server.";
      setSearchResult(`⚠️ Error: ${msg}`);
    } finally {
      setSearching(false);
    }
  };

  const handleCopy = () => {
    if (!searchResult) return;
    navigator.clipboard.writeText(searchResult);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ESG AI Assistant</h1>
          <p className="text-white/50 mt-1 text-sm font-medium">
            Ask questions about your uploaded sustainability reports or search international reporting guidelines.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/data"
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 transition-all flex items-center gap-2"
          >
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            <span>Manage Documents ({uploadedFiles.length})</span>
          </Link>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Question Bar & Answer Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-3xl p-8 border border-white/5 space-y-6">
            
            {/* Framework Selector Pills */}
            <div>
              <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2.5">
                Target Framework Context:
              </label>
              <div className="flex flex-wrap gap-2">
                {frameworks.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFramework(f.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      selectedFramework === f.id
                        ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/25"
                        : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {f.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Box */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleAsk(); }} 
              className="relative"
            >
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ask about emissions, diversity, policies, or standard requirements..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-28 text-sm text-white focus:border-blue-500/50 outline-none transition-all placeholder:text-white/30"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{searching ? "Searching..." : "Ask AI"}</span>
              </button>
            </form>

            {/* Answer Display */}
            <AnimatePresence mode="wait">
              {searching && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 flex items-start gap-4"
                >
                  <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-blue-300">Searching your knowledge base...</p>
                    <p className="text-xs text-white/40">
                      Reading indexed documents and cross-referencing {selectedFramework} standards to construct an accurate response.
                    </p>
                  </div>
                </motion.div>
              )}

              {searchResult && !searching && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] space-y-4"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-white/90">
                        AI Response ({selectedFramework})
                      </span>
                    </div>
                    <button
                      onClick={handleCopy}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-medium"
                      title="Copy response"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <div className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap font-sans">
                    {searchResult}
                  </div>

                  <div className="pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs text-white/40">
                    <span>Generated using verified disclosures and standard cross-references</span>
                    <Link 
                      href="/dashboard/builder"
                      className="text-blue-400 hover:underline flex items-center gap-1 font-medium"
                    >
                      Use in Report Builder <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </motion.div>
              )}

              {!searchResult && !searching && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-wider">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Frequently Asked Inquiries</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setSelectedFramework(prompt.framework);
                          handleAsk(prompt.text);
                        }}
                        className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-blue-500/30 transition-all cursor-pointer group space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-base">{prompt.icon}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-white/40 group-hover:text-blue-400 transition-colors">
                            {prompt.framework}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 group-hover:text-white transition-colors leading-snug">
                          {prompt.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right Column: Knowledge Base & Inquiries */}
        <div className="space-y-6">
          
          {/* Active Documents Card */}
          <div className="glass rounded-3xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-sm">Indexed Source Files</h3>
              </div>
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                {uploadedFiles.length} Ready
              </span>
            </div>

            <div className="space-y-2.5">
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-white/40 italic">No files indexed yet.</p>
                  <Link 
                    href="/dashboard/data"
                    className="inline-block text-xs text-blue-400 font-bold hover:underline"
                  >
                    + Upload your first report
                  </Link>
                </div>
              ) : (
                uploadedFiles.slice(0, 4).map((file) => (
                  <div key={file.id} className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between text-xs">
                    <span className="text-white/80 font-medium truncate max-w-[170px]">{file.name}</span>
                    <span className="text-[10px] font-bold text-white/40 uppercase">{file.framework || "GRI"}</span>
                  </div>
                ))
              )}
            </div>

            {uploadedFiles.length > 4 && (
              <Link 
                href="/dashboard/data"
                className="mt-3 block text-center text-xs text-blue-400 hover:underline font-medium"
              >
                View all {uploadedFiles.length} files
              </Link>
            )}
          </div>

          {/* Recent Inquiries */}
          <div className="glass rounded-3xl p-6 border border-white/5">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-blue-400" />
              <h3 className="font-bold text-sm">Recent Questions</h3>
            </div>
            
            <div className="space-y-2">
              {recentSearches.length === 0 ? (
                <p className="text-xs text-white/30 italic py-2">Your past questions will appear here.</p>
              ) : (
                recentSearches.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleAsk(q)}
                    className="w-full text-left text-xs text-white/50 hover:text-white p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/5 border border-white/5 flex items-center justify-between transition-colors group"
                  >
                    <span className="truncate max-w-[200px]">{q}</span>
                    <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-white flex-shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
