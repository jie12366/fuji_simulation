
import React from 'react';
import { Adjustments, FilmSimulation } from '../types';

interface ControlsProps {
  currentFilm: FilmSimulation;
  onFilmChange: (f: FilmSimulation) => void;
  adjustments: Adjustments;
  onAdjustmentChange: (key: keyof Adjustments, val: number) => void;
  filterIntensity: number;
  onIntensityChange: (val: number) => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownload: () => void;
  isProcessing: boolean;
}

const Slider = ({ label, value, min, max, onChange }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) => (
  <div className="mb-4">
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>{label}</span>
      <span>{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-fuji-accent hover:accent-green-400"
    />
  </div>
);

export const Controls: React.FC<ControlsProps> = ({
  currentFilm,
  onFilmChange,
  adjustments,
  onAdjustmentChange,
  filterIntensity,
  onIntensityChange,
  onUpload,
  onDownload,
  isProcessing
}) => {
  return (
    <div className="w-full lg:w-80 bg-fuji-800 p-6 flex flex-col h-auto lg:h-full border-b lg:border-b-0 lg:border-r border-gray-700 overflow-y-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-wider mb-1">FUJISIM</h1>
        <p className="text-xs text-fuji-accent uppercase tracking-widest font-semibold">富士胶片模拟引擎</p>
      </div>

      {/* Upload Section */}
      <div className="mb-8">
        <label className="block w-full cursor-pointer bg-gray-700 hover:bg-gray-600 transition-colors text-white text-center py-3 px-4 rounded-md border border-gray-600 border-dashed">
          <span className="flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            打开照片
          </span>
          <input type="file" className="hidden" accept="image/*" onChange={onUpload} />
        </label>
      </div>

      {/* Filter Selection */}
      <div className="mb-6 pb-6 border-b border-gray-700">
        <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 tracking-wide">胶片模拟 (Simulation)</h3>
        <select
          value={currentFilm}
          onChange={(e) => onFilmChange(e.target.value as FilmSimulation)}
          className="w-full bg-gray-900 text-white border border-gray-700 rounded px-3 py-2 mb-4 focus:outline-none focus:border-fuji-accent text-sm"
        >
          {Object.values(FilmSimulation).map((film) => (
            <option key={film} value={film}>{film}</option>
          ))}
        </select>
        
        <Slider 
          label="滤镜强度 (Intensity)" 
          value={Math.round(filterIntensity * 100)} 
          min={0} 
          max={100} 
          onChange={(v) => onIntensityChange(v / 100)} 
        />
      </div>

      {/* Adjustments */}
      <div className="flex-1 mb-6">
        <h3 className="text-sm font-bold text-gray-300 uppercase mb-4 tracking-wide">后期调整 (Adjust)</h3>
        <Slider 
          label="亮度 (Brightness)" 
          value={adjustments.brightness} 
          min={-100} max={100} 
          onChange={(v) => onAdjustmentChange('brightness', v)} 
        />
        <Slider 
          label="对比度 (Contrast)" 
          value={adjustments.contrast} 
          min={-100} max={100} 
          onChange={(v) => onAdjustmentChange('contrast', v)} 
        />
        <Slider 
          label="高光 (Highlights)" 
          value={adjustments.highlights} 
          min={-100} max={100} 
          onChange={(v) => onAdjustmentChange('highlights', v)} 
        />
        <Slider 
          label="阴影 (Shadows)" 
          value={adjustments.shadows} 
          min={-100} max={100} 
          onChange={(v) => onAdjustmentChange('shadows', v)} 
        />
        <Slider 
          label="饱和度 (Saturation)" 
          value={adjustments.saturation} 
          min={-100} max={100} 
          onChange={(v) => onAdjustmentChange('saturation', v)} 
        />
      </div>

      {/* Download Action */}
      <div className="mt-auto pt-4 border-t border-gray-700">
        <button
          onClick={onDownload}
          disabled={isProcessing}
          className={`w-full py-3 px-4 rounded font-bold text-fuji-900 transition-colors flex justify-center items-center gap-2
            ${isProcessing ? 'bg-gray-500 cursor-not-allowed' : 'bg-fuji-accent hover:bg-green-400'}
          `}
        >
          {isProcessing ? '处理中...' : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              保存图片
            </>
          )}
        </button>
      </div>
    </div>
  );
};
