import React, { useState, useEffect, useMemo } from 'react';
import { Search, Shuffle } from 'lucide-react';
import { EMOJI_DATA, EmojiItem } from '../../lib/emojiData';
import { ICON_DATA, IconItem, PRESET_COLORS } from '../../lib/iconData';
import { IconConfig } from '../../lib/iconTypes';
import { DynamicIcon } from './DynamicIcon';
import { Tooltip, TooltipProvider } from './Tooltip'; 

interface IconPickerProps {
  onSelect: (config: IconConfig | null) => void;
  onClose: () => void;
  currentIconConfig?: IconConfig | null;
}

const RECENT_KEY = 'skillhub_recent_icons';
const MAX_RECENT = 14;

export const IconPicker: React.FC<IconPickerProps> = ({ onSelect, onClose, currentIconConfig }) => {
  const [activeTab, setActiveTab] = useState<'icon' | 'emoji'>(currentIconConfig?.type === 'emoji' ? 'emoji' : 'icon');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(currentIconConfig?.type === 'icon' && currentIconConfig.color ? currentIconConfig.color : PRESET_COLORS[0]);
  const [recentIcons, setRecentIcons] = useState<IconConfig[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const groupRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  // Load recents on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      if (saved) {
        setRecentIcons(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to load recent icons', e);
    }
  }, []);

  // Save recent icon
  const handleSelect = (config: IconConfig | null) => {
    if (config) {
      try {
        const newRecents = [config, ...recentIcons.filter(
          item => !(item.type === config.type && item.value === config.value)
        )].slice(0, MAX_RECENT);
        setRecentIcons(newRecents);
        localStorage.setItem(RECENT_KEY, JSON.stringify(newRecents));
      } catch (e) {
        console.error('Failed to save recent icon', e);
      }
    }
    onSelect(config);
    onClose();
  };

  const handleRandom = () => {
    if (activeTab === 'emoji') {
      const allEmojis = EMOJI_DATA.flatMap(g => g.emojis);
      const randomEmoji = allEmojis[Math.floor(Math.random() * allEmojis.length)];
      handleSelect({ type: 'emoji', value: randomEmoji.char });
    } else {
      const allIcons = ICON_DATA.flatMap(g => g.icons);
      const randomIcon = allIcons[Math.floor(Math.random() * allIcons.length)];
      handleSelect({ type: 'icon', value: randomIcon.id, color: selectedColor });
    }
  };

  // Filter Emojis
  const filteredEmojis = useMemo(() => {
    if (!searchTerm) return EMOJI_DATA;
    const lowerTerm = searchTerm.toLowerCase();
    return EMOJI_DATA.map(group => ({
      ...group,
      emojis: group.emojis.filter(e => 
        e.name_zh.includes(lowerTerm) || 
        e.name_en.toLowerCase().includes(lowerTerm) || 
        e.keywords.some(k => k.toLowerCase().includes(lowerTerm))
      )
    })).filter(group => group.emojis.length > 0);
  }, [searchTerm]);

  // Filter Icons
  const filteredIcons = useMemo(() => {
    if (!searchTerm) return ICON_DATA;
    const lowerTerm = searchTerm.toLowerCase();
    return ICON_DATA.map(group => ({
      ...group,
      icons: group.icons.filter(i => 
        i.name_zh.includes(lowerTerm) || 
        i.id.toLowerCase().includes(lowerTerm) || 
        i.keywords.some(k => k.toLowerCase().includes(lowerTerm))
      )
    })).filter(group => group.icons.length > 0);
  }, [searchTerm]);

  const scrollToGroup = (name: string) => {
    const el = groupRefs.current[name];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - scrollRef.current.offsetTop, behavior: 'smooth' });
    }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="w-[320px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-3 pt-2 border-b border-gray-100">
        <div className="flex gap-4">
          <button
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'icon' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
            onClick={() => { setActiveTab('icon'); setSearchTerm(''); }}
          >
            图标
          </button>
          <button
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'emoji' ? 'text-gray-900 border-gray-900' : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
            onClick={() => { setActiveTab('emoji'); setSearchTerm(''); }}
          >
            表情符号
          </button>
        </div>
        <button
          onClick={() => handleSelect(null)}
          className="text-sm text-gray-500 hover:text-red-500 transition-colors pb-2"
        >
          移除
        </button>
      </div>

      {/* Toolbar: Search & Random & Color Picker */}
      <div className="p-3 pb-2 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
          <Tooltip content="随机">
            <button
              onClick={handleRandom}
              className="p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-colors"
            >
              <Shuffle size={16} />
            </button>
          </Tooltip>
        </div>
        
        {/* Color Picker (Only in Icon tab) */}
        {activeTab === 'icon' && (
          <div className="flex gap-2 pt-1 overflow-x-auto pb-1 px-1 -mx-1 no-scrollbar">
            {PRESET_COLORS.map(color => (
              <Tooltip key={color} content={color.toUpperCase()}>
                <button
                  onClick={() => setSelectedColor(color)}
                  className={`w-4 h-4 rounded-full shrink-0 transition-transform hover:scale-110`}
                  style={{ 
                    backgroundColor: color,
                    boxShadow: selectedColor === color ? `0 0 0 2px white, 0 0 0 3px ${color}` : undefined
                  }}
                />
              </Tooltip>
            ))}
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto max-h-[300px] p-3 pt-0 no-scrollbar">
        {/* Recent */}
        {!searchTerm && recentIcons.filter(rec => rec.type === activeTab).length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-400 mb-2">最近使用</h3>
            <div className="grid grid-cols-9 gap-[2px]">
              {recentIcons.filter(rec => rec.type === activeTab).map((rec, i) => (
                <Tooltip key={i} content={rec.type === 'emoji' ? '表情' : '图标'}>
                  <button
                    className="aspect-square w-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-lg"
                    onClick={() => handleSelect(rec.type === 'icon' && activeTab === 'icon' ? { ...rec, color: selectedColor } : rec)}
                  >
                    <DynamicIcon config={rec.type === 'icon' && activeTab === 'icon' ? { ...rec, color: selectedColor } : rec} size={20} />
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* Emoji Content */}
        {activeTab === 'emoji' && (
          <div className="space-y-4">
            {filteredEmojis.map(group => (
              <div key={group.name} ref={el => { groupRefs.current[group.name] = el; }}>
                <h3 className="text-xs font-semibold text-gray-400 mb-2">{group.name}</h3>
                <div className="grid grid-cols-9 gap-[2px]">
                  {group.emojis.map((emoji: EmojiItem) => (
                    <Tooltip key={emoji.char} content={emoji.name_zh}>
                      <button
                        className="aspect-square w-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-xl"
                        onClick={() => handleSelect({ type: 'emoji', value: emoji.char })}
                      >
                        {emoji.char}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
            {filteredEmojis.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-500">
                未找到表情
              </div>
            )}
          </div>
        )}

        {/* Icon Content */}
        {activeTab === 'icon' && (
          <div className="space-y-4">
            {filteredIcons.map(group => (
              <div key={group.name} ref={el => { groupRefs.current[group.name] = el; }}>
                <h3 className="text-xs font-semibold text-gray-400 mb-2">{group.name}</h3>
                <div className="grid grid-cols-9 gap-[2px]">
                  {group.icons.map((icon: IconItem) => (
                    <Tooltip key={icon.id} content={icon.name_zh}>
                      <button
                        className="aspect-square w-7 flex items-center justify-center rounded hover:bg-gray-100 transition-colors text-gray-700"
                        onClick={() => handleSelect({ type: 'icon', value: icon.id, color: selectedColor })}
                      >
                        <DynamicIcon config={{ type: 'icon', value: icon.id, color: selectedColor }} size={20} />
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
            {filteredIcons.length === 0 && (
              <div className="text-center py-8 text-sm text-gray-500">
                未找到图标
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Group Nav */}
      <div className="flex justify-between items-center px-3 py-1.5 border-t border-gray-100 bg-gray-50/80">
        {(activeTab === 'emoji' ? EMOJI_DATA : ICON_DATA).map(group => (
          <Tooltip key={group.name} content={group.name}>
             <button onClick={() => scrollToGroup(group.name)} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200/50 transition-colors">
                <DynamicIcon config={{ type: 'icon', value: group.groupIcon, color: 'currentColor' }} size={16} />
             </button>
          </Tooltip>
        ))}
      </div>
    </div>
    </TooltipProvider>
  );
};
