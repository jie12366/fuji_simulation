import React, { useState } from 'react';
import { Adjustments, FilmSimulation, HistogramData, HSLAdjustments, GradingAdjustments } from '../types';
import { Histogram } from './Histogram';

interface ControlsProps {
  currentFilm: FilmSimulation;
  onFilmChange: (f: FilmSimulation) => void;
  adjustments: Adjustments;
  onAdjustmentChange: (key: keyof Adjustments, val: number) => void;
  onHSLChange: (color: keyof HSLAdjustments, param: 'h'|'s'|'l', val: number) => void;
  onWBChange: (param: 'temp'|'tint', val: number) => void;
  onGradingChange: (region: keyof GradingAdjustments, param: 'h'|'s', val: number) => void;
  
  filterIntensity: number;
  onIntensityChange: (val: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  onBatchUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  onApplyPreset: (name: string, adjustments: Partial<Adjustments>) => void;

  isProcessing: boolean;
  histogramData: HistogramData | null;
  isAIAnalyzing?: boolean;
  onAIAuto?: (hint: string) => void;
}

// Compact Slider Component
const Slider = ({ label, value, min, max, onChange, unit = '', bgClass = '' }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void, unit?: string, bgClass?: string }) => (
  <div className="mb-3 group">
    <div className="flex justify-between text-[10px] text-gray-500 mb-1.5 font-medium tracking-wide">
      <span className="group-hover:text-gray-300 transition-colors">{label}</span>
      <span className="font-mono text-fuji-accent opacity-80 group-hover:opacity-100">{value > 0 ? `+${value}` : value}{unit}</span>
    </div>
    <div className="relative h-5 flex items-center">
        {/* Center line for reference */}
        <div className="absolute left-1/2 top-1 bottom-1 w-[1px] bg-gray-700"></div>
        <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`relative z-10 w-full ${bgClass}`}
        />
    </div>
  </div>
);

// Segmented Control Tab
const TabButton = ({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) => (
  <button
    onClick={onClick}
    className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all rounded-md ${
      active 
      ? 'text-black bg-white shadow-lg' 
      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
    }`}
  >
    {label}
  </button>
);

const PRESET_PROMPTS = [
    { label: '🏔️ 专业风光 (Landscape)', value: 'Professional Landscape: High dynamic range, vivid but natural colors, enhance blue skies and green foliage, sharp details.' },
    { label: '👩 电影人像 (Portrait)', value: 'Cinematic Portrait: Flattering skin tones, soft contrast, focus on the subject, slight warm color grading, smooth texture.' },
    { label: '🏙️ 人文街拍 (Street)', value: 'Urban Street Photography: High contrast, gritty texture, dramatic lighting, desaturated cool tones, Leica style.' },
    { label: '🌃 赛博朋克 (Cyberpunk)', value: 'Cyberpunk Night: Neon aesthetics, high halation/bloom, vibrant teal and magenta colors, deep blacks, high contrast.' },
    { label: '🍃 日系空气感 (Airy)', value: 'Japanese Airy Style: High key exposure, low contrast, slightly overexposed, pastel colors, soft dreamy feeling.' },
];

const MASTER_PRESETS = [
    { name: "纯净通透 (Clean Studio)", adj: { brightness: 5, contrast: 10, saturation: 5, highlights: -10, shadows: 10, sharpening: 40, whiteBalance: { temp: 0, tint: 0 } } },
    { name: "黑金质感 (Dark Gold)", adj: { brightness: -15, contrast: 20, saturation: -10, highlights: -20, shadows: -5, sharpening: 50, whiteBalance: { temp: 10, tint: 0 }, grading: { shadows: {h: 210, s: 20}, midtones: {h: 40, s: 15}, highlights: {h: 45, s: 10} } } },
    { name: "青橙电影 (Teal & Orange)", adj: { contrast: 15, saturation: 10, sharpening: 30, grading: { shadows: {h: 190, s: 30}, midtones: {h: 0, s: 0}, highlights: {h: 35, s: 30} } } },
    { name: "森系胶片 (Soft Forest)", adj: { brightness: 10, contrast: -10, saturation: 0, highlights: -30, shadows: 20, sharpening: 20, whiteBalance: { temp: 5, tint: 10 }, hsl: { green: {h: 10, s: -10, l: 0} } } },
    { name: "极简黑白 (Mono Art)", adj: { saturation: -100, contrast: 25, highlights: 10, shadows: -10, sharpening: 60, grainAmount: 15 } },
    { name: "赛博霓虹 (Cyber Neon)", adj: { contrast: 20, saturation: 30, halation: 30, sharpening: 40, whiteBalance: { temp: -20, tint: 20 }, hsl: { blue: {h: -10, s: 20, l: 0}, magenta: {h: 10, s: 20, l: 0} } } }
];

export const Controls: React.FC<ControlsProps> = ({
  currentFilm, onFilmChange, adjustments, onAdjustmentChange, onHSLChange, onWBChange, onGradingChange,
  filterIntensity, onIntensityChange, onUpload, onDownload, onBatchUpload, onReset, onApplyPreset,
  isProcessing, histogramData, isAIAnalyzing, onAIAuto,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'color' | 'grading' | 'fx'>('basic');
  const [aiPrompt, setAiPrompt] = useState('');

  const handleMasterPresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedName = e.target.value;
      const preset = MASTER_PRESETS.find(p => p.name === selectedName);
      if (preset) {
          onApplyPreset(preset.name, preset.adj as any);
          e.target.value = "";
      }
  };

  return (
    <>
      <div className="w-full lg:w-[360px] bg-[#0c0c0c] flex flex-col h-auto lg:h-full border-b lg:border-b-0 lg:border-r border-gray-800/50 shadow-2xl z-20 font-sans">
        
        {/* Header */}
        <div className="px-5 py-4 flex justify-between items-center bg-[#0c0c0c]">
          <div className="select-none">
            <h1 className="text-lg font-black text-gray-200 tracking-widest leading-none">PROGRADE <span className="text-fuji-accent">ULTRA</span></h1>
          </div>
          <div className="flex gap-2">
            <label title="导入图片" className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white p-1.5 rounded-md transition-colors border border-gray-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                <input type="file" className="hidden" accept="image/*,.dng,.nef,.arw,.cr2,.orf,.rw2,.raf" onChange={onUpload} />
            </label>
            <button type="button" onClick={onReset} title="重置参数" className="bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 p-1.5 rounded-md transition-colors border border-gray-700">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5">
            
            {/* 1. Smart Workflow Module */}
            <div className="mb-5 p-4 rounded-xl border border-gray-800/50 bg-[#111] shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-fuji-accent to-transparent opacity-50"></div>
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <svg className="w-3 h-3 text-fuji-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                   智能工作流 (Smart Workflow)
                </h3>

                {/* AI & Presets Compact Grid */}
                <div className="grid grid-cols-1 gap-2.5">
                    {/* Master Presets */}
                    <div className="relative">
                         <select onChange={handleMasterPresetChange} defaultValue="" className="w-full bg-[#181818] hover:bg-[#202020] text-gray-300 text-[11px] border border-gray-700/50 rounded-lg px-3 py-2 focus:outline-none focus:border-fuji-accent/50 appearance-none transition-all font-medium">
                            <option value="" disabled>🎨 应用大师预设 (Apply Preset)...</option>
                            {MASTER_PRESETS.map((p, i) => <option key={i} value={p.name}>{p.name}</option>)}
                        </select>
                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                             <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>

                    {/* AI Logic */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                             <select 
                                onChange={(e) => setAiPrompt(e.target.value)} 
                                value=""
                                className="w-full bg-[#181818] hover:bg-[#202020] text-fuji-accent text-[11px] border border-gray-700/50 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-fuji-accent/50 appearance-none font-medium"
                             >
                                <option value="" disabled>⚡️ AI 风格分析...</option>
                                {PRESET_PROMPTS.map((p, i) => <option key={i} value={p.value}>{p.label}</option>)}
                             </select>
                             <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-fuji-accent">
                                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                        <button 
                             onClick={() => onAIAuto && onAIAuto(aiPrompt)} 
                             disabled={isAIAnalyzing || !histogramData} 
                             className={`px-3 rounded-lg text-[10px] font-bold tracking-wider uppercase border border-transparent transition-all shadow-lg ${
                                 isAIAnalyzing || !histogramData 
                                 ? 'bg-gray-800 text-gray-600' 
                                 : 'bg-fuji-accent text-black hover:bg-white hover:shadow-fuji-accent/40'
                             }`}
                        >
                            {isAIAnalyzing ? '...' : 'AUTO'}
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. Monitor */}
            {histogramData && <Histogram data={histogramData} />}

            {/* 3. Film Simulation */}
            <div className="mb-6 mt-6">
                <div className="flex justify-between items-center mb-2 px-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Film Profile</span>
                    <span className="text-[10px] font-mono text-fuji-accent">{Math.round(filterIntensity * 100)}%</span>
                </div>
                <div className="relative mb-3">
                    <select 
                        value={currentFilm} 
                        onChange={(e) => onFilmChange(e.target.value as FilmSimulation)} 
                        className="w-full bg-[#161616] text-gray-200 border border-gray-700 rounded-lg px-3 py-2.5 focus:outline-none focus:border-fuji-accent text-xs font-medium appearance-none shadow-sm"
                    >
                        {Object.values(FilmSimulation).map((film) => <option key={film} value={film}>{film}</option>)}
                    </select>
                    <div className="absolute top-3 right-3 pointer-events-none text-gray-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path></svg>
                    </div>
                </div>
                {/* Slim Intensity Slider */}
                <input 
                    type="range" min={0} max={100} value={filterIntensity * 100} 
                    onChange={(e) => onIntensityChange(Number(e.target.value) / 100)} 
                    className="w-full h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-fuji-accent"
                />
            </div>

            {/* 4. Manual Controls */}
            <div className="bg-[#111] rounded-xl border border-gray-800/50 p-1">
                {/* Segmented Tabs */}
                <div className="flex p-1 bg-black/40 rounded-lg mb-4">
                    <TabButton active={activeTab === 'basic'} onClick={() => setActiveTab('basic')} label="Basic" />
                    <TabButton active={activeTab === 'color'} onClick={() => setActiveTab('color')} label="Color" />
                    <TabButton active={activeTab === 'grading'} onClick={() => setActiveTab('grading')} label="Grade" />
                    <TabButton active={activeTab === 'fx'} onClick={() => setActiveTab('fx')} label="FX" />
                </div>
                
                <div className="px-3 pb-3 min-h-[300px]">
                    {activeTab === 'basic' && (
                        <div className="animate-fadeIn space-y-1">
                            <Slider label="曝光 (Exposure)" value={adjustments.brightness} min={-100} max={100} onChange={(v) => onAdjustmentChange('brightness', v)} />
                            <Slider label="对比度 (Contrast)" value={adjustments.contrast} min={-100} max={100} onChange={(v) => onAdjustmentChange('contrast', v)} />
                            <Slider label="高光 (Highlights)" value={adjustments.highlights} min={-100} max={100} onChange={(v) => onAdjustmentChange('highlights', v)} />
                            <Slider label="阴影 (Shadows)" value={adjustments.shadows} min={-100} max={100} onChange={(v) => onAdjustmentChange('shadows', v)} />
                            <Slider label="饱和度 (Saturation)" value={adjustments.saturation} min={-100} max={100} onChange={(v) => onAdjustmentChange('saturation', v)} />
                            <div className="h-4"></div>
                            <Slider label="色温 (Temp)" value={adjustments.whiteBalance.temp} min={-50} max={50} onChange={(v) => onWBChange('temp', v)} bgClass="bg-gradient-to-r from-blue-900/30 via-gray-700/30 to-yellow-900/30 rounded-full h-1" />
                            <Slider label="色调 (Tint)" value={adjustments.whiteBalance.tint} min={-50} max={50} onChange={(v) => onWBChange('tint', v)} bgClass="bg-gradient-to-r from-green-900/30 via-gray-700/30 to-fuchsia-900/30 rounded-full h-1" />
                        </div>
                    )}
                    {/* Other tabs logic kept similar but wrapped in fadeIn */}
                     {activeTab === 'color' && (
                        <div className="animate-fadeIn space-y-4">
                           {(['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'] as const).map((color) => (
                              <div key={color} className="border-l-2 border-gray-800 pl-3">
                                 <div className="text-[9px] font-bold uppercase text-gray-500 mb-2 tracking-wider flex items-center gap-2">
                                     <div className={`w-1.5 h-1.5 rounded-full bg-${color === 'magenta' ? 'fuchsia-500' : color === 'cyan' ? 'cyan-400' : color + '-500'}`}></div>
                                     {color}
                                 </div>
                                 <div className="grid grid-cols-1 gap-1">
                                    <Slider label="Hue" value={adjustments.hsl[color].h} min={-30} max={30} onChange={(v) => onHSLChange(color, 'h', v)} />
                                    <Slider label="Sat" value={adjustments.hsl[color].s} min={-100} max={100} onChange={(v) => onHSLChange(color, 's', v)} />
                                    <Slider label="Lum" value={adjustments.hsl[color].l} min={-100} max={100} onChange={(v) => onHSLChange(color, 'l', v)} />
                                 </div>
                              </div>
                           ))}
                        </div>
                    )}
                     {activeTab === 'grading' && (
                         <div className="animate-fadeIn space-y-6">
                            {(['shadows', 'midtones', 'highlights'] as const).map((region) => (
                              <div key={region} className="bg-[#0a0a0a] p-3 rounded-lg border border-gray-800">
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-3 text-center">{region}</h4>
                                <Slider label="Hue" value={adjustments.grading[region].h} min={0} max={360} onChange={(v) => onGradingChange(region, 'h', v)} bgClass="bg-gradient-to-r from-red-500 via-green-500 to-blue-500 rounded-full h-1.5 opacity-80" />
                                <Slider label="Sat" value={adjustments.grading[region].s} min={0} max={100} onChange={(v) => onGradingChange(region, 's', v)} />
                              </div>
                            ))}
                         </div>
                    )}
                    {activeTab === 'fx' && (
                        <div className="animate-fadeIn space-y-6">
                          <div>
                              <div className="text-[10px] font-bold text-gray-500 uppercase mb-3">Optics</div>
                              <Slider label="Halation (Bloom)" value={adjustments.halation} min={0} max={100} onChange={(v) => onAdjustmentChange('halation', v)} />
                              <Slider label="Vignette" value={adjustments.vignette} min={0} max={100} onChange={(v) => onAdjustmentChange('vignette', v)} />
                          </div>
                          <div>
                              <div className="text-[10px] font-bold text-gray-500 uppercase mb-3">Texture</div>
                              <Slider label="Sharpening" value={adjustments.sharpening} min={0} max={100} onChange={(v) => onAdjustmentChange('sharpening', v)} />
                              <Slider label="Grain" value={adjustments.grainAmount} min={0} max={100} onChange={(v) => onAdjustmentChange('grainAmount', v)} />
                              <Slider label="Size" value={adjustments.grainSize} min={1} max={5} onChange={(v) => onAdjustmentChange('grainSize', v)} />
                          </div>
                        </div>
                    )}
                </div>
            </div>

        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#0c0c0c] border-t border-gray-800 flex gap-2">
           <label className="flex-1 cursor-pointer">
             <div className="h-10 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center transition-colors">
                 Batch Processing
                 <input type="file" multiple className="hidden" accept="image/*,.dng,.nef,.arw,.cr2,.orf,.rw2,.raf" onChange={onBatchUpload} disabled={isProcessing} />
             </div>
           </label>
           <button 
             onClick={onDownload} 
             disabled={isProcessing} 
             className={`flex-[2] h-10 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                 isProcessing ? 'bg-gray-700 text-gray-500' : 'bg-fuji-accent text-black hover:bg-white hover:shadow-fuji-accent/50'
             }`}
            >
               {isProcessing ? 'Rendering...' : 'Export Image'}
           </button>
        </div>

      </div>
    </>
  );
};