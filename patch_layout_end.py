with open('src/App.tsx', 'r') as f:
    content = f.read()

search = '''                      onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>'''

replace = '''                      onDeleteRepo={(e, r) => handleDeleteRepos(e, [r])}
                    />
                  ))}
                </div>
              </>
              )
            ) : (
              <>
                <div className="flex-1 grid gap-3 content-start px-6 pt-3 pb-20" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>'''

if search in content:
    content = content.replace(search, replace)
    with open('src/App.tsx', 'w') as f:
        f.write(content)
    print("Patched end of layout")
else:
    print("Could not find end of layout block")
