import { createElement } from "react";
import { Briefcase, LayoutTemplate, Network, ShieldCheck, Star } from "lucide-react";

export const initialTableData = [
  { id: 1, year: '2025', district: '高新区', level: '省级', category: '祖冲之攻关计划', name: '面向高端科学仪器的高性能气相色谱...', enterprise: '苏州清碳科技有限公司', progress: '进行中', amount: 150.0 },
  { id: 2, year: '2025', district: '经开区', level: '市级', category: '祖冲之攻关计划', name: '6400MT/s速率的DDR5内存接口芯片研...', enterprise: '澜起电子科技(昆山)有限公司', progress: '已验收', amount: 80.0 },
  { id: 3, year: '2025', district: '主城区', level: '国家级', category: '国境外科技合作项目', name: '无人机集群智能协同技术研究', enterprise: '江苏智云天工科技有限公司', progress: '进行中', amount: 300.0 },
  { id: 4, year: '2024', district: '高新区', level: '省级', category: '重点研发计划', name: '新能源汽车核心部件轻量化技术开发', enterprise: '昆山长鹰硬质材料科技股份...', progress: '已验收', amount: 200.0 },
  { id: 5, year: '2024', district: '周市镇', level: '市级', category: '企业技术中心项目', name: '5G通信基站用高频高速覆铜板研发', enterprise: '苏州生益科技有限公司', progress: '未开始', amount: 50.0 },
  { id: 6, year: '2024', district: '高新区', level: '国家级', category: '重点研发计划', name: '第三代半导体功率器件研发与产业化', enterprise: '苏州能讯高能半导体有限公司', progress: '进行中', amount: 500.0 },
];

export const virtualSpaces = [
  { id: 'vs-1', name: '项目申报业务', icon: createElement(Briefcase, { size: 18 }), count: 12 },
  { id: 'vs-2', name: '安全生产台账', icon: createElement(ShieldCheck, { size: 18 }), count: 5 },
  { id: 'vs-3', name: '党建与活动组织', icon: createElement(Star, { size: 18 }), count: 8 },
  { id: 'vs-tpl', name: '常用模板中心', icon: createElement(LayoutTemplate, { size: 18 }), isTemplate: true },
  { id: 'vs-dir-engine', name: '目录结构引擎', icon: createElement(Network, { size: 18 }), isTool: true }
];

export const mappedItems = {
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

export const notebooks = [
  { id: 'nb-1', name: '业务SOP与流程', count: 4 },
  { id: 'nb-2', name: '系统操作指南', count: 2 },
  { id: 'nb-3', name: '个人经验沉淀', count: 7 }
];

export const notesList = {
  'nb-1': [
    { id: 'note-1', title: '高企申报全流程把控', lastSync: '10分钟前', path: 'D:\\Notes\\高企申报全流程.xmind', type: 'xmind' },
    { id: 'note-2', title: '重点研发计划立项评估流', lastSync: '昨天 15:30', path: 'D:\\Notes\\重点研发评估.xmind', type: 'xmind' },
    { id: 'note-3', title: '年度审计财务对接事项', lastSync: '3天前', path: 'D:\\Notes\\年度审计对接.xmind', type: 'xmind' }
  ]
};

export const mockMindMapData = {
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

export const initialJournals = [
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

