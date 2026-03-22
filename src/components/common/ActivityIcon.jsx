import { Check, Clock, RotateCcw } from "lucide-react";

const ActivityIcon = ({ progress }) => {
  if (progress === "已完成") return <Check size={14} className="text-emerald-500" />;
  if (progress === "卡点等待") return <Clock size={14} className="text-amber-500" />;
  if (progress === "进行中") return <RotateCcw size={14} className="text-blue-500" />;
  return <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-300 mx-0.5"></div>;
};

export default ActivityIcon;
