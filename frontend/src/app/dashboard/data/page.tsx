"use client";
import React, { useState, useEffect, useRef } from "react";
import { 
  UploadCloud, 
  RefreshCw, 
  CheckCircle2, 
  FileText, 
  Trash2, 
  FileCheck, 
  HelpCircle,
  AlertCircle,
  FileSpreadsheet,
  Info
} from "lucide-react";
import { aiApi } from "@/lib/api";

const FRAMEWORKS = [
  { id: "GRI", name: "GRI", desc: "Global Reporting Initiative (Standard sustainability disclosures)" },
  { id: "SASB", name: "SASB", desc: "Industry-specific financial ESG standards" },
  { id: "TCFD", name: "TCFD", desc: "Climate-related risks & carbon disclosures" },
  { id: "IFRS", name: "IFRS S1/S2", desc: "Global baseline sustainability standards" }
];

export default function DocumentsPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedFramework, setSelectedFramework] = useState("GRI");
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const docs = await aiApi.getDocuments();
      setDocuments(docs || []);
    } catch (err) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleProcessFile = async (file: File) => {
    if (!file) return;

    // Check extension
    const validExts = [".pdf", ".docx", ".txt"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExts.includes(ext)) {
      setStatusMessage({
        type: "error",
        text: `Unsupported file format. Please upload a PDF, DOCX (Word), or TXT file.`
      });
      return;
    }

    setUploading(true);
    setStatusMessage(null);
    setUploadStep("Uploading and parsing document...");

    try {
      // Small visual delay to show progress state
      const uploadTimer = setTimeout(() => {
        setUploadStep("Extracting sustainability metrics & recalculating scores...");
      }, 2000);

      await aiApi.uploadDocument(file, selectedFramework);
      clearTimeout(uploadTimer);

      setStatusMessage({
        type: "success",
        text: `Success! "${file.name}" was processed and indexed. Your scores have been updated.`
      });
      await loadDocuments();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || "Failed to process document. Please try again.";
      setStatusMessage({
        type: "error",
        text: `Upload error: ${msg}`
      });
    } finally {
      setUploading(false);
      setUploadStep(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProcessFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleProcessFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}"?`)) return;
    try {
      await aiApi.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      setStatusMessage({
        type: "success",
        text: `Document "${name}" removed.`
      });
    } catch (err: any) {
      alert("Failed to delete document: " + (err?.response?.data?.detail || err.message));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Documents & Upload</h1>
        <p className="text-white/50 mt-1 text-sm font-medium leading-relaxed">
          Upload your company's sustainability reports, policies, or filings (PDF, DOCX, or TXT). 
          Grinova reads your disclosures and automatically calculates your ESG performance.
        </p>
      </div>

      {/* Framework Selector */}
      <div className="glass p-6 rounded-3xl border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider">
            1. Select Reporting Framework Standard
          </label>
          <span className="text-xs text-blue-400 font-medium">Default: GRI Standard</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FRAMEWORKS.map((fw) => {
            const isSelected = selectedFramework === fw.id;
            return (
              <button
                key={fw.id}
                type="button"
                onClick={() => setSelectedFramework(fw.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all ${
                  isSelected
                    ? "bg-blue-600/15 border-blue-500/50 text-white shadow-lg shadow-blue-500/10"
                    : "bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="font-bold text-sm flex items-center justify-between">
                  <span>{fw.name}</span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400"></span>}
                </div>
                <div className="text-[11px] text-white/40 mt-1 leading-snug">{fw.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Drag & Drop Upload Card */}
      <div 
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`glass rounded-3xl p-10 border transition-all text-center relative ${
          isDragging 
            ? "border-blue-500 bg-blue-500/10 scale-[1.01]" 
            : "border-white/10 hover:border-white/20"
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={onFileInputChange} 
          className="hidden" 
          accept=".pdf,.docx,.txt"
          disabled={uploading}
        />

        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-400">
            {uploading ? (
              <RefreshCw className="w-8 h-8 animate-spin" />
            ) : (
              <UploadCloud className="w-8 h-8" />
            )}
          </div>

          <div>
            <h3 className="text-xl font-bold mb-1">
              {uploading ? "Analyzing Document..." : "Upload Sustainability Documents"}
            </h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Drag and drop your file here, or click to browse from your computer.
            </p>
          </div>

          {uploadStep && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-300 flex items-center justify-center gap-2 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{uploadStep}</span>
            </div>
          )}

          {statusMessage && (
            <div className={`p-4 rounded-xl text-xs font-medium text-left flex items-start gap-3 ${
              statusMessage.type === "success" 
                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" 
                : "bg-red-500/10 text-red-300 border border-red-500/20"
            }`}>
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              {uploading ? "Processing..." : "Select File (PDF, DOCX, TXT)"}
            </button>
          </div>

          <p className="text-[11px] text-white/30">
            Supported formats: PDF, Microsoft Word (.docx), Plain Text (.txt) · Maximum recommended size: 50MB
          </p>
        </div>
      </div>

      {/* Helpful Testing Tip */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-white/60 space-y-1">
          <p className="font-semibold text-white/80">Need sample documents to test?</p>
          <p className="text-white/40">
            You can upload any publicly available sustainability report (such as MTN Nigeria, Access Bank, Microsoft, or Unilever), an internal CSR policy, or a carbon emissions spreadsheet exported as a PDF.
          </p>
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div className="glass rounded-3xl border border-white/5 overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Analyzed Documents</h2>
            <p className="text-xs text-white/40 mt-0.5">Files currently indexed in your company's sustainability profile.</p>
          </div>
          <span className="text-xs font-bold text-white/50 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            {documents.length} {documents.length === 1 ? "File" : "Files"}
          </span>
        </div>

        <div className="p-6">
          {loadingDocs ? (
            <div className="py-8 text-center text-white/40 text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Loading documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-12 text-center text-white/40 space-y-3">
              <FileText className="w-10 h-10 mx-auto text-white/20" />
              <p className="text-sm font-medium">No documents uploaded yet.</p>
              <p className="text-xs text-white/30 max-w-sm mx-auto">
                Upload your first sustainability report above to begin automated ESG evaluation.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {documents.map((doc) => (
                <div key={doc.id} className="py-4 flex items-center justify-between gap-4 group">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-white truncate group-hover:text-blue-400 transition-colors">
                        {doc.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-white/40 mt-0.5">
                        <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-bold text-white/60 border border-white/5">
                          {doc.framework || "GRI"}
                        </span>
                        <span>•</span>
                        <span>{doc.created_at ? formatDate(doc.created_at) : "Recently added"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider">
                      <FileCheck className="w-3 h-3" />
                      Active & Scored
                    </span>
                    <button
                      onClick={() => handleDelete(doc.id, doc.name)}
                      className="p-2 rounded-xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
