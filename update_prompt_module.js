const fs = require('fs');
let code = fs.readFileSync('src/PromptModule.tsx', 'utf8');

// Add targetLang state
code = code.replace(
  'const [translatingId, setTranslatingId] = useState<string | null>(null);',
  'const [translatingId, setTranslatingId] = useState<string | null>(null);\n  const [targetLang, setTargetLang] = useState("zh-CN");'
);

// Fix translate_text call
code = code.replace(
  'invoke<string>("translate_text", { text: p.content, targetLang: "zh-CN" });',
  'invoke<string>("translate_text", { text: p.content, targetLang });'
);

// Fix SelectionArea container
code = code.replace(
  '<SelectionArea\n            className="container"',
  '<SelectionArea\n            className="min-h-full"'
);

// We will fix handleCardSelect and remove handleSelectPrompt usage where unnecessary
fs.writeFileSync('src/PromptModule.tsx', code);