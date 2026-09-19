"use client";
import React, { useState } from "react";
import { Settings, User, Bell, Lock, Key, Globe } from "lucide-react";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [toggles, setToggles] = useState({
    notifications: true,
    autoSync: false,
    darkTheme: true,
    twoFactor: false
  });

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Settings</h1>
        <p className="text-white/40 mt-1 text-sm font-medium">Manage your workspace preferences and integrations.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="w-full lg:w-64 space-y-2">
          {[
            { id: "general", label: "General", icon: Settings },
            { id: "account", label: "Account", icon: User },
            { id: "security", label: "Security", icon: Lock },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "api", label: "API Keys", icon: Key },
            { id: "integrations", label: "Integrations", icon: Globe },
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 glass p-8 rounded-3xl border border-white/5">
          <div className="mb-8 pb-8 border-b border-white/5">
             <h2 className="text-xl font-bold mb-2">Workspace Preferences</h2>
             <p className="text-sm text-white/40">Customize how Grinova operates for your organization.</p>
          </div>

          <div className="space-y-6">
             {[
               { id: "notifications", label: "Email Notifications", desc: "Receive daily intelligence summaries via email." },
               { id: "autoSync", label: "Auto-Sync Integrations", desc: "Automatically fetch data from connected ERP systems every 24h." },
               { id: "darkTheme", label: "Enforce Dark Theme", desc: "Force dark mode for all users in the organization." },
               { id: "twoFactor", label: "Two-Factor Authentication", desc: "Require 2FA for all admin-level actions." }
             ].map((setting) => (
               <div key={setting.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/5 transition-colors">
                 <div>
                   <div className="font-bold text-sm mb-1">{setting.label}</div>
                   <div className="text-xs text-white/40">{setting.desc}</div>
                 </div>
                 <button 
                   onClick={() => handleToggle(setting.id as keyof typeof toggles)}
                   className={`w-12 h-6 rounded-full relative transition-colors ${toggles[setting.id as keyof typeof toggles] ? 'bg-blue-500' : 'bg-white/10'}`}
                 >
                   <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${toggles[setting.id as keyof typeof toggles] ? 'right-1' : 'left-1'}`} />
                 </button>
               </div>
             ))}
          </div>
          
          <div className="mt-8 flex justify-end">
            <button className="px-6 py-3 rounded-xl bg-blue-600 text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20">
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
