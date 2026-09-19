"use client";
import React, { useState, useEffect } from "react";
import { 
  FileEdit, 
  Sparkles, 
  CheckCircle2, 
  RefreshCw, 
  Layers, 
  Download,
  Info,
  Wand2,
  FileText,
  AlignLeft,
  Check
} from "lucide-react";
import { aiApi } from "@/lib/api";

type Section = {
  id: string;
  title: string;
  description: string;
  placeholderHint: string;
  content: string;
};

const DEFAULT_SECTIONS: Section[] = [
  { 
    id: "s1", 
    title: "Executive Summary", 
    description: "High-level overview of sustainability vision, milestones, and leadership commitments.",
    placeholderHint: "Summarize company achievements, net-zero timeline, and strategic priorities for this reporting year...",
    content: "" 
  },
  { 
    id: "s2", 
    title: "Environmental Impact", 
    description: "Energy consumption, greenhouse gas emissions (Scope 1/2/3), water, and waste stewardship.",
    placeholderHint: "Detail energy reduction programs, transition to renewable power, and emission reduction achievements...",
    content: "" 
  },
  { 
    id: "s3", 
    title: "Social Responsibility", 
    description: "Workforce health & safety, fair labor practices, diversity, and community investment.",
    placeholderHint: "Include gender diversity ratios, lost-time injury frequency rates (LTIFR), and community engagement programs...",
    content: "" 
  },
  { 
    id: "s4", 
    title: "Governance & Ethics", 
    description: "Board oversight, anti-corruption policies, compliance frameworks, and risk management.",
    placeholderHint: "Describe board independence, whistleblower protections, code of business conduct, and audit mechanisms...",
    content: "" 
  }
];

const REWRITE_SUGGESTIONS = [
  "Make it more concise and executive-friendly",
  "Highlight specific quantifiable metrics",
  "Adopt a formal corporate sustainability tone",
  "Align closely with GRI standard disclosures"
];

export default function BuilderPage() {
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [activeSectionId, setActiveSectionId] = useState<string>(DEFAULT_SECTIONS[0].id);

  const [frameworks, setFrameworks] = useState<{ id: string; name: string }[]>([]);
  const [framework, setFramework] = useState("GRI");
  const [promptData, setPromptData] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const activeSection = sections.find(s => s.id === activeSectionId) || sections[0];

  // Load frameworks dynamically from API
  useEffect(() => {
    const loadFrameworks = async () => {
      try {
        const data = await aiApi.getFrameworks();
        setFrameworks(data);
        if (data.length > 0) setFramework(data[0].id);
      } catch {
        setFrameworks([
          { id: "GRI", name: "Global Reporting Initiative" },
          { id: "SASB", name: "Sustainability Accounting Standards Board" },
          { id: "TCFD", name: "Climate-Related Financial Disclosures" },
          { id: "IFRS", name: "IFRS Sustainability Standards" },
        ]);
      }
    };
    loadFrameworks();
  }, []);

  const handleGenerate = async () => {
    if (!activeSection) return;
    setIsGenerating(true);
    try {
      const result = await aiApi.generateSection(activeSection.title, framework, promptData);
      const output = typeof result.response === "string" ? result.response : JSON.stringify(result.response, null, 2);
      setSections(prev => prev.map(s =>
        s.id === activeSectionId
          ? { ...s, content: output }
          : s
      ));
    } catch (err) {
      console.error("Generation failed", err);
      alert("Failed to draft section. Please ensure your backend is active.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRewrite = async (instructionToUse?: string) => {
    const instr = instructionToUse || rewriteInstruction;
    if (!activeSection || !activeSection.content || !instr.trim()) return;
    setIsRewriting(true);
    try {
      const result = await aiApi.rewrite(activeSection.content, instr);
      const output = typeof result.response === "string" ? result.response : JSON.stringify(result.response, null, 2);
      setSections(prev => prev.map(s =>
        s.id === activeSectionId
          ? { ...s, content: output }
          : s
      ));
      if (!instructionToUse) setRewriteInstruction("");
    } catch (err) {
      console.error("Rewrite failed", err);
      alert("Failed to rewrite content.");
    } finally {
      setIsRewriting(false);
    }
  };

  const updateContent = (val: string) => {
    setSections(prev => prev.map(s => s.id === activeSectionId ? { ...s, content: val } : s));
  };

  const handleExport = () => {
    const populated = sections.filter(s => s.content.trim().length > 0);
    if (populated.length === 0) {
      alert("No sections have content yet. Click 'Draft Section with AI' or type your notes first.");
      return;
    }
    const reportText = [
      `# Corporate Sustainability & ESG Report`,
      `Generated with Grinova ESG Intelligence on ${new Date().toLocaleDateString()}`,
      `Standard Framework: ${framework}`,
      `\n======================================================\n`,
      ...populated.map(s => `## ${s.title}\n\n${s.content}\n\n---\n`)
    ].join("\n");

    const blob = new Blob([reportText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Grinova_ESG_Report_${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = activeSection?.content
    ? activeSection.content.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const totalSectionsCompleted = sections.filter(s => s.content.trim().length > 0).length;

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-8rem)] flex flex-col pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Report Builder</h1>
          <p className="text-white/50 mt-1 text-sm font-medium">
            Draft and export publication-ready sustainability reports aligned with global reporting standards.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/50 font-medium px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
            {totalSectionsCompleted} of {sections.length} Sections Drafted
          </span>
          <button
            onClick={handleExport}
            className="px-5 py-2.5 rounded-xl bg-blue-600 text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2 text-white"
          >
            <Download className="w-4 h-4" />
            Export Full Report
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">

        {/* Left Column: Sections & AI Controls */}
        <div className="w-full lg:w-80 flex flex-col gap-5 shrink-0 overflow-y-auto pr-1 pb-6 custom-scrollbar">

          {/* Section Outline */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-3">
            <h3 className="font-bold text-xs uppercase tracking-wider text-white/50 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Report Sections
            </h3>
            <div className="space-y-1.5">
              {sections.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSectionId(s.id)}
                  className={`w-full text-left p-3 rounded-xl flex items-center justify-between transition-all ${
                    activeSectionId === s.id
                      ? "bg-blue-600/15 border border-blue-500/30 text-white font-bold shadow-md shadow-blue-500/10"
                      : "bg-white/5 border border-transparent hover:bg-white/10 text-white/70 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono text-white/30">{idx + 1}.</span>
                    <span className="text-xs truncate">{s.title}</span>
                  </div>
                  {s.content.trim().length > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-white/10 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* AI Drafting Assistant Box */}
          <div className="glass p-5 rounded-3xl border border-white/5 space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-white/50 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              AI Draft Assistant
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5 block">
                  Reporting Framework
                </label>
                <select
                  value={framework}
                  onChange={(e) => setFramework(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50"
                >
                  {frameworks.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1.5 block">
                  Key Context & Highlights (Optional)
                </label>
                <textarea
                  value={promptData}
                  onChange={(e) => setPromptData(e.target.value)}
                  placeholder="e.g. Highlight our 30% water reduction and new gender parity targets..."
                  className="w-full h-20 bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !activeSection}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isGenerating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {isGenerating ? "Drafting with AI..." : "Draft Section with AI"}
              </button>
              <p className="text-[10px] text-white/40 text-center leading-relaxed">
                Uses verified data from your uploaded documents to draft standard-compliant language.
              </p>
            </div>
          </div>

        </div>

        {/* Right Column: Active Section Editor */}
        <div className="flex-1 flex flex-col min-w-0 glass rounded-3xl border border-white/5 overflow-hidden">
          
          {/* Editor Header with section guidance */}
          <div className="p-5 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">{activeSection?.title}</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  Editable
                </span>
              </div>
              <p className="text-xs text-white/50 mt-1 leading-snug">
                {activeSection?.description}
              </p>
            </div>

            <div className="text-xs text-white/40 flex items-center gap-3 shrink-0">
              <span>{wordCount} words</span>
            </div>
          </div>

          {/* Editor Textarea */}
          <textarea
            value={activeSection?.content || ""}
            onChange={(e) => updateContent(e.target.value)}
            placeholder={activeSection?.placeholderHint || "Draft content with AI or start typing here..."}
            className="flex-1 w-full bg-transparent p-6 text-white/90 leading-relaxed resize-none focus:outline-none custom-scrollbar text-sm font-sans placeholder:text-white/20"
          />

          {/* Quick AI Polish Toolbar */}
          <div className="p-4 border-t border-white/5 bg-black/30 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mr-1">
                Quick Polish:
              </span>
              {REWRITE_SUGGESTIONS.map((sugg, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleRewrite(sugg)}
                  disabled={isRewriting || !activeSection?.content}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] text-white/60 hover:text-white transition-colors disabled:opacity-40"
                >
                  {sugg}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                placeholder="Custom instruction (e.g. 'Add a bulleted summary for the board of directors')..."
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={() => handleRewrite()}
                disabled={isRewriting || !activeSection?.content || !rewriteInstruction}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-xs font-bold text-white transition-all flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                {isRewriting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Polish</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
