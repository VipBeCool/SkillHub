import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { Folder, Plus, Search, MoreHorizontal, Smile, Trash2, ExternalLink, ArrowRightLeft, Check, Edit2, ChevronsUpDown, MinusCircle, GripVertical, Layers, AlertCircle, X } from 'lucide-react';
import { SourceDirectory } from '../../types';
import { Tooltip, TooltipProvider } from '../ui/Tooltip';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragOverlay, Modifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableItem({ id, children }: { id: string, children: (dragHandleProps: Record<string, any>) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0 : 1,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ ...attributes, ...listeners })}
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

export interface SkillLibrarySelectorRef {
  closeMenu: () => void;
  openDropdown: () => void;
}

export const SkillLibrarySelector = forwardRef<SkillLibrarySelectorRef, SkillLibrarySelectorProps>(({ 
  directories, 
  selectedId, 
  onSelect, 
  onDirectoriesChange,
  onCreateLibrary,
  onOpenLibrary,
  onMergeLibrary
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [popupX, setPopupX] = useState(0);
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [iconPickerId, setIconPickerId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; right: number; bottom: number } | null>(null);
  
  useImperativeHandle(ref, () => ({
    closeMenu: () => {
      setMenuOpenId(null);
      setIconPickerId(null);
      setMenuPos(null);
    },
    openDropdown: () => {
      setIsOpen(true);
    }
  }));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const innerMenuRef = useRef<HTMLDivElement>(null);

  const clipToMenuModifier: Modifier = ({ transform }) => {
    if (innerMenuRef.current) {
      const rect = innerMenuRef.current.getBoundingClientRect();
      return {
        ...transform,
        x: transform.x - rect.left,
        y: transform.y - rect.top,
      };
    }
    return transform;
  };

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirmDir, setDeleteConfirmDir] = useState<SourceDirectory | null>(null);

  const confirmDelete = async () => {
    if (!deleteConfirmDir) return;
    try {
      await invoke('remove_source_directory', { id: deleteConfirmDir.id, deleteLocal: true });
      onDirectoriesChange();
      if (selectedId === deleteConfirmDir.id) {
        const next = directories.find(d => d.id !== deleteConfirmDir.id);
        onSelect(next ? next.id : '');
      }
      setMenuOpenId(null);
    } catch (error) {
      console.error('Failed to remove directory:', error);
    } finally {
      setDeleteConfirmDir(null);
    }
  };

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
      if (deleteLocal) {
        setDeleteConfirmDir(dir);
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
        onClick={(e) => {
          if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            setPopupX(Math.max(0, e.clientX - rect.left + 10));
          }
          setIsOpen(!isOpen);
        }}
        className="flex items-center p-1.5 rounded-md bg-transparent hover:bg-black/5 transition-all group outline-none select-none active:scale-[0.98] max-w-full w-fit"
      >
        {selectedDir?.is_missing && !selectedDir.icon ? (
          <div className="relative w-6 h-6 flex items-center justify-center shrink-0 mr-2.5 rounded-md border border-dashed border-gray-400 bg-transparent">
            <Layers className="w-3.5 h-3.5 text-gray-400" />
            <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center border-[1.5px] border-white shadow-sm z-10">
              <AlertCircle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
            </div>
          </div>
        ) : (
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mr-2.5 ${!selectedDir?.icon ? 'bg-blue-500' : 'bg-[#f0f3f6]'}`}>
            {selectedDir?.icon ? (
              <span className="text-sm">{selectedDir.icon}</span>
            ) : (
              <Layers className="w-3.5 h-3.5 text-white fill-white/20" />
            )}
          </div>
        )}
        <span className="font-semibold text-sm truncate text-[var(--foreground)] leading-tight shrink">
          {selectedDir ? selectedDir.label : "暂无技能库"}
        </span>
        <div className="flex items-center justify-center w-5 h-5 rounded hover:bg-black/5 shrink-0 text-[var(--color-muted)] group-hover:text-[var(--foreground)] ml-1">
          <ChevronsUpDown className="w-3.5 h-3.5" />
        </div>
      </button>

      {isOpen && (
        <div 
          className="absolute top-0 mt-0 w-max min-w-[380px] max-w-[500px] bg-white/95 backdrop-blur-2xl border border-black/[0.08] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-[100] animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col max-h-[70vh]"
          style={{ left: `${popupX}px` }}
        >
          <div ref={innerMenuRef} className="relative w-full h-full flex flex-col overflow-hidden rounded-xl" style={{ transform: 'translate3d(0,0,0)' }}>
          <TooltipProvider delayDuration={800}>
          
          {/* Search Bar */}
          <div className="p-2 border-b border-black/5 flex items-center">
            <div className="relative flex items-center flex-1">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none" />
              <input
                type="text"
                placeholder="搜索技能库..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-transparent border-none rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-[var(--foreground)] outline-none focus:ring-0 transition-all placeholder:text-[var(--color-muted)]"
              />
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="ml-1 mr-1 w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0"
              title="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Directory List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={filteredDirs.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                {filteredDirs.map(dir => {
                  const parentPath = dir.path.includes('\\') 
                    ? dir.path.split('\\').slice(0, -1).join('\\') || '\\'
                    : dir.path.split('/').slice(0, -1).join('/') || '/';
                  
                  return (
                    <SortableItem key={dir.id} id={dir.id}>
                      {(dragHandleProps) => (
                        <div 
                          className={`relative flex items-center justify-between px-1 py-1.5 rounded-lg text-[13px] transition-colors group
                            ${selectedId === dir.id ? 'text-blue-600 font-medium' : (activeId ? '' : 'text-[var(--foreground)] hover:bg-black/5 font-normal')}
                            ${activeId ? 'pointer-events-none' : ''}
                          `}
                        >
                          <div className="flex items-center flex-1 min-w-0">
                            {/* Drag Handle */}
                            <div 
                              {...dragHandleProps}
                              className="flex items-center justify-center shrink-0 w-6 h-6 mx-0.5 text-black/20 hover:text-black/40 cursor-grab active:cursor-grabbing transition-colors"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>

                            {/* Icon */}
                            {dir.icon ? (
                              <div 
                                className={`relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md cursor-pointer ${dir.is_missing ? 'border border-dashed border-gray-400 bg-transparent' : 'bg-blue-500 text-white'}`}
                                onClick={() => { onSelect(dir.id); setIsOpen(false); }}
                              >
                                <span className={`text-[14px] ${dir.is_missing ? 'opacity-60 grayscale' : ''}`}>{dir.icon}</span>
                                {dir.is_missing && (
                                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10">
                                    <AlertCircle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                            ) : dir.is_missing ? (
                              <div 
                                className="relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md border border-dashed border-gray-400 bg-transparent cursor-pointer"
                                onClick={() => { onSelect(dir.id); setIsOpen(false); }}
                              >
                                <Layers className="w-3.5 h-3.5 text-gray-400" />
                                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center border-[1.5px] border-white shadow-sm z-10">
                                  <AlertCircle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                </div>
                              </div>
                            ) : (
                              <div 
                                className="relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md bg-blue-500 cursor-pointer"
                                onClick={() => { onSelect(dir.id); setIsOpen(false); }}
                              >
                                <Layers className="w-3.5 h-3.5 text-white fill-white/20" />
                              </div>
                            )}
                            
                            {/* Name and Path */}
                            <div 
                              className="flex items-baseline flex-1 min-w-0 cursor-pointer"
                              onClick={() => { onSelect(dir.id); setIsOpen(false); }}
                            >
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
                                  className="bg-white border border-blue-400 rounded px-1.5 py-0.5 text-[13px] text-[var(--foreground)] outline-none w-full max-w-full shadow-sm"
                                />
                              ) : (
                                <>
                                  <span className={`truncate shrink-0 max-w-full ${dir.is_missing ? 'opacity-50' : ''}`}>{dir.label}</span>
                                  <Tooltip content={dir.path} side="top">
                                    <span className={`truncate text-[11px] text-[var(--color-muted)] ml-1.5 shrink opacity-70 hover:opacity-100 transition-opacity ${dir.is_missing ? 'opacity-30 hover:opacity-50' : ''}`}>{parentPath}</span>
                                  </Tooltip>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center shrink-0 space-x-1 pl-2">
                            {selectedId === dir.id && (
                              <div className="w-4 flex justify-center">
                                <Check className="w-3.5 h-3.5 text-blue-500" />
                              </div>
                            )}
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
                              className={`p-1 rounded transition-colors ${menuOpenId === dir.id ? 'bg-black/5 text-[var(--foreground)]' : 'hover:bg-black/5 text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  );
                })}
              </SortableContext>
              
              {innerMenuRef.current && createPortal(
                <DragOverlay dropAnimation={null} modifiers={[clipToMenuModifier]}>
                  {activeId ? (
                    (() => {
                      const dir = localDirs.find(d => d.id === activeId);
                      if (!dir) return null;
                      const isSelected = selectedId === dir.id;
                      const parentPath = dir.path.includes('\\') 
                        ? dir.path.split('\\').slice(0, -1).join('\\') || '\\'
                        : dir.path.split('/').slice(0, -1).join('/') || '/';

                      return (
                        <div 
                          className={`relative flex items-center justify-between px-1 py-1.5 rounded-lg text-[13px] shadow-lg cursor-grabbing box-border m-0 bg-white
                            ${isSelected ? 'text-blue-600 font-medium' : 'text-[var(--foreground)] border border-black/5'}
                          `}
                        >
                          <div className="flex items-center flex-1 min-w-0">
                            <div className="flex items-center justify-center shrink-0 w-6 h-6 mx-0.5 text-black/40">
                              <GripVertical className="w-3.5 h-3.5" />
                            </div>
                            
                            {dir.icon ? (
                              <div className={`relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md ${dir.is_missing ? 'border border-dashed border-gray-400 bg-transparent' : 'bg-blue-500 text-white'}`}>
                                <span className={`text-[14px] ${dir.is_missing ? 'opacity-60 grayscale' : ''}`}>{dir.icon}</span>
                                {dir.is_missing && (
                                  <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10">
                                    <AlertCircle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                            ) : dir.is_missing ? (
                              <div className="relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md border border-dashed border-gray-400 bg-transparent">
                                <Layers className="w-3.5 h-3.5 text-gray-400" />
                                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-orange-500 rounded-full flex items-center justify-center border-[1.5px] border-white shadow-sm z-10">
                                  <AlertCircle className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                                </div>
                              </div>
                            ) : (
                              <div className="relative w-6 h-6 flex items-center justify-center shrink-0 mr-1.5 rounded-md bg-blue-500">
                                <Layers className="w-3.5 h-3.5 text-white fill-white/20" />
                              </div>
                            )}

                            <div className="flex items-baseline flex-1 min-w-0">
                              <span className={`truncate shrink-0 max-w-full font-medium ${dir.is_missing ? 'opacity-50' : ''}`}>{dir.label}</span>
                              <span className={`truncate text-[11px] text-[var(--color-muted)] ml-1.5 shrink opacity-70 ${dir.is_missing ? 'opacity-30' : ''}`}>{parentPath}</span>
                            </div>
                          </div>
                          <div className="flex items-center shrink-0 space-x-1 pl-2">
                            {isSelected && (
                              <div className="w-4 flex justify-center">
                                <Check className="w-3.5 h-3.5 text-blue-500" />
                              </div>
                            )}
                            <button className="p-1 rounded text-[var(--color-muted)]">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })()
                  ) : null}
                </DragOverlay>,
                innerMenuRef.current
              )}
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
          </TooltipProvider>
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
                  <MinusCircle className="w-3.5 h-3.5 mr-2 text-[var(--color-muted)]" />
                  从列表删除
                </button>
                <button 
                  onClick={() => handleDelete(dir, true)}
                  className="w-full flex items-center px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2 text-red-500/70" />
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
        {/* Delete Confirmation Dialog */}
      {deleteConfirmDir && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center">
          {/* Glassmorphism Mask */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200" 
            onClick={() => setDeleteConfirmDir(null)}
          />
          
          {/* Dialog Box */}
          <div className="relative bg-white/95 backdrop-blur-xl border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between relative">
              <h2 className="text-lg font-medium text-[var(--foreground)] flex-1 text-left flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                彻底删除技能库
              </h2>
              <button onClick={() => setDeleteConfirmDir(null)} className="absolute right-4 p-1.5 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Content */}
            <div className="p-6">
              <p className="text-[14px] text-[var(--foreground)] leading-relaxed text-left">
                确定要从磁盘彻底删除文件夹 <span className="font-semibold">"{deleteConfirmDir.label}"</span> 及其全部内容吗？<br/>此操作不可恢复！
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-[var(--color-border)] bg-black/[0.02] flex justify-end items-center gap-3">
              <button
                onClick={() => setDeleteConfirmDir(null)}
                className="px-4 py-2 text-[13px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                彻底删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
});
