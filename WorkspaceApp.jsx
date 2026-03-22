import React, { useState, useMemo } from 'react';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown, 
  Settings, 
  Search, 
  Upload, 
  FolderTree,
  MoreHorizontal,
  Star,
  Download,
  Save,
  FileBox,
  BarChart3,
  RotateCcw,
  Eye,
  Edit2,
  Check,
  FileSpreadsheet,
  ArrowUpDown,
  Calculator,
  Briefcase,
  ShieldCheck,
  LayoutTemplate,
  Link as LinkIcon,
  ExternalLink,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Network,
  CornerDownRight,
  FolderPlus,
  Play,
  BookOpen,
  Library,
  RefreshCw,
  MonitorPlay,
  CalendarDays,
  CheckCircle2,
  Clock,
  User,
  AlertCircle,
  MessageSquare,
  DownloadCloud,
  CheckSquare,
  Square
} from 'lucide-react';

// ==========================================
// 1. 数据定义 (模拟)
// ==========================================

// --- 数据看台数据 ---
const initialTableData = [
  { id: 1, year: '2025', district: '高新区', level: '省级', category: '祖冲之攻关计划', name: '面向高端科学仪器的高性能气相色谱...', enterprise: '苏州清碳科技有限公司', progress: '进行中', amount: 150.0 },
  { id: 2, year: '2025', district: '经开区', level: '市级', category: '祖冲之攻关计划', name: '6400MT/s速率的DDR5内存接口芯片研...', enterprise: '澜起电子科技(昆山)有限公司', progress: '已验收', amount: 80.0 },
  { id: 3, year: '2025', district: '主城区', level: '国家级', category: '国境外科技合作项目', name: '无人机集群智能协同技术研究', enterprise: '江苏智云天工科技有限公司', progress: '进行中', amount: 300.0 },
  { id: 4, year: '2024', district: '高新区', level: '省级', category: '重点研发计划', name: '新能源汽车核心部件轻量化技术开发', enterprise: '昆山长鹰硬质材料科技股份...', progress: '已验收', amount: 200.0 },
  { id: 5, year: '2024', district: '周市镇', level: '市级', category: '企业技术中心项目', name: '5G通信基站用高频高速覆铜板研发', enterprise: '苏州生益科技有限公司', progress: '未开始', amount: 50.0 },
  { id: 6, year: '2024', district: '高新区', level: '国家级', category: '重点研发计划', name: '第三代半导体功率器件研发与产业化', enterprise: '苏州能讯高能半导体有限公司', progress: '进行中', amount: 500.0 },
];

// --- 文件管理 (虚拟空间) 数据 ---
const virtualSpaces = [
  { id: 'vs-1', name: '项目申报业务', icon: <Briefcase size={18} />, count: 12 },
  { id: 'vs-2', name: '安全生产台账', icon: <ShieldCheck size={18} />, count: 5 },
  { id: 'vs-3', name: '党建与活动组织', icon: <Star size={18} />, count: 8 },
  { id: 'vs-tpl', name: '常用模板中心', icon: <LayoutTemplate size={18} />, isTemplate: true },
  { id: 'vs-dir-engine', name: '目录结构引擎', icon: <Network size={18} />, isTool: true }
];

const mappedItems = {
  'vs-1': [
    { 
      id: 'm1', type: 'folder', name: '2025年高企申报材料库', realPath: 'Z:\\部门共享\\科技局\\2025\\高新技术企业申报', tag: '共享盘', isOpen: true,
      children: [
        { id: 'm1-1', type: 'file', name: '2025高企申报书正文.docx', realPath: 'Z:\\部门共享\\科技局\\2025\\高新技术企业申报\\2025高企申报书正文.docx' },
        { id: 'm1-2', type: 'folder', name: '01_财务审计报告', realPath: 'Z:\\部门共享\\科技局\\2025\\高新技术企业申报\\01_财务审计报告', children: [] },
        { id: 'm1-3', type: 'folder', name: '02_知识产权附件', realPath: 'Z:\\部门共享\\科技局\\2025\\高新技术企业申报\\02_知识产权附件', children: [] }
      ]
    },
    { id: 'm2', type: 'folder', name: '重点研发计划(历史归档)', realPath: 'D:\\My Work\\项目申报\\重点研发计划_归档', tag: '本地', children: [] },
    { id: 'm3', type: 'file', name: '2025年项目申报指南.pdf', realPath: 'Z:\\公司制度\\研发部\\2025年项目申报指南_V2.pdf', tag: '共享盘' },
  ],
  'vs-tpl': [
    { id: 't1', type: 'file', name: '项目资金决算表模板.xlsx', realPath: 'Z:\\公共模板库\\财务类\\决算表_标准版.xlsx', tag: '财务' }
  ]
};

// --- SOP脑图笔记 数据 ---
const notebooks = [
  { id: 'nb-1', name: '业务SOP与流程', count: 4 },
  { id: 'nb-2', name: '系统操作指南', count: 2 },
  { id: 'nb-3', name: '个人经验沉淀', count: 7 }
];

const notesList = {
  'nb-1': [
    { id: 'note-1', title: '高企申报全流程把控', lastSync: '10分钟前', path: 'D:\\Notes\\高企申报全流程.xmind', type: 'xmind' },
    { id: 'note-2', title: '重点研发计划立项评估流', lastSync: '昨天 15:30', path: 'D:\\Notes\\重点研发评估.xmind', type: 'xmind' },
    { id: 'note-3', title: '年度审计财务对接事项', lastSync: '3天前', path: 'D:\\Notes\\年度审计对接.xmind', type: 'xmind' }
  ]
};

const mockMindMapData = {
  id: 'root',
  name: '高企申报全流程把控',
  children: [
    {
      id: 'c1',
      name: '一、前期准备 (3-4月)',
      children: [
        { id: 'c1-1', name: '成立专项小组 (研发+财务+行政)', children: [] },
        { id: 'c1-2', name: '财务数据预梳理', children: [
          { id: 'c1-2-1', name: '研发费用占比测算 (需达标)', children: [] },
          { id: 'c1-2-2', name: '高新技术产品收入确认', children: [] }
        ]},
        { id: 'c1-3', name: '知识产权盘点 (最核心!)', children: [
          { id: 'c1-3-1', name: 'I类知识产权(发明专利等)确认', children: [] },
          { id: 'c1-3-2', name: 'II类知识产权(软著/实用新型)补齐', children: [] }
        ]}
      ]
    },
    {
      id: 'c2',
      name: '二、材料撰写与归集 (5-6月)',
      children: [
        { id: 'c2-1', name: 'RD(研发项目)及PS(高品)表撰写', children: [] },
        { id: 'c2-2', name: '科技成果转化证明材料收集', children: [
          { id: 'c2-2-1', name: '发票、合同、测报、用户报告等', children: [] }
        ]},
        { id: 'c2-3', name: '企业创新管理制度汇编', children: [] }
      ]
    },
    {
      id: 'c3',
      name: '三、系统填报与装订 (7月)',
      children: [
        { id: 'c3-1', name: '江苏省科技计划管理平台填报', children: [] },
        { id: 'c3-2', name: '国网系统同步数据', children: [] },
        { id: 'c3-3', name: '纸质材料胶装与盖章', children: [] }
      ]
    }
  ]
};

// --- 工作日记本 数据 ---
const JOURNAL_CATEGORIES = ['安全生产', '科技项目', '材料报送', '活动对接', '其他事项'];

const initialJournals = [
  {
    id: '2026-03-20',
    date: '2026年03月20日',
    weekday: '星期五',
    review: '今天高企材料基本收集完毕，下周重点盯一下财务审计报告的进度。安全巡查发现的隐患已经督促整改。',
    tasks: {
      '安全生产': [
        { id: 't1', content: '车间消防设施月度巡查', contact: '张工 (138xxxx1234)', deadline: '今天 17:00', progress: '已完成', priority: '高', remark: 'A栋、B栋灭火器压力均正常，C栋有两个需要下周更换。' }
      ],
      '科技项目': [
        { id: 't2', content: '高企申报-知识产权附件归集', contact: '王律 (微信)', deadline: '3月25日', progress: '进行中', priority: '高', remark: '发明专利5个已拿到原件扫描，实用新型还差2个等下发。' },
        { id: 't3', content: '研发费用台账核对', contact: '财务李姐 (内线 802)', deadline: '3月22日', progress: '卡点等待', priority: '中', remark: '李姐今天请假，等周一核对。' }
      ],
      '材料报送': [
        { id: 't4', content: '一季度总结材料报送区科技局', contact: '刘科 (0512-xxxx)', deadline: '今天 12:00', progress: '已完成', priority: '高', remark: '' }
      ],
      '活动对接': [],
      '其他事项': [
        { id: 't5', content: '部门周会资料准备', contact: '--', deadline: '今天 16:00', progress: '已完成', priority: '低', remark: 'PPT已发群里。' }
      ]
    }
  },
  {
    id: '2026-03-19',
    date: '2026年03月19日',
    weekday: '星期四',
    review: '重点跟进了研发项目的立项评估，总体顺利。',
    tasks: {
      '安全生产': [],
      '科技项目': [
        { id: 't6', content: '重点研发计划立项专家评审会准备', contact: '赵总', deadline: '3月19日', progress: '已完成', priority: '高', remark: '专家反馈良好，技术创新点得到了认可。' }
      ],
      '材料报送': [],
      '活动对接': [],
      '其他事项': []
    }
  },
  {
    id: '2026-02-28',
    date: '2026年02月28日',
    weekday: '星期六',
    review: '月末总结，下月冲刺。',
    tasks: {
      '安全生产': [], '科技项目': [], '材料报送': [], '活动对接': [], '其他事项': []
    }
  }
];

// ==========================================
// 2. 通用基础组件
// ==========================================

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

const MultiSelectFilter = ({ label, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState([]);

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      setSelected(selected.filter(item => item !== opt));
    } else {
      setSelected([...selected, opt]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 relative">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
      <div 
        className="bg-white border border-gray-300 text-sm rounded-md px-3 py-1.5 flex justify-between items-center cursor-pointer hover:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all h-[34px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={`truncate mr-2 ${selected.length > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected.length === 0 ? `全部${label}` : 
           selected.length === 1 ? selected[0] : 
           `已选 ${selected.length} 项`}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)}></div>
          <div className="absolute top-[60px] left-0 w-full bg-white border border-gray-200 rounded-md shadow-xl z-30 max-h-56 overflow-y-auto py-1 animate-in fade-in zoom-in duration-150">
            {options.map((opt, i) => (
              <div 
                key={i} 
                className="flex items-center px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm text-gray-700 transition-colors"
                onClick={() => toggleOption(opt)}
              >
                <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center shrink-0 transition-all
                  ${selected.includes(opt) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}
                `}>
                  {selected.includes(opt) && <Check size={12} strokeWidth={3} />}
                </div>
                <span className="truncate">{opt}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const FilterInput = ({ label, placeholder }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
    <input 
      type="text" 
      placeholder={placeholder}
      className="bg-white border border-gray-300 text-sm text-gray-900 rounded-md px-3 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 h-[34px] placeholder-gray-400 transition-all"
    />
  </div>
);

const ActivityIcon = ({ progress }) => {
  if (progress === '已完成') return <Check size={14} className="text-emerald-500" />;
  if (progress === '卡点等待') return <Clock size={14} className="text-amber-500" />;
  if (progress === '进行中') return <RotateCcw size={14} className="text-blue-500" />;
  return <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 mx-0.5"></div>;
};

// ==========================================
// 3. 业务组件: 虚拟树节点 & 脑图节点
// ==========================================

const VirtualTreeNode = ({ node, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(node.isOpen || false);
  const paddingLeft = `${level * 24 + 16}px`;

  return (
    <div>
      <div 
        className="group flex items-center justify-between py-2 px-3 hover:bg-blue-50/60 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-blue-100 mb-0.5"
        style={{ paddingLeft }}
        onDoubleClick={() => alert(`模拟操作：双击打开文件/文件夹 -> ${node.realPath}`)}
        onClick={() => node.type === 'folder' && setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          {node.type === 'folder' ? (
            <span className="text-gray-400 w-4 h-4 flex items-center justify-center shrink-0">
              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          ) : (
            <span className="w-4 h-4 shrink-0"></span>
          )}

          <span className={`shrink-0 ${node.type === 'folder' ? 'text-blue-500' : 'text-gray-500'}`}>
            {node.type === 'folder' ? <Folder size={20} fill={isOpen ? "currentColor" : "none"} /> : <File size={18} />}
          </span>

          <div className="flex flex-col min-w-0 flex-1 justify-center">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-800 truncate select-none group-hover:text-blue-700" title={node.name}>
                {node.name}
              </span>
              {node.tag && (
                <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-medium border border-gray-200 shrink-0">
                  {node.tag}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="hidden group-hover:flex items-center gap-1.5 pr-2 shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); alert(`模拟操作：复制 -> ${node.realPath}`); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-blue-700 hover:bg-blue-100/80 rounded-md transition-colors shadow-sm bg-white border border-gray-200" 
            title="复制实际文件或文件夹"
          >
            <Copy size={14} /> 复制
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); alert(`模拟操作：打开文件所在位置 -> ${node.realPath}`); }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-gray-600 hover:text-blue-700 hover:bg-blue-100/80 rounded-md transition-colors shadow-sm bg-white border border-gray-200" 
            title="打开文件所在位置"
          >
            <FolderOpen size={14} /> 打开所在位置
          </button>
        </div>
      </div>

      {node.type === 'folder' && isOpen && node.children && (
        <div className="flex flex-col relative">
          <div className="absolute top-0 bottom-2 w-px bg-gray-200" style={{ left: `${level * 24 + 23}px`}}></div>
          {node.children.map(child => (
            <VirtualTreeNode key={child.id} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

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

// ==========================================
// 4. 页面视图 1: 目录生成引擎 (集成在虚拟业务空间中)
// ==========================================
function DirectoryEngineView() {
  const [treeData, setTreeData] = useState([{ id: 'root-1', name: '新建文件夹集', children: [] }]);
  const [targetPath, setTargetPath] = useState('D:\\Workspace\\NewProject');

  const initialPresets = useMemo(() => [
    {
      id: 'preset-1',
      name: '11区镇材料收集',
      data: [{
        id: 'root-d',
        name: '2025年度各区镇材料汇总',
        children: ['高新区', '经开区', '主城区', '周市镇', '张浦镇', '巴城镇', '千灯镇', '淀山湖镇', '锦溪镇', '周庄镇', '陆家镇'].map((d, i) => ({
          id: `d-${i}`, name: d,
          children: [
            { id: `d-${i}-1`, name: '01_工作总结', children: [] },
            { id: `d-${i}-2`, name: '02_项目台账', children: [] },
            { id: `d-${i}-3`, name: '03_证明附件', children: [] }
          ]
        }))
      }]
    },
    {
      id: 'preset-2',
      name: '标准项目申报',
      data: [{
        id: 'root-p',
        name: '标准项目申报材料结构',
        children: [
          { id: 'p1', name: '01_正式申报书', children: [] },
          { id: 'p2', name: '02_企业基础材料', children: [
            { id: 'p2-1', name: '营业执照及法人材料', children: [] },
            { id: 'p2-2', name: '近三年财务审计报告', children: [] },
            { id: 'p2-3', name: '完税证明', children: [] }
          ]},
          { id: 'p3', name: '03_核心技术材料', children: [
            { id: 'p3-1', name: '发明专利与软著', children: [] },
            { id: 'p3-2', name: '第三方权威检测报告', children: [] },
            { id: 'p3-3', name: '科技查新报告', children: [] }
          ]}
        ]
      }]
    }
  ], []);

  const [presets, setPresets] = useState(initialPresets);

  const addSibling = (parentId) => {
    const newNode = { id: Date.now().toString(), name: '新建文件夹', children: [] };
    if (!parentId) {
      setTreeData([...treeData, newNode]);
      return;
    }
    const updateTree = (nodes) => nodes.map(node => {
      if (node.id === parentId) return { ...node, children: [...node.children, newNode] };
      if (node.children) return { ...node, children: updateTree(node.children) };
      return node;
    });
    setTreeData(updateTree(treeData));
  };

  const updateNodeName = (id, newName, nodes = treeData) => nodes.map(node => {
    if (node.id === id) return { ...node, name: newName };
    if (node.children) return { ...node, children: updateNodeName(id, newName, node.children) };
    return node;
  });

  const deleteNode = (id, nodes = treeData) => nodes.filter(node => node.id !== id).map(node => ({
    ...node, children: node.children ? deleteNode(id, node.children) : []
  }));

  const renderNode = (node, parentId = null, depth = 0) => (
    <div key={node.id} className="relative group">
      {depth > 0 && <div className="absolute left-[-20px] top-[18px] w-[16px] h-px bg-gray-300"></div>}
      {depth > 0 && <div className="absolute left-[-20px] top-[-100%] bottom-[18px] w-px bg-gray-300"></div>}
      <div className="flex items-center gap-2 py-1.5">
        <Folder size={18} className="text-blue-500 shrink-0" fill="currentColor" />
        <input 
          type="text" 
          value={node.name}
          onChange={(e) => setTreeData(updateNodeName(node.id, e.target.value))}
          className="bg-transparent border border-transparent hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:shadow-sm rounded px-2 py-1 text-sm font-medium text-gray-800 outline-none transition-all w-64"
        />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
          <button onClick={() => addSibling(node.id)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="添加子文件夹"><CornerDownRight size={16} /></button>
          <button onClick={() => setTreeData(deleteNode(node.id))} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="删除该项"><Trash2 size={16} /></button>
        </div>
      </div>
      {node.children && node.children.length > 0 && (
        <div className="ml-6 relative pl-2">{node.children.map(child => renderNode(child, node.id, depth + 1))}</div>
      )}
    </div>
  );

  return (
    <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
      <div className="p-6 border-b border-gray-100 shrink-0 bg-gradient-to-r from-blue-50/50 to-white">
        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3 mb-2">
          <Network size={24} className="text-blue-600" />脑图式目录生成引擎
        </h2>
        <p className="text-sm text-gray-500 mb-5">可视化编辑复杂文件夹层级，一键在指定的本地物理路径中完成创建。</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-2">模板预设库:</span>
          <div className="relative">
            <select 
              className="appearance-none bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm transition-all"
              onChange={(e) => {
                if(e.target.value) {
                  const p = presets.find(p => p.id === e.target.value);
                  if(p) setTreeData(JSON.parse(JSON.stringify(p.data))); 
                }
                e.target.value = ""; 
              }}
            >
              <option value="">-- 选择预设模板载入 --</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-2 text-gray-400 pointer-events-none" />
          </div>
          <button 
            onClick={() => {
              if (treeData.length === 0) return alert('当前画布为空，无法保存为预设！');
              const presetName = window.prompt('请输入新结构预设的名称：', '新建结构模板');
              if (presetName) setPresets([...presets, { id: 'p-' + Date.now(), name: presetName, data: JSON.parse(JSON.stringify(treeData)) }]);
            }} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-600 hover:text-white transition-colors shadow-sm"
          >
            <Save size={14}/> 保存当前为预设
          </button>
          <div className="w-px h-6 bg-gray-200 mx-2"></div>
          <button onClick={() => setTreeData([])} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium hover:bg-red-50 hover:text-red-600 transition-colors">
            清空画布
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8 bg-[#FAFAFA] scrollbar-thin">
        <div className="bg-white border border-gray-200 rounded-xl p-6 min-h-full shadow-sm">
          {treeData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
              <FolderPlus size={48} className="mb-4 opacity-50" />
              <p className="mb-4 text-gray-500">画布空空如也</p>
              <button onClick={() => addSibling(null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md">创建根文件夹</button>
            </div>
          ) : (
            <div className="pb-20">
              {treeData.map(node => renderNode(node, null, 0))}
              <button onClick={() => addSibling(null)} className="mt-4 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Plus size={16} /> 添加同级根目录</button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 bg-white border-t border-gray-200 shrink-0 flex items-center gap-4">
        <div className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-bold text-gray-500">目标物理路径</span>
          <div className="flex gap-2">
            <input type="text" value={targetPath} onChange={(e) => setTargetPath(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50">浏览...</button>
          </div>
        </div>
        <div className="w-px h-10 bg-gray-200 mx-2"></div>
        <button disabled={treeData.length === 0} className="flex items-center gap-2 h-11 px-8 bg-blue-600 text-white rounded-xl text-base font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-50">
          <Play size={18} fill="currentColor" /> 一键生成结构
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 5. 页面视图 2: 虚拟文件管理页 (Virtual Workspace)
// ==========================================
function VirtualWorkspaceView() {
  const [activeSpace, setActiveSpace] = useState('vs-dir-engine');
  const [searchQuery, setSearchQuery] = useState('');

  const currentSpaceData = virtualSpaces.find(s => s.id === activeSpace);
  const currentItems = mappedItems[activeSpace] || [];
  const isTemplateSpace = currentSpaceData?.isTemplate;
  const isToolSpace = currentSpaceData?.isTool;

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin pt-5">
          <div className="text-[11px] font-bold text-gray-400 mb-3 px-3 uppercase tracking-widest">我的业务场景</div>
          <div className="flex flex-col gap-1">
            {virtualSpaces.filter(s => !s.isTemplate && !s.isTool).map(space => (
              <button 
                key={space.id} onClick={() => setActiveSpace(space.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeSpace === space.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
              >
                <div className="flex items-center gap-2.5"><span className={`${activeSpace === space.id ? 'text-blue-200' : 'text-gray-400'}`}>{space.icon}</span>{space.name}</div>
              </button>
            ))}
          </div>

          <div className="mt-6 mb-3 px-3 border-t border-gray-100 pt-4">
            <div className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-widest">全局资源与工具</div>
            <div className="flex flex-col gap-1">
              {virtualSpaces.filter(s => s.isTemplate || s.isTool).map(space => (
                <button 
                  key={space.id} onClick={() => setActiveSpace(space.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeSpace === space.id ? (space.isTool ? 'bg-indigo-500 text-white shadow-md shadow-indigo-200' : 'bg-amber-500 text-white shadow-md shadow-amber-200') : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'}`}
                >
                  <span className={`${activeSpace === space.id ? 'text-white/80' : (space.isTool ? 'text-indigo-500' : 'text-amber-500')}`}>{space.icon}</span>{space.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isToolSpace ? (
         <DirectoryEngineView />
      ) : (
        <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-100 shrink-0">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">{currentSpaceData?.icon}{currentSpaceData?.name}</h2>
                <p className="text-sm text-gray-500 mt-1.5 flex items-center gap-1.5"><LinkIcon size={14} className="text-gray-400" />此空间的内容为底层文件/文件夹的虚拟快捷映射。</p>
              </div>
            </div>
            <div className="relative max-w-md">
              <input type="text" placeholder={`在"${currentSpaceData?.name}"中搜索映射...`} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <Search size={18} className="absolute left-3.5 top-2 text-gray-400" />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 bg-white scrollbar-thin">
            {currentItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                 <FolderOpen size={48} className="text-gray-300 mb-4 opacity-50" />
                 <p className="text-lg font-bold text-gray-500 mb-2">当前业务空间暂无关联文件</p>
              </div>
            ) : (
              <div className="flex flex-col max-w-5xl mx-auto w-full pb-10">
                {currentItems.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => (
                  <VirtualTreeNode key={item.id} node={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 6. 页面视图 3: 数据看台 (Dashboard)
// ==========================================
function DashboardView() {
  const [keyword, setKeyword] = useState('');
  const [filteredData] = useState(initialTableData);

  const stats = useMemo(() => {
    const totalCount = filteredData.length;
    const totalAmount = filteredData.reduce((sum, item) => sum + item.amount, 0);
    const acceptedCount = filteredData.filter(item => item.progress === '已验收').length;
    const acceptanceRate = totalCount === 0 ? 0 : Math.round((acceptedCount / totalCount) * 100);
    return { totalCount, totalAmount, acceptanceRate };
  }, [filteredData]);

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" size={24} />项目台账中心
          </h2>
          <p className="text-sm text-gray-500 mt-1">结构化存储所有历史项目数据，支持多维检索与实时统计聚合。</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm">
            <FileSpreadsheet size={16} /> 导入台账 (Excel/CSV)
          </button>
        </div>
      </div>

      <div className="bg-white p-5 border border-gray-200 rounded-2xl shadow-sm flex flex-col gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <input type="text" placeholder="极速检索：输入项目名称、企业名称或任何关键字..." className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition-all" />
            <Search size={18} className="absolute left-3.5 top-2 text-gray-400" />
          </div>
          <button className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md">查 询</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MultiSelectFilter label="年度" options={['2025', '2024', '2023']} />
          <MultiSelectFilter label="区镇" options={['高新区', '经开区', '主城区', '周市镇']} />
          <MultiSelectFilter label="项目级别" options={['国家级', '省级', '市级', '区级']} />
          <MultiSelectFilter label="项目类别" options={['祖冲之攻关', '研发计划', '科技合作']} />
          <MultiSelectFilter label="进度状态" options={['进行中', '已验收', '未开始']} />
          <FilterInput label="支持金额(>)" placeholder="例如: 100" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 shrink-0">
        <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-blue-600/80 mb-1 flex items-center gap-1"><Calculator size={14}/> 筛选结果汇总</div>
            <div className="text-2xl font-bold text-gray-800">{stats.totalCount} <span className="text-sm font-medium text-gray-500">个项目</span></div>
          </div>
          <div className="h-10 w-10 bg-blue-100/50 rounded-full flex items-center justify-center text-blue-500"><FileBox size={20} /></div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-amber-600/80 mb-1 flex items-center gap-1"><Calculator size={14}/> 累计支持金额</div>
            <div className="text-2xl font-bold text-gray-800">{stats.totalAmount} <span className="text-sm font-medium text-gray-500">万元</span></div>
          </div>
          <div className="text-3xl font-bold text-amber-200/50">¥</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div>
            <div className="text-xs font-bold text-emerald-600/80 mb-1 flex items-center gap-1"><Calculator size={14}/> 整体验收率</div>
            <div className="text-2xl font-bold text-gray-800">{stats.acceptanceRate} <span className="text-sm font-medium text-gray-500">%</span></div>
          </div>
          <div className="h-10 w-10 bg-emerald-100/50 rounded-full flex items-center justify-center text-emerald-500"><Check size={20} strokeWidth={3} /></div>
        </div>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto scrollbar-thin">
          <table className="w-full text-sm text-left">
            <thead className="text-[12px] text-gray-500 bg-gray-50 sticky top-0 z-10 border-b border-gray-200 shadow-sm">
              <tr>
                <th className="px-5 py-3 font-medium text-center w-12">#</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100">年份</th>
                <th className="px-4 py-3 font-medium cursor-pointer hover:bg-gray-100">区镇</th>
                <th className="px-4 py-3 font-medium">级别 / 类别</th>
                <th className="px-4 py-3 font-medium">项目名称 / 承担企业</th>
                <th className="px-4 py-3 font-medium text-right">支持金额(万元)</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium text-center w-32">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((row, index) => (
                <tr key={row.id} className="hover:bg-blue-50/40 transition-colors group">
                  <td className="px-5 py-3 text-center text-gray-400 font-mono text-xs">{index + 1}</td>
                  <td className="px-4 py-3 text-gray-800">{row.year}</td>
                  <td className="px-4 py-3 text-gray-600">{row.district}</td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mb-1 bg-blue-50 text-blue-600 border border-blue-100">{row.level}</div>
                    <div className="text-xs text-gray-500 truncate max-w-[120px]">{row.category}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-800 truncate max-w-sm">{row.name}</div>
                    <div className="text-xs text-gray-500 truncate max-w-sm mt-1">{row.enterprise}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">{row.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.progress}</td>
                  <td className="px-5 py-3 text-center">
                    <button className="text-blue-600 hover:underline">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. 页面视图 4: SOP脑图笔记 (Process Notes View)
// ==========================================
function NotesWorkspaceView() {
  const [activeNotebook, setActiveNotebook] = useState('nb-1');
  const [activeNote, setActiveNote] = useState('note-1');
  const [isSyncing, setIsSyncing] = useState(false);

  const currentNotes = notesList[activeNotebook] || [];
  const currentNoteData = currentNotes.find(n => n.id === activeNote);

  const triggerSync = () => {
    setIsSyncing(true);
    setTimeout(() => setIsSyncing(false), 1000);
  };

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-72 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="p-4 border-b border-gray-100 flex items-center gap-2 bg-gradient-to-r from-blue-50/50 to-white">
          <Library size={20} className="text-blue-600" />
          <h2 className="text-base font-black text-gray-800">SOP知识库</h2>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <input type="text" placeholder="搜索全局笔记..." className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col">
          <div className="p-3">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">我的笔记本</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {notebooks.map(nb => (
                <button key={nb.id} onClick={() => setActiveNotebook(nb.id)} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeNotebook === nb.id ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <div className="flex items-center gap-2"><Folder size={16} fill={activeNotebook === nb.id ? "currentColor" : "none"} className={activeNotebook === nb.id ? 'text-blue-500' : 'text-gray-400'} />{nb.name}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeNotebook === nb.id ? 'bg-blue-100/50' : 'bg-gray-100'}`}>{nb.count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="w-full h-px bg-gray-100"></div>
          <div className="flex-1 p-3 bg-gray-50/50">
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">当前笔记 ({currentNotes.length})</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {currentNotes.map(note => (
                <div key={note.id} onClick={() => setActiveNote(note.id)} className={`group p-3 rounded-xl border cursor-pointer transition-all ${activeNote === note.id ? 'bg-white border-blue-400 shadow-sm shadow-blue-100' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                  <div className="flex items-start gap-2.5">
                    <div className="shrink-0 mt-0.5"><Network size={16} className={activeNote === note.id ? 'text-blue-600' : 'text-amber-500'} /></div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold truncate mb-1 ${activeNote === note.id ? 'text-blue-700' : 'text-gray-800'}`}>{note.title}</h4>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1"><RefreshCw size={10} /> {note.lastSync} 同步</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {currentNoteData ? (
          <>
            <div className="p-5 border-b border-gray-100 shrink-0 flex items-center justify-between bg-white z-10 shadow-sm">
              <div className="flex flex-col min-w-0 mr-4">
                <h2 className="text-xl font-black text-gray-800 flex items-center gap-2 truncate">{currentNoteData.title}</h2>
                <div className="text-xs text-gray-400 mt-1 flex items-center gap-4">
                  <span className="flex items-center gap-1"><LinkIcon size={12} /> 源文件: {currentNoteData.path}</span>
                  <span className="flex items-center gap-1 text-emerald-600"><MonitorPlay size={12} /> Xmind保存后自动刷新</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={triggerSync} className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100">
                  <RefreshCw size={14} className={isSyncing ? "animate-spin text-blue-600" : ""} /> 手动拉取
                </button>
                <button className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all">
                  <ExternalLink size={16} /> 在 Xmind 中编辑
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto relative scrollbar-thin bg-gray-50/50" style={{ backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
              <div className="p-16 min-w-max min-h-max"><MindMapNode node={mockMindMapData} isRoot={true} /></div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
             <BookOpen size={48} className="text-gray-300 mb-4 opacity-50" />
             <p className="text-lg font-bold text-gray-500 mb-2">未选择任何笔记</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 8. 页面视图 5: 工作日记本 (Daily Journal)
// ==========================================
function JournalWorkspaceView() {
  const [journals, setJournals] = useState(initialJournals);
  const [activeJournalId, setActiveJournalId] = useState(initialJournals[0].id);
  
  // 导出模式状态
  const [isExportMode, setIsExportMode] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState([]);

  const activeJournal = journals.find(j => j.id === activeJournalId);

  // 对日记进行按月份分组
  const groupedJournals = useMemo(() => {
    return journals.reduce((acc, j) => {
      const month = j.date.substring(0, 8); // 提取 "2026年03月"
      if (!acc[month]) acc[month] = [];
      acc[month].push(j);
      return acc;
    }, {});
  }, [journals]);

  const createTodayJournal = () => {
    const today = new Date();
    const id = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (journals.some(j => j.id === id)) {
      setActiveJournalId(id);
      return;
    }
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const newJournal = {
      id,
      date: `${today.getFullYear()}年${String(today.getMonth() + 1).padStart(2, '0')}月${String(today.getDate()).padStart(2, '0')}日`,
      weekday: weekdays[today.getDay()],
      review: '',
      tasks: JOURNAL_CATEGORIES.reduce((acc, cat) => ({ ...acc, [cat]: [] }), {})
    };
    // 自动继承昨天未完成事项的逻辑，在真实环境中可在此处遍历 journals[0] 并提取 progress !== '已完成' 的 task
    setJournals([newJournal, ...journals]);
    setActiveJournalId(id);
  };

  const updateTask = (cat, taskId, field, value) => {
    setJournals(journals.map(j => j.id === activeJournalId ? {
      ...j, tasks: { ...j.tasks, [cat]: j.tasks[cat].map(t => t.id === taskId ? { ...t, [field]: value } : t) }
    } : j));
  };

  const addTask = (cat) => {
    const newTask = { id: `t-${Date.now()}`, content: '', contact: '', deadline: '', progress: '未开始', priority: '中', remark: '' };
    setJournals(journals.map(j => j.id === activeJournalId ? {
      ...j, tasks: { ...j.tasks, [cat]: [...j.tasks[cat], newTask] }
    } : j));
  };

  const removeTask = (cat, taskId) => {
    setJournals(journals.map(j => j.id === activeJournalId ? {
      ...j, tasks: { ...j.tasks, [cat]: j.tasks[cat].filter(t => t.id !== taskId) }
    } : j));
  };

  const updateReview = (value) => {
    setJournals(journals.map(j => j.id === activeJournalId ? { ...j, review: value } : j));
  };

  const toggleExportSelection = (id) => {
    if (selectedForExport.includes(id)) {
      setSelectedForExport(selectedForExport.filter(item => item !== id));
    } else {
      setSelectedForExport([...selectedForExport, id]);
    }
  };

  // 生成 Markdown 用于导出
  const handleExportMarkdown = () => {
    if (selectedForExport.length === 0) {
      alert("请至少选择一天日记进行导出！");
      return;
    }
    
    let mdContent = `# 工作日志合并导出\n\n`;
    
    const selectedJournals = journals.filter(j => selectedForExport.includes(j.id)).sort((a, b) => b.id.localeCompare(a.id));
    
    selectedJournals.forEach(j => {
      mdContent += `## ${j.date} ${j.weekday}\n\n`;
      JOURNAL_CATEGORIES.forEach(cat => {
        if (j.tasks[cat] && j.tasks[cat].length > 0) {
          mdContent += `### ${cat}\n`;
          j.tasks[cat].forEach(t => {
            mdContent += `- **[${t.progress}]** ${t.content} (对接: ${t.contact || '-'}, 截止: ${t.deadline || '-'}, 优先级: ${t.priority})\n`;
            if (t.remark) {
              mdContent += `  > 备注: ${t.remark}\n`;
            }
          });
          mdContent += `\n`;
        }
      });
      if (j.review) {
        mdContent += `### 今日复盘\n${j.review}\n\n`;
      }
      mdContent += `---\n\n`;
    });

    console.log(mdContent);
    alert("已生成 Markdown 内容 (详见控制台)，可发给 AI 助手撰写周报！\n\n" + mdContent.substring(0, 200) + "...");
    setIsExportMode(false);
    setSelectedForExport([]);
  };

  return (
    <div className="flex-1 flex gap-4 h-full overflow-hidden">
      <div className="w-72 flex-shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden relative">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-white">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-600" />
            <h2 className="text-base font-black text-gray-800">我的工作日记</h2>
          </div>
          <button 
            onClick={() => { setIsExportMode(!isExportMode); setSelectedForExport([]); }}
            className={`p-1.5 rounded-lg transition-colors ${isExportMode ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
            title="批量导出 Markdown"
          >
            <DownloadCloud size={16} />
          </button>
        </div>
        
        {!isExportMode && (
          <div className="p-4 border-b border-gray-100">
            <button onClick={createTodayJournal} className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-200 active:scale-95 transition-all">
              <Plus size={16} /> 开启今日日记模板
            </button>
          </div>
        )}

        {isExportMode && (
          <div className="p-3 border-b border-blue-100 bg-blue-50 flex flex-col gap-2">
            <div className="text-xs font-bold text-blue-800">请选择要导出的日记：</div>
            <button 
              onClick={handleExportMarkdown}
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 shadow-sm"
            >
              导出选中 ({selectedForExport.length})
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-1">
          {Object.entries(groupedJournals).map(([month, monthJournals]) => (
            <div key={month} className="mb-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-2 py-1.5 sticky top-0 bg-white/90 backdrop-blur-sm z-10">
                {month}
              </div>
              <div className="flex flex-col gap-1">
                {monthJournals.map(j => (
                  <div key={j.id} className="flex items-center gap-2">
                    {isExportMode && (
                      <button onClick={() => toggleExportSelection(j.id)} className="shrink-0 text-gray-400 hover:text-blue-600 transition-colors pl-1">
                        {selectedForExport.includes(j.id) ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} />}
                      </button>
                    )}
                    <button 
                      onClick={() => !isExportMode && setActiveJournalId(j.id)}
                      className={`flex-1 flex flex-col text-left px-3 py-2.5 rounded-xl transition-all border ${activeJournalId === j.id && !isExportMode ? 'bg-blue-50 border-blue-200 shadow-sm shadow-blue-100' : 'bg-white border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
                    >
                      <span className={`text-sm font-bold mb-0.5 ${activeJournalId === j.id && !isExportMode ? 'text-blue-700' : 'text-gray-800'}`}>{j.date}</span>
                      <span className="text-xs text-gray-500">{j.weekday}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-[#FAFAFA] border border-gray-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {activeJournal ? (
          <>
            <div className="p-6 border-b border-gray-200 bg-white shrink-0 flex items-center justify-between z-10 shadow-sm">
              <div>
                <h2 className="text-3xl font-black text-gray-800 tracking-tight">{activeJournal.date}</h2>
                <p className="text-sm font-medium text-gray-500 mt-1">{activeJournal.weekday} · 结构化工作记录</p>
              </div>
              <button className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm">
                <Save size={16} /> 保存当前进度
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 scrollbar-thin flex flex-col gap-8">
              {JOURNAL_CATEGORIES.map(cat => (
                <div key={cat} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-4 bg-blue-600 rounded-full"></div>{cat}
                    </h3>
                    <span className="text-xs font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{activeJournal.tasks[cat]?.length || 0} 项</span>
                  </div>
                  <div className="flex flex-col gap-4">
                    {activeJournal.tasks[cat]?.map((task) => (
                      <div key={task.id} className="group flex flex-col gap-2.5 p-3.5 bg-gray-50/50 border border-gray-100 rounded-xl hover:border-blue-200 hover:shadow-sm transition-all relative">
                        <button onClick={() => removeTask(cat, task.id)} className="absolute -right-2 -top-2 w-6 h-6 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10"><Trash2 size={12} /></button>
                        
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={18} className={`shrink-0 mt-0.5 ${task.progress === '已完成' ? 'text-emerald-500' : 'text-gray-300'}`} />
                          <div className="flex-1">
                            <input type="text" placeholder="填写工作事项内容..." value={task.content} onChange={(e) => updateTask(cat, task.id, 'content', e.target.value)} className={`w-full bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none text-sm px-1 py-0.5 transition-colors ${task.progress === '已完成' ? 'text-gray-400 line-through' : 'text-gray-800 font-bold'}`} />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-6">
                          <div className="flex items-center gap-1.5 text-xs"><User size={14} className="text-gray-400" /><span className="text-gray-500">对接人:</span>
                            <input type="text" placeholder="联系方式" value={task.contact} onChange={(e) => updateTask(cat, task.id, 'contact', e.target.value)} className="w-28 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none text-gray-700 px-1" />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs"><Clock size={14} className="text-gray-400" /><span className="text-gray-500">截止:</span>
                            <input type="text" placeholder="时间节点" value={task.deadline} onChange={(e) => updateTask(cat, task.id, 'deadline', e.target.value)} className="w-24 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 focus:outline-none text-gray-700 px-1" />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs"><ActivityIcon progress={task.progress} /><span className="text-gray-500">进度:</span>
                            <select value={task.progress} onChange={(e) => updateTask(cat, task.id, 'progress', e.target.value)} className={`appearance-none bg-transparent border-b border-dashed border-gray-300 focus:outline-none cursor-pointer pl-1 pr-4 py-0.5 font-bold ${task.progress === '未开始' ? 'text-gray-500' : task.progress === '进行中' ? 'text-blue-600' : task.progress === '卡点等待' ? 'text-amber-500' : 'text-emerald-600'}`}>
                              <option className="text-gray-900" value="未开始">未开始</option><option className="text-gray-900" value="进行中">进行中</option><option className="text-gray-900" value="卡点等待">卡点等待</option><option className="text-gray-900" value="已完成">已完成</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs ml-auto"><AlertCircle size={14} className="text-gray-400" /><span className="text-gray-500">优先级:</span>
                            <select value={task.priority} onChange={(e) => updateTask(cat, task.id, 'priority', e.target.value)} className={`appearance-none bg-transparent border-b border-dashed border-gray-300 focus:outline-none cursor-pointer pl-1 pr-4 py-0.5 font-bold ${task.priority === '高' ? 'text-red-600' : task.priority === '中' ? 'text-amber-500' : 'text-gray-500'}`}>
                              <option className="text-gray-900" value="高">高</option><option className="text-gray-900" value="中">中</option><option className="text-gray-900" value="低">低</option>
                            </select>
                          </div>
                        </div>

                        {/* 详细备注输入框 */}
                        <div className="pl-6 mt-1">
                          <textarea 
                            value={task.remark || ''} 
                            onChange={(e) => updateTask(cat, task.id, 'remark', e.target.value)} 
                            placeholder="添加详细备注说明、链接或草稿（支持多行）..." 
                            className="w-full bg-white/60 border border-gray-200 rounded-lg p-2.5 text-xs text-gray-700 focus:outline-none focus:border-blue-400 focus:bg-white transition-all resize-none min-h-[60px]"
                          ></textarea>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => addTask(cat)} className="flex items-center gap-1.5 py-2 px-3 text-sm font-medium text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors border border-dashed border-transparent hover:border-blue-200 self-start">
                      <Plus size={16} /> 添加 {cat} 事项
                    </button>
                  </div>
                </div>
              ))}
              <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-5 shadow-sm mt-4">
                <div className="flex items-center gap-2 mb-3"><MessageSquare size={18} className="text-amber-500" /><h3 className="text-base font-bold text-amber-800">今日复盘与备忘</h3></div>
                <textarea value={activeJournal.review} onChange={(e) => updateReview(e.target.value)} placeholder="记录今天的经验教训、卡点分析，或者给明天留下的备忘事项..." className="w-full h-32 bg-white/60 border border-amber-200/50 rounded-xl p-4 text-sm text-gray-800 placeholder-amber-700/30 focus:outline-none focus:bg-white focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all resize-none"></textarea>
              </div>
              <div className="h-10"></div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
             <CalendarDays size={48} className="text-gray-300 mb-4 opacity-50" />
             <p className="text-lg font-bold text-gray-500 mb-2">未选择任何日记</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 9. 顶级 App 入口
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState('journal');
  
  return (
    <div className="h-screen bg-[#F3F3F3] font-sans flex flex-col overflow-hidden text-gray-900">
      <div className="bg-white border-b border-gray-200 flex items-center px-4 pt-2 gap-1 select-none shrink-0 shadow-sm overflow-x-auto">
        <TabButton icon={<FolderTree size={16} />} label="虚拟业务空间" isActive={activeTab === 'workspace'} onClick={() => setActiveTab('workspace')} />
        <TabButton icon={<BarChart3 size={16} />} label="台账数据看台" isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
        <TabButton icon={<BookOpen size={16} />} label="SOP脑图笔记" isActive={activeTab === 'notes'} onClick={() => setActiveTab('notes')} />
        <TabButton icon={<CalendarDays size={16} />} label="工作日记本" isActive={activeTab === 'journal'} onClick={() => setActiveTab('journal')} />
        
        <div className="flex-1"></div>
        <button className="flex items-center gap-2 px-4 py-1.5 mb-1.5 mr-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all group shrink-0">
          <Settings size={18} className="group-hover:rotate-45 transition-transform duration-500" />
          <span className="text-sm font-bold">全局设置</span>
        </button>
      </div>
      <div className="flex-1 flex overflow-hidden p-4">
        {activeTab === 'workspace' && <VirtualWorkspaceView />}
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'notes' && <NotesWorkspaceView />}
        {activeTab === 'journal' && <JournalWorkspaceView />}
      </div>
    </div>
  );
}