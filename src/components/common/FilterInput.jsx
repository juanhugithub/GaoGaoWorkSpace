const FilterInput = ({ label, placeholder, value, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="bg-white border border-gray-300 text-sm text-gray-900 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 h-[34px] placeholder-gray-400 transition-all"
    />
  </div>
);

export default FilterInput;
