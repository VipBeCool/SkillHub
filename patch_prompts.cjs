const fs = require('fs');
const path = 'src-tauri/src/commands.rs';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
/请阅读上述文件，按照其中定义的角色、规则和工作流程执行任务。/,
`请阅读上述文件，按照其中定义的角色、规则和工作流程执行任务。

### 执行指令
请主动读取包含此入口文件的所在目录结构。如果该目录下存在 \`scripts\`、\`references\`、\`assets\`、\`agents\` 等配套文件夹或其他相关文件，请务必一并阅读并结合相对路径进行理解。**不要仅仅只阅读入口文件本身。**在执行任务前，请确认你已掌握了该技能所需的全部配套上下文。`
);

content = content.replace(
/请先阅读目录下的 \{entry_file_name\}，技能配套的脚本和文档均在上述目录内。/,
`请先阅读目录下的 {entry_file_name}，技能配套的脚本和文档均在上述目录内。

### 执行指令
请主动读取完整的技能目录结构。务必探索并加载配套的 \`scripts\`、\`references\`、\`assets\`、\`agents\` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件（{entry_file_name}）本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。`
);

content = content.replace(
/请先阅读目录下的 \{entry_file_name\}。/,
`请先阅读目录下的 {entry_file_name}。

### 执行指令
请主动读取完整的技能目录结构。务必探索并加载配套的 \`scripts\`、\`references\`、\`assets\`、\`agents\` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件（{entry_file_name}）本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。`
);

content = content.replace(
/请先阅读上述文件。技能的所有配套脚本、文档、模板、示例均在\n仓库目录内，可自由探索：/,
`请先阅读上述入口文件。

### 执行指令
请主动读取完整的技能仓库目录结构。务必探索并加载配套的 \`scripts\`、\`references\`、\`assets\`、\`agents\` 等关联文件夹及其内部文件，保留并理解它们之间的相对目录结构。**不要仅仅只阅读入口文件本身。**在执行任务前，请确认你已掌握并加载了这个 skill 需要的全部配套上下文。技能的所有配套脚本、文档、模板、示例均在仓库目录内，可自由探索：`
);

fs.writeFileSync(path, content, 'utf8');
