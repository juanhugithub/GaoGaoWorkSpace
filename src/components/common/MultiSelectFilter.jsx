import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";

const MultiSelectFilter = ({ label, options, selected: selectedProp, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState([]);
  const selected = selectedProp ?? internalSelected;

  const toggleOption = (option) => {
    const nextSelected = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];

    if (onChange) {
      onChange(nextSelected);
    } else {
      setInternalSelected(nextSelected);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 relative">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      <div
        className="bg-white border border-gray-300 text-sm rounded-md px-3 py-1.5 flex justify-between items-center cursor-pointer hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-[34px]"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={`truncate mr-2 ${selected.length > 0 ? "text-gray-900" : "text-gray-400"}`}>
          {selected.length === 0 ? `全部${label}` : selected.length === 1 ? selected[0] : `已选 ${selected.length} 项`}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-[60px] left-0 w-full bg-white border border-gray-200 rounded-md shadow-xl z-30 max-h-56 overflow-y-auto py-1 animate-in fade-in zoom-in duration-150">
            {options.map((option) => (
              <div
                key={option}
                className="flex items-center px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 transition-colors"
                onClick={() => toggleOption(option)}
              >
                <div
                  className={`w-4 h-4 rounded border mr-3 flex items-center justify-center shrink-0 transition-all ${
                    selected.includes(option) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 bg-white"
                  }`}
                >
                  {selected.includes(option) && <Check size={12} strokeWidth={3} />}
                </div>
                <span className="truncate">{option}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MultiSelectFilter;
