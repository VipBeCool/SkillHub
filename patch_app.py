import re

with open('src/App.tsx', 'r') as f:
    content = f.read()

# Replace 1: Header ViewMode Toggle
search1 = '''              <div className="flex items-center space-x-3">
                <button onClick={() => handleSyncAll(true, directories.filter(d => d.id === selectedWorkspaceId))} disabled={isSyncingAll} className="flex items-center space-x-1 px-2 py-1 rounded-md font-medium text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all disabled:opacity-50">'''

replace1 = '''              <div className="flex items-center space-x-3">
                {!selectedRepoId && !isFlatView && (
                  <div className="flex bg-black/5 rounded-lg p-0.5 mr-2">
                    <button
                      onClick={() => setViewMode('categorized')}
                      className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                        viewMode === 'categorized' 
                          ? 'bg-white shadow-sm text-[var(--foreground)]' 
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      分类
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                        viewMode === 'grid' 
                          ? 'bg-white shadow-sm text-[var(--foreground)]' 
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      平铺
                    </button>
                  </div>
                )}
                <button onClick={() => handleSyncAll(true, directories.filter(d => d.id === selectedWorkspaceId))} disabled={isSyncingAll} className="flex items-center space-x-1 px-2 py-1 rounded-md font-medium text-[12px] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all disabled:opacity-50">'''

if search1 in content:
    content = content.replace(search1, replace1)
else:
    print("Search 1 not found!")

# Replace 2: onMove logic
search2 = '''                if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                  selection.clearSelection();
                  if (!selectedRepoId && !isFlatView) {
                    setSelectedRepoIds(new Set());
                  } else {
                    setSelectedSkillIds(new Set());
                  }
                }
              }}
              onMove={({ store: { changed: { added, removed } } }: SelectionEvent) => {
                isDraggingRef.current = true;
                if (!selectedRepoId && !isFlatView) {
                  setSelectedRepoIds(prev => {
                    const next = new Set(prev);
                    added.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.add(id);
                    });
                    removed.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.delete(id);
                    });
                    return next;
                  });
                  setInspectorSelectedType('repo');
                } else {
                  setSelectedSkillIds(prev => {
                    const next = new Set(prev);
                    added.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.add(id);
                    });
                    removed.forEach((el: Element) => {
                      const id = el.getAttribute('data-id');
                      if (id) next.delete(id);
                    });
                    return next;
                  });
                  setInspectorSelectedType('skill');
                }
              }}'''

replace2 = '''                if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
                  selection.clearSelection();
                  setSelectedRepoIds(new Set());
                  setSelectedSkillIds(new Set());
                }
              }}
              onMove={({ store: { changed: { added, removed } } }: SelectionEvent) => {
                isDraggingRef.current = true;
                let lastAddedType: 'repo' | 'skill' | null = null;
                
                setSelectedRepoIds(prev => {
                  const next = new Set(prev);
                  added.forEach((el: Element) => {
                    const id = el.getAttribute('data-id');
                    const type = el.getAttribute('data-type');
                    if (id && type === 'repo') {
                      next.add(id);
                      lastAddedType = 'repo';
                    }
                  });
                  removed.forEach((el: Element) => {
                    const id = el.getAttribute('data-id');
                    const type = el.getAttribute('data-type');
                    if (id && type === 'repo') next.delete(id);
                  });
                  return next;
                });
                
                setSelectedSkillIds(prev => {
                  const next = new Set(prev);
                  added.forEach((el: Element) => {
                    const id = el.getAttribute('data-id');
                    const type = el.getAttribute('data-type');
                    if (id && type === 'skill') {
                      next.add(id);
                      lastAddedType = 'skill';
                    }
                  });
                  removed.forEach((el: Element) => {
                    const id = el.getAttribute('data-id');
                    const type = el.getAttribute('data-type');
                    if (id && type === 'skill') next.delete(id);
                  });
                  return next;
                });
                
                if (lastAddedType) {
                  setInspectorSelectedType(lastAddedType);
                }
              }}'''

if search2 in content:
    content = content.replace(search2, replace2)
else:
    print("Search 2 not found!")

# Replace 3: Layout
search3_start = '''            ) : !selectedRepoId && !isFlatView ? (
              <>
                <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>'''

replace3_start = '''            ) : !selectedRepoId && !isFlatView ? (
              viewMode === 'categorized' ? (
                <CategorizedView
                  repos={filteredGroupedRepos}
                  cloningRepos={cloningRepos}
                  selectedRepoIds={selectedRepoIds}
                  selectedSkillIds={selectedSkillIds}
                  onSelectRepo={handleSelectRepo}
                  onSelectSkill={(skill, repo, e) => {
                    handleSelectSkill(skill, e);
                  }}
                  onDoubleClickRepo={(repoId) => {
                    setSelectedRepoId(repoId);
                    setInspectorSelectedType('repo');
                    setSelectedRepoIds(new Set([repoId]));
                    setSelectedSkillIds(new Set());
                  }}
                  onDoubleClickSkill={(skill, repo) => {
                    handleSkillDoubleClick(skill);
                  }}
                  onContextMenuRepo={(e, repo) => {
                    if (!selectedRepoIds.has(repo.id)) handleSelectRepo(repo, e);
                    showContextMenu(e, { type: 'repo', data: repo });
                  }}
                  onContextMenuSkill={(e, skill) => {
                    if (!selectedSkillIds.has(skill.id)) handleSelectSkill(skill, e);
                    showContextMenu(e, { type: 'skill', data: skill });
                  }}
                  handleCancelClone={handleCancelClone}
                />
              ) : (
              <>
                <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>'''

if search3_start in content:
    content = content.replace(search3_start, replace3_start)
else:
    print("Search 3 start not found!")

search3_end = '''                      onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                    />
                  ))}
                </div>
              </>
            ) : ('''

replace3_end = '''                      onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                    />
                  ))}
                </div>
              </>
              )
            ) : ('''

if search3_end in content:
    content = content.replace(search3_end, replace3_end)
else:
    print("Search 3 end not found!")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Patch complete")
