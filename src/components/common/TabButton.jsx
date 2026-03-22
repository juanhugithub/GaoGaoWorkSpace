const TabButton = ({ icon, label, isActive, onClick }) => (
  <button 
    onClick={onClick}
    className={`
      flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-all shrink-0
      ${isActive 
        ? 'bg-white text-blue-600 border-blue-600 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] z-10' 
        : 'bg-transparent text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
      }
    `}
  >
    {icon}
    {label}
  </button>
);

export default TabButton;

