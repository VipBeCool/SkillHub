import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Folder, ChevronRight, Plus, Search, MoreHorizontal, Smile, Trash2, ExternalLink, ArrowRightLeft, Check, Edit2 } from 'lucide-react';
import { SourceDirectory } from '../../types';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string, children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.8 : 1,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

interface SkillLibrarySelectorProps {
  directories: SourceDirectory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDirectoriesChange: () => void;
  onCreateLibrary: () => void;
  onOpenLibrary: () => void;
  onMergeLibrary: () => void;
}

const EMOJIS = [
  '📁', '🎨', '💻', '📝', '✨', '🔥', '📚', '🚀', '💡', '🌟', '🛠️', '📦',
  '🎯', '✅', '🌈', '💎', '⚙️', '🔍', '📊', '⚡️', '🧠', '👑', '🎵', '🕹️',
  '🎬', '📸', '🎧', '🍎', '🍉', '☕️', '🏆', '🥇', '🔮', '🎉', '🎁', '🎈'
];

export function SkillLibrarySelector({ 
  directories, 
  selectedId, 
  onSelect, 
  onDirectoriesChange,
  onCreateLibrary,
  onOpenLibrary,
  onMergeLibrary
}: SkillLibrarySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    try {
      await invoke('rename_source_directory', { id, newLabel: renameValue.trim() });
      onDirectoriesChange();
    } catch (err) {
      console.error(err);
    }
    setRenamingId(null);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && menuRef.current.contains(target)) {
        return;
      }
      if ((target as HTMLElement).closest?.('[data-menu-button]')) {
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
      setMenuOpenId(null);
      setIconPickerId(null);
      setMenuPos(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close floating menu on scroll or resize
  useEffect(() => {
    if (!menuOpenId) return;
    const handleScrollOrResize = () => {
      setMenuOpenId(null);
      setIconPickerId(null);
      setMenuPos(null);
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [menuOpenId]);

  // Local state for optimistic UI updates during drag-and-drop
  const [localDirs, setLocalDirs] = useState<SourceDirectory[]>(directories);
  
  useEffect(() => {
    setLocalDirs(directories);
  }, [directories]);

  const selectedDir = localDirs.find(d => d.id === selectedId);
  const filteredDirs = localDirs.filter(d => d.label.toLowerCase().includes(search.toLowerCase()));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localDirs.findIndex((d) => d.id === active.id);
      const newIndex = localDirs.findIndex((d) => d.id === over.id);
      const newDirs = arrayMove(localDirs, oldIndex, newIndex);
      
      setLocalDirs(newDirs);
      
      try {
        const ids = newDirs.map(d => d.id);
        await invoke('update_source_directories_order', { ids });
        onDirectoriesChange();
      } catch (err) {
        console.error(err);
        setLocalDirs(directories);
      }
    }
  };

  const handleSetIcon = async (id: string, icon: string | null) => {
    try {
      await invoke('update_source_directory_icon', { id, icon });
      onDirectoriesChange();
    } catch (err) {
      console.error(err);
    }
    setIconPickerId(null);
    setMenuOpenId(null);
    setMenuPos(null);
  };

  const handleDelete = async (dir: SourceDirectory, deleteLocal: boolean) => {
    try {
      if (deleteLocal && !window.confirm(`确定要从磁盘彻底删除文件夹 "${dir.label}" 及其全部内容吗？此操作不可恢复！`)) {
        return;
      }
      await invoke('remove_source_directory', { id: dir.id, deleteLocal });
      onDirectoriesChange();
      // If selected was deleted, select first available
      if (selectedId === dir.id) {
        const next = directories.find(d => d.id !== dir.id);
        if (next) onSelect(next.id);
      }
    } catch (err) {
      alert(`移除失败: ${err}`);
    }
    setMenuOpenId(null);
    setMenuPos(null);
  };

  const handleOpenLocalFolder = async (path: string) => {
    try {
      await invoke('open_local_folder', { path });
    } catch (err) {
      console.error("Failed to open folder", err);
    }
    setMenuOpenId(null);
    setMenuPos(null);
  };

  return (
    <div className="relative mb-4 px-3" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-1.5 rounded-md bg-transparent hover:bg-black/5 transition-all group outline-none select-none active:scale-[0.98]"
      >
        <div className="flex items-center space-x-2.5 overflow-hidden min-w-0">
          <div className="w-6 h-6 rounded flex items-center justify-center shrink-0 bg-[#f0f3f6]">
            {selectedDir?.icon ? (
              <span className="text-sm">{selectedDir.icon}</span>
            ) : (
              <Folder className="w-4 h-4 text-blue-600" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1 text-left">
            <span className="font-semibold text-sm truncate text-[var(--foreground)] leading-tight">
              {selectedDir ? selectedDir.label : "未命名技能库"}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center w-5 h-5 rounded hover:bg-black/5 shrink-0 text-[var(--color-muted)] group-hover:text-[var(--foreground)]">
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-3 right-3 mt-1 bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-[100] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col max-h-[400px]">
          
          {/* Search Bar */}
          <div className="p-1.5 pb-1">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="搜索技能库..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-black/5 border-none rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all placeholder:text-[var(--color-muted)]"
              />
            </div>
          </div>

          {/* Directory List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={filteredDirs.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredDirs.map(dir => (
                  <SortableItem key={dir.id} id={dir.id}>
                    <div 
                      className={`relative flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] transition-colors group cursor-pointer
                        ${selectedId === dir.id ? 'bg-blue-50 text-blue-600 font-medium' : 'text-[var(--foreground)] hover:bg-black/5 font-normal'}
                        ${activeId === dir.id ? 'opacity-40' : ''}
                      `}
                    >
                      <div 
                        className="flex items-center flex-1 min-w-0"
                        onClick={() => { onSelect(dir.id); setIsOpen(false); }}
                      >
                        <div className="w-5 h-5 flex items-center justify-center shrink-0 mr-1.5">
                          {dir.icon ? (
                            <span className="text-[14px]">{dir.icon}</span>
                          ) : (
                            <Folder className={`w-3.5 h-3.5 ${selectedId === dir.id ? 'text-blue-500' : 'text-[var(--color-muted)] group-hover:text-[var(--foreground)]'}`} />
                          )}
                        </div>
                        {renamingId === dir.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSubmit(dir.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onBlur={() => handleRenameSubmit(dir.id)}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="bg-white border border-blue-400 rounded px-1.5 py-0.5 text-[13px] text-[var(--foreground)] outline-none w-full max-w-[140px] shadow-sm"
                          />
                        ) : (
                          <span className="truncate">{dir.label}</span>
                        )}
                      </div>
                      
                      <div className="flex items-center shrink-0 space-x-1">
                        {/* 3 dots menu */}
                        <button
                          data-menu-button="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuOpenId === dir.id) {
                              setMenuOpenId(null);
                              setIconPickerId(null);
                              setMenuPos(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setMenuOpenId(dir.id);
                              setIconPickerId(null);
                              setMenuPos({
                                top: rect.top,
                                left: rect.left,
                                right: rect.right,
                                bottom: rect.bottom
                              });
                            }
                          }}
                          className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${menuOpenId === dir.id ? 'opacity-100 bg-black/5' : 'hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {selectedId === dir.id && (
                          <div className="w-4 flex justify-center">
                            <Check className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                        )}
                      </div>
                    </div>
                  </SortableItem>
                ))}
              </SortableContext>
              
              <DragOverlay dropAnimation={null}>
                {activeId ? (
                  (() => {
                    const dir = localDirs.find(d => d.id === activeId);
                    if (!dir) return null;
                    const isSelected = selectedId === dir.id;
                    return (
                      <div 
                        className={`relative flex items-center justify-between px-2 py-1.5 rounded-lg text-[13px] shadow-lg cursor-grabbing w-full box-border m-0
                          ${isSelected ? 'bg-blue-50 text-blue-600 font-medium' : 'bg-white text-[var(--foreground)]'}
                        `}
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          <div className="w-5 h-5 flex items-center justify-center shrink-0 mr-1.5">
                            {dir.icon ? (
                              <span className="text-[14px]">{dir.icon}</span>
                            ) : (
                              <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-500' : 'text-[var(--color-muted)]'}`} />
                            )}
                          </div>
                          <span className="truncate">{dir.label}</span>
                        </div>
                        <div className="flex items-center shrink-0 space-x-1">
                          <button className="p-1 rounded text-[var(--color-muted)] opacity-50">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                          {isSelected && (
                            <div className="w-4 flex justify-center">
                              <Check className="w-3.5 h-3.5 text-blue-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : null}
              </DragOverlay>
            </DndContext>
            {filteredDirs.length === 0 && (
              <div className="text-center py-4 text-[12px] text-[var(--color-muted)]">
                没有找到匹配的技能库
              </div>
            )}
          </div>

          {/* Action Menu */}
          <div className="p-1.5 pt-1 space-y-0.5">
            <div className="h-px bg-black/[0.06] my-1.5 mx-1" />
            <button
              onClick={() => { setIsOpen(false); onCreateLibrary(); }}
              className="flex items-center px-2 py-1.5 w-full justify-start rounded-lg text-[13px] text-[var(--foreground)] hover:bg-black/5 transition-all group"
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-2 bg-black/[0.04] rounded-md group-hover:bg-black/[0.08] transition-colors">
                <Plus className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              </div>
              创建技能库
            </button>
            <button
              onClick={() => { setIsOpen(false); onOpenLibrary(); }}
              className="flex items-center px-2 py-1.5 w-full justify-start rounded-lg text-[13px] text-[var(--foreground)] hover:bg-black/5 transition-all group"
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-2 bg-black/[0.04] rounded-md group-hover:bg-black/[0.08] transition-colors">
                <Folder className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              </div>
              打开其它技能库
            </button>
            <button
              onClick={() => { setIsOpen(false); onMergeLibrary(); }}
              className="flex items-center px-2 py-1.5 w-full justify-start rounded-lg text-[13px] text-[var(--foreground)] hover:bg-black/5 transition-all group"
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0 mr-2 bg-black/[0.04] rounded-md group-hover:bg-black/[0.08] transition-colors">
                <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              </div>
              合并其它技能库
            </button>
          </div>
        </div>
      )}
      {(() => {
        if (!menuOpenId || !menuPos) return null;
        const dir = directories.find(d => d.id === menuOpenId);
        if (!dir) return null;

        const isIconPicker = iconPickerId === dir.id;
        const menuWidth = isIconPicker ? 220 : 160;
        const menuHeight = isIconPicker ? 210 : 180;

        let left = menuPos.right - menuWidth;
        if (left < 10) left = 10;
        if (left + menuWidth > window.innerWidth - 10) {
          left = window.innerWidth - menuWidth - 10;
        }

        const spaceBelow = window.innerHeight - menuPos.bottom;
        const top = spaceBelow >= menuHeight + 10
          ? menuPos.bottom + 4
          : Math.max(10, menuPos.top - menuHeight - 4);

        return createPortal(
          <div 
            ref={menuRef}
            style={{ top: `${top}px`, left: `${left}px` }}
            className="fixed bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-xl shadow-[0_12px_36px_rgb(0,0,0,0.16)] py-1 z-[99999] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {isIconPicker ? (
              <div className="p-2 w-[220px] grid grid-cols-6 gap-1 max-h-48 overflow-y-auto">
                {EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => handleSetIcon(dir.id, emoji)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-black/5 text-lg transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-40">
                <button 
                  onClick={() => setIconPickerId(dir.id)}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-black/5 transition-colors"
                >
                  <Smile className="w-3.5 h-3.5 mr-2 text-[var(--color-muted)]" />
                  更改图标
                </button>
                {dir.icon && (
                  <button 
                    onClick={() => handleSetIcon(dir.id, null)}
                    className="w-full flex items-center px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-black/5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2 text-[var(--color-muted)]" />
                    移除图标
                  </button>
                )}
                <div className="h-px bg-[var(--color-border)]/60 my-1" />
                <button 
                  onClick={() => {
                    setRenamingId(dir.id);
                    setRenameValue(dir.label);
                    setMenuOpenId(null);
                  }}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-black/5 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 mr-2 text-[var(--color-muted)]" />
                  修改名称
                </button>
                <button 
                  onClick={() => handleDelete(dir, false)}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-black/5 transition-colors"
                >
                  从列表删除
                </button>
                <button 
                  onClick={() => handleDelete(dir, true)}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                >
                  彻底删除(本地)
                </button>
                <div className="h-px bg-[var(--color-border)]/60 my-1" />
                <button 
                  onClick={() => handleOpenLocalFolder(dir.path)}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-black/5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 mr-2 text-[var(--color-muted)]" />
                  打开本地文件夹
                </button>
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
