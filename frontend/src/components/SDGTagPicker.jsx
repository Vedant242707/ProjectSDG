const SDG_LABELS = [
  'No Poverty', 'Zero Hunger', 'Good Health and Well-being', 'Quality Education',
  'Gender Equality', 'Clean Water and Sanitation', 'Affordable and Clean Energy',
  'Decent Work and Economic Growth', 'Industry, Innovation and Infrastructure',
  'Reduced Inequalities', 'Sustainable Cities and Communities',
  'Responsible Consumption and Production', 'Climate Action', 'Life Below Water',
  'Life on Land', 'Peace, Justice and Strong Institutions', 'Partnerships for the Goals',
]

export default function SDGTagPicker({ selected = [], onChange }) {
  const toggle = (n) => {
    onChange(selected.includes(n) ? selected.filter((x) => x !== n) : [...selected, n])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SDG_LABELS.map((label, i) => {
        const n = i + 1
        const active = selected.includes(n)
        return (
          <button
            key={n}
            type="button"
            onClick={() => toggle(n)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'bg-sky-500 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,.35)] dark:bg-sky-900 dark:text-cyan-100 dark:shadow-[0_0_0_1px_rgba(34,211,238,.28)]'
                : 'bg-cyan-50 text-sky-700 hover:bg-cyan-100 dark:bg-slate-800 dark:text-cyan-300 dark:hover:bg-slate-700'
            }`}
          >
            SDG {n}: {label}
          </button>
        )
      })}
    </div>
  )
}
