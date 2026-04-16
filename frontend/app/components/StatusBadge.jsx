const STATUS_STYLES = {
  'In-Transit': 'bg-amber-100 text-amber-700 border-amber-200',
  'Delivered':  'bg-green-100 text-green-700 border-green-200',
  'DISPUTED':   'bg-red-100   text-red-700   border-red-200',
};

export default function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {status}
    </span>
  );
}
