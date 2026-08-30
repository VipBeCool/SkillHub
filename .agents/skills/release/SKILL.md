---
name: release
description: >-
  SkillHub 应用的标准发布流程。当用户说"发布 x.x.x 版本"、"打包发布"、"发新版本"
  时激活此 Skill。严格按照以下步骤顺序执行，不得跳步或并行操作。
---

# SkillHub 发布流程

> [!CAUTION]
> **必须严格按顺序执行以下每一步，不得跳步。**
> 每一步都必须确认成功后才能进入下一步。

---

## 前置条件

- 用户必须提供**目标版本号**（如 `0.2.1`）
- 如果用户未提供 Changelog 内容，则根据 `git log` 自动生成
- 工作目录：`/Users/becool/Documents/APP开发/Skill管理助手/SkillHub`

---

## Step 1: 代码检查

**在做任何版本号修改之前，先确保代码能编译通过。**

```bash
npx tsc --noEmit
```

- ✅ 必须 exit code 0，无任何错误
- ❌ 如果有错误，**必须先修复**再继续，不要带着错误发布

---

## Step 2: 更新版本号

需要同时更新以下 **2 个文件**中的版本号：

| 文件 | 字段 |
|------|------|
| `package.json` | `"version"` |
| `src-tauri/tauri.conf.json` | `"version"` |

使用 `sed` 命令替换，例如将 `0.2.0` 升级到 `0.2.1`：

```bash
sed -i '' 's/"version": "旧版本"/"version": "新版本"/' package.json
sed -i '' 's/"version": "旧版本"/"version": "新版本"/' src-tauri/tauri.conf.json
```

**验证**：替换后用 `grep` 确认两个文件中的版本号都已正确更新。

---

## Step 3: 更新 CHANGELOG.md

在 `CHANGELOG.md` 文件**最顶部的版本条目之前**插入新版本的更新日志。

格式要求：
```markdown
## [x.x.x] - YYYY-MM-DD
### 新增特性
- **功能名称**：功能描述。

### 优化与修复
- **优化项**：优化描述。
```

- 日期使用当天日期
- 如果用户提供了 Changelog 内容，按用户要求编写
- 如果用户未提供，根据上一个 tag 以来的 `git log --oneline` 自动总结

---

## Step 4: 一次性提交所有文件

> [!WARNING]
> **必须把所有改动（包括代码修改、新文件、版本号、Changelog）一次性全部提交。**
> 绝不能只提交部分文件，否则会导致构建失败。

```bash
git add -A
git status  # 确认所有修改都已暂存，不应有未跟踪或未暂存的文件
git commit -m "chore: release x.x.x"
```

**验证**：执行 `git status` 确认工作区干净（`nothing to commit, working tree clean`）。

---

## Step 5: 打 Tag 并推送

> [!IMPORTANT]
> **必须先推送 commit，再推送 tag。不能反过来。**
> Tag 必须指向最新的 commit，否则 CI 会因为 ref 不匹配而失败。

```bash
git push origin main
git tag v{版本号}
git push origin v{版本号}
```

**注意**：如果是修正发布（需要重新打 tag），流程如下：
```bash
git push origin :refs/tags/v{版本号}   # 先删除远端旧 tag
# ... 修改代码并提交 ...
git tag -f v{版本号}                    # 本地重新打 tag
git push -f origin main                # 强制推送最新 commit
git push origin v{版本号}              # 推送新 tag
```

---

## Step 6: 确认 CI 构建

推送 tag 后，GitHub Actions 会自动触发 `.github/workflows/release.yml`。

告知用户：
1. 构建通常需要 **5-10 分钟**
2. 可以在 GitHub → Actions 页面查看构建进度
3. 构建完成后会在 Releases 页面自动发布

---

## 常见问题排查

### 出现多个 CI 流程
**原因**：在第一次推送 tag 后又删除重建了 tag，导致触发了多次。
**预防**：严格按 Step 4 确认所有文件已提交后再 push。

### Release 没有 Changelog
**原因**：`release.yml` 中的正则表达式匹配失败。
**检查**：确认 `CHANGELOG.md` 中的版本号格式为 `## [x.x.x] - YYYY-MM-DD`。

### TypeScript 编译错误导致构建失败
**原因**：Tauri 构建前会执行 `npm run build`，Vite 默认会检查 TypeScript 错误。
**预防**：Step 1 中已要求先 `tsc --noEmit` 通过。

### Windows SmartScreen 拦截
**原因**：没有 EV 代码签名证书，SmartScreen 会对未签名的 .exe 弹出警告。
**现状**：暂不处理，用户需点击"更多信息" → "仍然运行"。

---

## 打包产物清单

当前配置下，每次发布会生成以下安装包：

| 平台 | 格式 | 说明 |
|------|------|------|
| macOS (Universal) | `.dmg` | 同时支持 Intel 和 Apple Silicon |
| Windows (x64) | `.exe` (NSIS) | 标准安装程序 |
| Linux (x64) | `.deb` | Debian/Ubuntu 安装包 |
| Linux (x64) | `.AppImage` | 免安装可执行文件 |

每个安装包还会附带一个 `.sig` 签名文件（用于应用内自动更新校验），以及一个 `latest.json`（更新检测端点）。

总计约 **9 个 Assets**。

---

## 配置文件位置

| 文件 | 用途 |
|------|------|
| `.github/workflows/release.yml` | CI 发布流程 |
| `src-tauri/tauri.conf.json` | Tauri 打包配置（版本号、targets、更新器） |
| `package.json` | 前端版本号 |
| `CHANGELOG.md` | 版本更新日志 |
