const ACCENT = {
  cyan:  { icon: 'text-cyan-500',  bg: 'bg-cyan-50',  border: 'border-cyan-100' },
  green: { icon: 'text-green-500', bg: 'bg-green-50', border: 'border-green-100' },
  amber: { icon: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100' },
  red:   { icon: 'text-red-500',   bg: 'bg-red-50',   border: 'border-red-100' },
};

export default function KPICard({ label, value, sub, icon: Icon, accent = 'cyan' }) {
  const c = ACCENT[accent] || ACCENT.cyan;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
      <div className={`p-2 rounded-lg border ${c.bg} ${c.border}`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
