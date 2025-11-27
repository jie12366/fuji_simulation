
import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8" onClick={onClose}>
      <div 
        className="w-full max-w-4xl bg-[#121212] border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#181818]">
          <div>
            <h2 className="text-xl font-black text-white tracking-widest uppercase">
              ProGrade <span className="text-fuji-accent">Ultra</span> 使用指南
            </h2>
            <p className="text-xs text-gray-500 mt-1 font-mono">USER MANUAL & WORKFLOW</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-full transition-colors text-gray-400 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 text-sm text-gray-300 leading-relaxed">
          
          {/* Section 1: Quick Start */}
          <section>
            <h3 className="text-fuji-accent font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-xl">🚀</span> 快速开始 (Quick Start)
            </h3>
            <div className="bg-[#1a1a1a] p-4 rounded-lg border border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <strong className="text-white block mb-1">1. 导入图片</strong>
                <p className="text-xs text-gray-500">点击右上角的文件夹图标，支持 JPG/PNG 以及各大厂商的 RAW 格式 (DNG, ARW, NEF 等)。</p>
              </div>
              <div>
                <strong className="text-white block mb-1">2. 选择风格</strong>
                <p className="text-xs text-gray-500">使用「智能工作流」中的“大师预设”一键调色，或选择一款经典的“胶片模拟”。</p>
              </div>
              <div>
                <strong className="text-white block mb-1">3. 导出成品</strong>
                <p className="text-xs text-gray-500">点击底部的绿色“导出”按钮下载高清大图。支持批量处理多张图片。</p>
              </div>
            </div>
          </section>

          {/* Section 2: AI Workflow */}
          <section>
            <h3 className="text-fuji-accent font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-xl">✨</span> AI 智能调色 (AI Workflow)
            </h3>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>
                <strong className="text-gray-200">全自动分析：</strong> 在「快速选择 AI 风格」中选择一个场景（如“赛博朋克”），AI 会自动分析画面内容并生成参数。
              </li>
              <li>
                <strong className="text-gray-200">自定义 Prompt：</strong> 您也可以在输入框中输入自然语言（例如：“像韦斯·安德森电影那样的暖黄色调”），点击“AI 智能调色”即可执行。
              </li>
              <li>
                <strong className="text-gray-200">无损逻辑：</strong> AI 不会直接修改图片像素，而是生成一套可二次编辑的参数（曲线、HSL 等）。
              </li>
            </ul>
          </section>

          {/* Section 3: Local Adjustments */}
          <section>
            <h3 className="text-fuji-accent font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-xl">🖌️</span> 局部调整与蒙版 (Local & Masking)
            </h3>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <p className="mb-2">ProGrade Ultra 支持非破坏性的图层编辑：</p>
                <ol className="list-decimal pl-5 space-y-1 text-gray-400">
                  <li>点击 <strong>“局部 (LOCAL)”</strong> 选项卡。</li>
                  <li>点击 <strong>“+ 新建蒙版”</strong>。</li>
                  <li>在画布上涂抹（红色区域代表蒙版覆盖范围）。</li>
                  <li>调整下方的“局部参数”（如曝光、冷暖），仅对涂抹区域生效。</li>
                </ol>
              </div>
              <div className="flex-1 bg-[#1a1a1a] p-3 rounded border border-gray-800 text-xs">
                <div className="font-bold text-white mb-2">💡 技巧提示</div>
                <ul className="space-y-1 text-gray-500">
                  <li>• <strong>滚轮：</strong> 缩放画布</li>
                  <li>• <strong>空格+拖拽：</strong> 在涂抹模式下临时平移画布</li>
                  <li>• <strong>橡皮擦：</strong> 修正涂抹边缘</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 4: Pro Tools */}
          <section>
            <h3 className="text-fuji-accent font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-xl">🎛️</span> 专业参数详解 (Pro Tools)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-[#1a1a1a] p-2 rounded">
                <span className="text-fuji-accent font-bold block">HSL</span>
                独立控制 6 种颜色的色相、饱和度、明度。
              </div>
              <div className="bg-[#1a1a1a] p-2 rounded">
                <span className="text-fuji-accent font-bold block">分级 (Grading)</span>
                好莱坞电影级的三路（阴影/中间调/高光）色轮调色。
              </div>
              <div className="bg-[#1a1a1a] p-2 rounded">
                <span className="text-fuji-accent font-bold block">光晕 (Halation)</span>
                模拟胶片高光溢出的柔光效果，增加空气感。
              </div>
              <div className="bg-[#1a1a1a] p-2 rounded">
                <span className="text-fuji-accent font-bold block">质感 (Texture)</span>
                智能锐化（仅增强细节不噪点）与物理胶片颗粒模拟。
              </div>
            </div>
          </section>

          {/* Section 5: Batch */}
          <section>
            <h3 className="text-fuji-accent font-bold text-base mb-3 flex items-center gap-2">
              <span className="text-xl">📦</span> 批量处理 (Batch Processing)
            </h3>
            <p className="text-gray-400 mb-2">
              修好一张图后，点击左下角的 <strong>“批量处理 (BATCH)”</strong> 按钮，上传多张图片。系统会自动将当前所有的参数（包括胶片、曲线、锐化等）应用到所有新图片上，并打包下载。
            </p>
            <p className="text-xs text-gray-500">* 注意：局部蒙版无法批量应用，因为每张图的内容位置不同。</p>
          </section>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-[#181818] flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-fuji-accent text-black font-bold rounded hover:bg-white transition-colors uppercase tracking-wider text-xs"
          >
            开始创作 (Start Creating)
          </button>
        </div>
      </div>
    </div>
  );
};
