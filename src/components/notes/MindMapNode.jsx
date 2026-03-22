const MindMapNode = ({ node, isRoot = false }) => {
  return (
    <div className="flex items-start">
      <div className={`
        relative z-10 flex shrink-0 items-center justify-center px-5 py-2.5 rounded-xl border whitespace-nowrap
        ${isRoot 
          ? 'bg-blue-600 text-white font-black shadow-lg shadow-blue-200/50 text-base border-blue-600' 
          : 'bg-white text-gray-800 font-bold border-gray-200 shadow-sm hover:border-blue-400 hover:text-blue-700 transition-colors'}
      `}>
        {node.name}
      </div>

      {node.children && node.children.length > 0 && (
        <div className="relative flex flex-col justify-center gap-4 pl-12 py-2">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-px bg-gray-300"></div>
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-300" style={{ marginTop: '22px', marginBottom: '22px' }}></div>
          {node.children.map((child) => (
            <div key={child.id} className="relative flex items-center">
              <div className="absolute -left-6 w-6 h-px bg-gray-300"></div>
              <MindMapNode node={child} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MindMapNode;

