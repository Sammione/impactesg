"use client";

import React from "react";
import {
  Users,
  ShieldAlert,
  Key,
  Activity,
  Settings,
  ChevronRight,
  UserPlus,
  Lock
} from "lucide-react";

const AdminPanel = () => {
  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization & Security</h1>
          <p className="text-white/50 mt-1 text-sm font-medium">Team members, compliance governance, and audit trails.</p>
        </div>
        <button className="px-5 py-2.5 rounded-xl bg-blue-600 text-xs font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20 opacity-50 cursor-not-allowed" disabled>
          <UserPlus className="w-4 h-4" />
          Invite Team Member
        </button>
      </div>

      {/* Coming soon notice */}
      <div className="glass rounded-3xl p-8 border border-white/5 bg-gradient-to-br from-blue-600/5 to-transparent text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7 text-blue-400" />
        </div>
        <h2 className="text-xl font-bold">Admin Dashboard</h2>
        <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
          User management, role-based access control, and system audit logs will be available here once authentication is configured.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white/40 uppercase tracking-widest">
          <Activity className="w-3.5 h-3.5" />
          Coming soon
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Role-Based Access Control placeholder */}
        <div className="glass rounded-3xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Role-Based Access Control
            </h3>
          </div>
          <div className="p-8 text-center text-white/30 text-sm italic">
            No roles configured yet. Add authentication to enable RBAC.
          </div>
        </div>

        {/* System logging placeholder */}
        <div className="glass rounded-3xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-400" />
              System Logging & Security
            </h3>
            <Settings className="w-4 h-4 text-white/10" />
          </div>
          <div className="p-8 text-center text-white/30 text-sm italic">
            Audit logs will appear here once authentication is enabled.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
